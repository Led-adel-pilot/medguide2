'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionStore } from '@/store/sessionStore'; // Import store
import { marked } from 'marked';

export default function Home() {
  // Local state for the initial form inputs
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [complaint, setComplaint] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, string>>({});
  // State for file upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Get state and actions from Zustand store (Corrected destructuring)
  const {
    currentAppStep,
    isLoading,
    error: sessionError,
    currentExplanation,
    currentQuestions,
    structuredPatientExplanation,
    medicalRecord,
    startSession,
    submitAnswers,
    submitParaclinicalImages, // Use the correct action name
    generateRecord,
    generateResultsSkippingParaclinical, // Import the new action
    resetSession,
    // isGeneratingExplanation, // Removed as it's not used directly in this component
    isGeneratingRecord,
  } = useSessionStore();

  // Determine overall loading state based on current step
  const anyLoading = currentAppStep === 'generatingExplanation' || currentAppStep === 'generatingRecord' || isLoading;

  // --- Event Handlers ---

  // Helper function to convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the "data:image/...;base64," prefix
        const base64String = result.split(',')[1];
        if (base64String) {
          resolve(base64String);
        } else {
          reject(new Error(`Failed to extract base64 string from file: ${file.name}`));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const MAX_FILES = 5; // Example limit
      const MAX_SIZE_MB = 5; // Example limit per file
      if (files.length > MAX_FILES) {
          setFileError(`You can upload a maximum of ${MAX_FILES} images.`);
          setSelectedFiles([]);
          event.target.value = ''; // Clear the input
          return;
      }
      const oversizedFiles = files.filter(file => file.size > MAX_SIZE_MB * 1024 * 1024);
      if (oversizedFiles.length > 0) {
          setFileError(`One or more files exceed the ${MAX_SIZE_MB}MB size limit.`);
          setSelectedFiles([]);
           event.target.value = ''; // Clear the input
          return;
      }
      setSelectedFiles(files);
    } else {
      setSelectedFiles([]);
    }
  };

  const handleParaclinicalSubmit = async () => {
    if (selectedFiles.length === 0) {
      setFileError("Please select at least one image file.");
      return;
    }
    setFileError(null);
    // Indicate loading state for file processing? Maybe handled by store action now.

    try {
        console.log(`Processing ${selectedFiles.length} files...`);
        const base64Promises = selectedFiles.map(file => {
            console.log(`Converting ${file.name} (${file.size} bytes)`);
            return fileToBase64(file);
        });
        const imagesBase64 = await Promise.all(base64Promises);
        console.log("Base64 conversion complete.");

        // Call the correct store action
        await submitParaclinicalImages(imagesBase64);

        setSelectedFiles([]); // Clear selection
        // Consider clearing the file input visually if needed (requires ref or other method)

    } catch (error) {
        console.error("Error processing files:", error);
        setFileError(`Error processing files: ${error instanceof Error ? error.message : String(error)}`);
    }
  };


  const handleStartSession = async () => {
    setFormError(null);
    if (!fullName || !age || !gender || !complaint) {
      setFormError("Please fill in all fields (Full Name, Age, Gender, Initial Complaint).");
      return;
    }
    await startSession({ fullName, age, gender, complaint });
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setCurrentAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSuggestionClick = (questionId: string, suggestion: string) => {
    setCurrentAnswers(prev => {
      const existingAnswer = prev[questionId] || '';
      const trimmedExistingAnswer = existingAnswer.trim(); // Check existing answer
      let newAnswer;
      if (trimmedExistingAnswer) { // If there IS existing text
        const processedSuggestion = suggestion.charAt(0).toLowerCase() + suggestion.slice(1);
        newAnswer = existingAnswer + ", " + processedSuggestion;
      } else { // If text area is EMPTY
        newAnswer = suggestion; // Use suggestion as is
      }
      return { ...prev, [questionId]: newAnswer };
    });
  };

  const handleSubmitAnswers = async () => {
    await submitAnswers(currentAnswers);
    setCurrentAnswers({}); // Clear answers for the next set
  };

  const handleDownloadRecord = () => {
    if (!medicalRecord) return;
    const blob = new Blob([medicalRecord], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medical-record.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-4 sm:p-6 md:p-8 bg-muted/40">
      <div className="w-full max-w-3xl space-y-8">

        {/* Welcome Section */}
        {currentAppStep === 'initial' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl">Welcome to MedGuide AI Assistant</CardTitle>
              <CardDescription>
                Your AI-powered guide for preliminary health information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                **Disclaimer:** This tool provides informational suggestions based on AI analysis and does not constitute medical advice. Always consult with a qualified healthcare professional for any health concerns or before making any decisions related to your health or treatment.
              </p>
              {/* Initial data collection Form */}
              <div className="space-y-4 mb-4">
                 <div>
                   <Label htmlFor="full-name">Full Name</Label>
                   <Input id="full-name" placeholder="Enter your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={anyLoading} />
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <Label htmlFor="age">Age</Label>
                     <Input id="age" placeholder="Enter your age" value={age} onChange={(e) => setAge(e.target.value)} disabled={anyLoading} />
                   </div>
                   <div>
                     <Label htmlFor="gender">Gender</Label>
                     <Select value={gender} onValueChange={setGender} disabled={anyLoading}>
                       <SelectTrigger id="gender"><SelectValue placeholder="Select Gender" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Male">Male</SelectItem>
                         <SelectItem value="Female">Female</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
                 <div>
                   <Label htmlFor="initial-complaint">Briefly describe your main symptom or reason for consultation:</Label>
                   <Textarea id="initial-complaint" placeholder="e.g., 'I've had a persistent cough for 3 days.'" value={complaint} onChange={(e) => setComplaint(e.target.value)} disabled={anyLoading} />
                 </div>
              </div>
              {formError && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{formError}</p>}
              {sessionError && currentAppStep === 'initial' && <p className="text-sm text-red-600 dark:text-red-400 mb-4">Error: {sessionError}</p>}
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <Button onClick={handleStartSession} disabled={anyLoading}>
                {isLoading ? 'Starting...' : 'Start New Session'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Interaction Section */}
        {(currentAppStep === 'anamnesis' ||
          currentAppStep === 'paraclinicalUpload' ||
          currentAppStep === 'generatingExplanation' ||
          currentAppStep === 'viewExplanation' ||
          currentAppStep === 'generatingRecord') && (
          <div className="space-y-6">
            {/* Loading Indicator */}
            {(currentAppStep === 'generatingExplanation' || currentAppStep === 'generatingRecord' || (isLoading && currentAppStep === 'anamnesis')) && (
               <Card>
                 <CardContent className="p-6 text-center flex items-center justify-center space-x-3">
                   <div className="spinner" aria-hidden="true"></div>
                   <span>
                     {currentAppStep === 'generatingRecord' ? 'Generating final record...' :
                      currentAppStep === 'generatingExplanation' ? 'Generating patient explanation...' :
                      isLoading ? 'Loading next step...' :
                      'Processing...'}
                   </span>
                 </CardContent>
               </Card>
            )}

            {/* Content for specific steps when NOT loading */}
            {currentAppStep !== 'generatingExplanation' && currentAppStep !== 'generatingRecord' && !isLoading && (
              <>
                {/* Guidance during anamnesis */}
                {currentAppStep === 'anamnesis' && currentExplanation && (
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2"><CardTitle className="text-blue-800 dark:text-blue-300 text-base font-medium">Guidance</CardTitle></CardHeader>
                    <CardContent><p className="text-sm text-blue-700 dark:text-blue-300">{currentExplanation}</p></CardContent>
                  </Card>
                )}

                {/* Q&A Form */}
                {currentAppStep === 'anamnesis' && currentQuestions.length > 0 && (
                  <>
                    <div className="space-y-4">
                      {currentQuestions.map((question) => (
                        <Card key={question.id}>
                          <CardHeader><Label htmlFor={question.id}>{question.text}</Label></CardHeader>
                          <CardContent>
                            <Textarea id={question.id} placeholder="Type your answer here..." value={currentAnswers[question.id] || ''} onChange={(e) => handleAnswerChange(question.id, e.target.value)} disabled={anyLoading} />
                            {question.suggestions && question.suggestions.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {question.suggestions.map((suggestion, index) => (
                                  <Button key={`${question.id}-sug-${index}`} variant="outline" size="sm" onClick={() => handleSuggestionClick(question.id, suggestion)} disabled={anyLoading}>
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSubmitAnswers} disabled={anyLoading}>Submit Answers / Next Step</Button>
                    </div>
                  </>
                )}

                {/* Paraclinical Exam Input Section */}
                {currentAppStep === 'paraclinicalUpload' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Paraclinical Exam Upload</CardTitle>
                      <CardDescription>
                        Upload relevant images (screenshots, scans) of your paraclinical exams (max 5 files, 5MB each).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <div>
                           <Label htmlFor="paraclinical-files">Select Images</Label>
                           <Input
                             id="paraclinical-files"
                             type="file"
                             accept="image/*" // Accept common image types
                             multiple // Allow multiple files
                             onChange={handleFileChange}
                             disabled={anyLoading}
                             className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                           />
                       </div>
                       {/* Display selected file names */}
                       {selectedFiles.length > 0 && (
                         <div className="text-sm text-muted-foreground">
                           <p className="font-medium">Selected files:</p>
                           <ul className="list-disc list-inside">
                             {selectedFiles.map((file, index) => (
                               <li key={index}>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</li>
                             ))}
                           </ul>
                         </div>
                       )}
                       {/* Display file errors */}
                       {fileError && (
                         <p className="text-sm text-red-600 dark:text-red-400">{fileError}</p>
                       )}
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row justify-end gap-2">
                      <Button onClick={handleParaclinicalSubmit} disabled={anyLoading || selectedFiles.length === 0}>
                        Submit Exams & Continue
                      </Button>
                      <Button variant="outline" onClick={generateResultsSkippingParaclinical} disabled={anyLoading}>
                        Skip and Generate Report
                      </Button>
                    </CardFooter>
                  </Card>
                )}

                {/* Patient Explanation & Generate Record Button */}
                {currentAppStep === 'viewExplanation' && structuredPatientExplanation && (
                  <div className="space-y-6">
                    <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                      <CardHeader className="pb-3"><CardTitle className="text-green-800 dark:text-green-300 text-lg">Patient Explanation</CardTitle></CardHeader>
                      <CardContent className="space-y-4 text-sm text-green-700 dark:text-green-300">
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Potential Areas of Concern (Most Likely First):</h4>
                          {structuredPatientExplanation.mostProbableDiagnosis?.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">{structuredPatientExplanation.mostProbableDiagnosis.map((diag, index) => (<li key={`diag-${index}`}>{diag}</li>))}</ul>
                          ) : (<p>Not available.</p>)}
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">General Advice:</h4>
                          <p>{structuredPatientExplanation.advice || "Not available."}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Recommended Specialists (Most Relevant First):</h4>
                           {structuredPatientExplanation.recommendedSpecialists?.length > 0 ? (
                             <ul className="list-disc list-inside space-y-1">{structuredPatientExplanation.recommendedSpecialists.map((spec, index) => (<li key={`spec-${index}`}>{spec}</li>))}</ul>
                           ) : (<p>Not specified.</p>)}
                         </div>
                      </CardContent>
                    </Card>
                    <div className="flex justify-center">
                      <Button onClick={generateRecord} disabled={anyLoading} size="lg">
                        {isGeneratingRecord ? 'Generating Record...' : 'Generate Final Record'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Display Session Error during active steps */}
                {sessionError && !['initial', 'generatingExplanation', 'generatingRecord', 'viewResults'].includes(currentAppStep) && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-4">Error: {sessionError}</p>
                 )}
              </>
            )}
          </div>
        )}

        {/* Results Section */}
        {currentAppStep === 'viewResults' && structuredPatientExplanation && medicalRecord && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl">Consultation Summary</CardTitle>
              <CardDescription>
                Here is a summary based on the information provided. Remember, this is not a diagnosis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Patient Explanation */}
              <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CardHeader className="pb-3"><CardTitle className="text-green-800 dark:text-green-300 text-lg">Patient Explanation</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm text-green-700 dark:text-green-300">
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Potential Areas of Concern (Most Likely First):</h4>
                    {structuredPatientExplanation.mostProbableDiagnosis?.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">{structuredPatientExplanation.mostProbableDiagnosis.map((diag, index) => (<li key={`diag-${index}`}>{diag}</li>))}</ul>
                    ) : (<p>Not available.</p>)}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">General Advice:</h4>
                    <p>{structuredPatientExplanation.advice || "Not available."}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Recommended Specialists (Most Relevant First):</h4>
                     {structuredPatientExplanation.recommendedSpecialists?.length > 0 ? (
                       <ul className="list-disc list-inside space-y-1">{structuredPatientExplanation.recommendedSpecialists.map((spec, index) => (<li key={`spec-${index}`}>{spec}</li>))}</ul>
                     ) : (<p>Not specified.</p>)}
                  </div>
                </CardContent>
              </Card>

              {/* Medical Record Preview */}
              <Card>
                 <CardHeader className="pb-3"><CardTitle className="text-base font-medium">Medical Record (for Healthcare Professional)</CardTitle></CardHeader>
                 <CardContent className="text-sm">
                  <div className="markdown-content max-w-none p-4 bg-muted/50 dark:bg-muted/30 rounded-md border border-border" dangerouslySetInnerHTML={{ __html: marked(medicalRecord || '') }} />
                 </CardContent>
               </Card>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <Button variant="outline" onClick={resetSession} disabled={anyLoading}>Start New Session</Button>
              <Button onClick={handleDownloadRecord} disabled={anyLoading || !medicalRecord}>Download Record (.txt)</Button>
            </CardFooter>
          </Card>
        )}

        {/* Global Error Display (e.g., if error occurs during generation) */}
         {sessionError && (currentAppStep === 'generatingExplanation' || currentAppStep === 'generatingRecord' || currentAppStep === 'errorState') && (
             <Card className="border-red-500">
                 <CardHeader><CardTitle className="text-red-600">Error</CardTitle></CardHeader>
                 <CardContent><p className="text-red-600">{sessionError}</p></CardContent>
                 <CardFooter><Button variant="outline" onClick={resetSession}>Start Over</Button></CardFooter>
             </Card>
         )}

      </div>
    </div>
  );
}
