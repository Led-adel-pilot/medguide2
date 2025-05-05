'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
// Removed duplicate imports below
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select
import { useSessionStore } from '@/store/sessionStore'; // Import Zustand store
import { marked } from 'marked'; // Import marked
// No need to import PatientExplanationData here if we only use it from the store state

export default function Home() {
  // Local state for the initial form inputs
  const [fullName, setFullName] = useState(''); // Added Full Name state
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [complaint, setComplaint] = useState('');
  const [formError, setFormError] = useState<string | null>(null); // Local error for form validation
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, string>>({}); // State for current answers

  // Get state and actions from Zustand store (Updated)
  const {
    isSessionActive,
    isLoading, // General loading for start/next
    isGeneratingExplanation, // Specific loading state
    isGeneratingRecord, // Specific loading state
    error: sessionError,
    currentExplanation,
    currentQuestions,
    isComplete,
    isReadyForRecord,
    structuredPatientExplanation, // Renamed state
    medicalRecord,
    startSession,
    submitAnswers,
    generatePatientExplanation, // New action
    generateRecord,
    resetSession
  } = useSessionStore();

  // Combine loading states for disabling UI elements
  const anyLoading = isLoading || isGeneratingExplanation || isGeneratingRecord;

  // Automatically generate patient explanation when ready
  useEffect(() => {
    if (isReadyForRecord && !structuredPatientExplanation && !isGeneratingExplanation) {
      generatePatientExplanation();
    }
  }, [isReadyForRecord, structuredPatientExplanation, generatePatientExplanation, isGeneratingExplanation]);


  // --- Event Handlers ---
  const handleStartSession = async () => {
    setFormError(null);
    if (!fullName || !age || !gender || !complaint) { // Added fullName check
      setFormError("Please fill in all fields (Full Name, Age, Gender, Initial Complaint)."); // Updated error message
      return;
    }
    await startSession({ fullName, age, gender, complaint }); // Pass fullName
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setCurrentAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSuggestionClick = (questionId: string, suggestion: string) => {
    setCurrentAnswers(prev => ({ ...prev, [questionId]: suggestion }));
  };

  const handleSubmitAnswers = async () => {
    await submitAnswers(currentAnswers);
    setCurrentAnswers({}); // Clear answers for the next set
  };

  // No changes needed for generatePatientExplanation or generateRecord handlers,
  // as they are directly called from the store actions.

  // --- Download Handler ---
  const handleDownloadRecord = () => {
    if (!medicalRecord) return; // Should not happen if button is visible, but good practice

    const blob = new Blob([medicalRecord], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medical-record.txt'; // Set the desired filename
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link); // Clean up
    URL.revokeObjectURL(url); // Free up memory
  };


  // Reset local form state if session is reset externally (optional)
  // useEffect(() => {
  //   if (!isSessionActive) {
  //     setAge('');
  //     setGender('');
  //     setComplaint('');
  //     setFormError(null);
  //   }
  // }, [isSessionActive]);


  return (
    <div className="flex flex-col items-center min-h-screen p-4 sm:p-6 md:p-8 bg-muted/40"> {/* Adjusted padding */}
      <div className="w-full max-w-3xl space-y-8"> {/* Added space-y for consistent spacing */}
        {/* Welcome Section - Show when session is NOT active */}
        {!isSessionActive && (
          <Card> {/* Removed mb-8, handled by parent space-y */}
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl">Welcome to MedGuide AI Assistant</CardTitle> {/* Slightly larger title */}
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
                 {/* Added Full Name Input */}
                 <div>
                   <Label htmlFor="full-name">Full Name</Label>
                   <Input
                     id="full-name"
                     placeholder="Enter your full name"
                     value={fullName}
                     onChange={(e) => setFullName(e.target.value)}
                     disabled={anyLoading}
                   />
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <Label htmlFor="age">Age</Label>
                     <Input
                       id="age"
                       placeholder="Enter your age"
                       value={age}
                       onChange={(e) => setAge(e.target.value)}
                       disabled={anyLoading} // Use combined loading state
                    />
                   </div>
                   <div>
                     <Label htmlFor="gender">Gender</Label>
                     {/* Replace HTML select with Shadcn Select */}
                     <Select
                       value={gender}
                       onValueChange={setGender} // Use onValueChange for Shadcn Select
                       disabled={anyLoading}
                     >
                       <SelectTrigger id="gender">
                         <SelectValue placeholder="Select Gender" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Male">Male</SelectItem>
                         <SelectItem value="Female">Female</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
                 <div>
                   <Label htmlFor="initial-complaint">Briefly describe your main symptom or reason for consultation:</Label>
                   <Textarea
                     id="initial-complaint"
                     placeholder="e.g., 'I've had a persistent cough for 3 days.'"
                     value={complaint}
                     onChange={(e) => setComplaint(e.target.value)}
                     disabled={anyLoading} // Use combined loading state
                   />
                 </div>
              </div>
              {/* Display Form Validation Error */}
              {formError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">{formError}</p>
              )}
              {/* Display Session Start Error */}
              {sessionError && !isSessionActive && ( // Only show session start error here
                 <p className="text-sm text-red-600 dark:text-red-400 mb-4">Error: {sessionError}</p>
              )}
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <Button
                onClick={handleStartSession}
                disabled={anyLoading} // Use combined loading state
              >
                {isLoading ? 'Starting...' : 'Start New Session'}
              </Button>
              {/* <Button variant="outline" onClick={resetSession} disabled={anyLoading}>Reset</Button> */}
            </CardFooter>
          </Card>
        )}

        {/* Chat Interface Section - Show when session IS active AND NOT complete */}
        {isSessionActive && !isComplete && (
          <div className="space-y-6">
            {/* --- Loading State --- (Updated with Spinner) */}
            {anyLoading && (
               <Card>
                 <CardContent className="p-6 text-center flex items-center justify-center space-x-3">
                   <div className="spinner" aria-hidden="true"></div> {/* Added Spinner */}
                   <span> {/* Changed p to span for inline layout */}
                     {isGeneratingRecord ? 'Generating final record...' :
                      isGeneratingExplanation ? 'Generating patient explanation...' :
                      isLoading ? 'Loading next step...' : // Fallback for general loading
                      'Processing...'} {/* Default */}
                   </span>
                 </CardContent>
               </Card>
            )}

            {/* --- Content when NOT Loading --- */}
            {!anyLoading && (
              <>
                {/* Display Explanation/Guidance (Hide if structured explanation is ready) */}
                {currentExplanation && !structuredPatientExplanation && (
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"> {/* Darker blue bg */}
                    <CardHeader className="pb-2"> {/* Reduced padding */}
                      <CardTitle className="text-blue-800 dark:text-blue-300 text-base font-medium">Guidance</CardTitle> {/* Adjusted font weight */}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-blue-700 dark:text-blue-300"> {/* Adjusted dark text color */}
                        {currentExplanation}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* --- Display Questions OR Action Buttons (Updated Logic) --- */}

                {/* 1. Show Questions & Submit Button */}
                {!isReadyForRecord && currentQuestions.length > 0 && (
                  <>
                    {/* Question Container */}
                    <div className="space-y-4">
                      {currentQuestions.map((question) => (
                        <Card key={question.id}>
                          <CardHeader>
                            <Label htmlFor={question.id}>{question.text}</Label>
                          </CardHeader>
                          <CardContent>
                            <Textarea
                              id={question.id}
                              placeholder="Type your answer here..."
                              value={currentAnswers[question.id] || ''}
                              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                              disabled={anyLoading} // Should be false here, but good practice
                            />
                            {question.suggestions && question.suggestions.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {question.suggestions.map((suggestion, index) => (
                                  <Button
                                    key={`${question.id}-sug-${index}`}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSuggestionClick(question.id, suggestion)}
                                    disabled={anyLoading}
                                  >
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Submit Answers Button */}
                    <div className="flex justify-end">
                      <Button onClick={handleSubmitAnswers} disabled={anyLoading}>
                        Submit Answers / Next Step
                      </Button>
                    </div>
                  </>
                )}

                {/* 2. Show Patient Explanation and Generate Final Record Button */}
                {isReadyForRecord && structuredPatientExplanation && !isComplete && (
                  <div className="space-y-6"> {/* Use space-y-6 for spacing between explanation and button */}
                    {/* Patient Explanation */}
                    <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"> {/* Darker green bg */}
                      <CardHeader className="pb-3"> {/* Reduced padding */}
                        <CardTitle className="text-green-800 dark:text-green-300 text-lg">Patient Explanation</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm text-green-700 dark:text-green-300"> {/* Adjusted dark text color */}
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Potential Areas of Concern (Most Likely First):</h4> {/* Explicit heading color */}
                          {structuredPatientExplanation.mostProbableDiagnosis && structuredPatientExplanation.mostProbableDiagnosis.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                              {structuredPatientExplanation.mostProbableDiagnosis.map((diag, index) => (
                                <li key={`diag-${index}`}>{diag}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>Not available.</p>
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">General Advice:</h4> {/* Explicit heading color */}
                          <p>{structuredPatientExplanation.advice || "Not available."}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Recommended Specialists (Most Relevant First):</h4> {/* Explicit heading color */}
                           {structuredPatientExplanation.recommendedSpecialists && structuredPatientExplanation.recommendedSpecialists.length > 0 ? (
                             <ul className="list-disc list-inside space-y-1">
                               {structuredPatientExplanation.recommendedSpecialists.map((spec, index) => (
                                 <li key={`spec-${index}`}>{spec}</li>
                               ))}
                             </ul>
                           ) : (
                             <p>Not specified.</p>
                           )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Generate Final Record Button */}
                    <div className="flex justify-center">
                      <Button
                        onClick={generateRecord}
                        disabled={anyLoading}
                        size="lg"
                      >
                        {isGeneratingRecord ? 'Generating Record...' : 'Generate Final Record'}
                      </Button>
                    </div>
                  </div>
                )}


                {/* Display Session Error during chat */}
                {sessionError && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-4">Error: {sessionError}</p>
                 )}
              </>
            )}
          </div>
        )}

        {/* Results Section - Show when session IS complete */}
        {isComplete && structuredPatientExplanation && medicalRecord && (
          <Card> {/* Removed mt-8, handled by parent space-y */}
            <CardHeader>
              <CardTitle className="text-xl sm:text-2xl">Consultation Summary</CardTitle> {/* Slightly larger title */}
              <CardDescription>
                Here is a summary based on the information provided. Remember, this is not a diagnosis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Patient Explanation */}
              <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"> {/* Darker green bg */}
                <CardHeader className="pb-3"> {/* Reduced padding */}
                  <CardTitle className="text-green-800 dark:text-green-300 text-lg">Patient Explanation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-green-700 dark:text-green-300"> {/* Adjusted dark text color */}
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Potential Areas of Concern (Most Likely First):</h4> {/* Explicit heading color */}
                    {structuredPatientExplanation.mostProbableDiagnosis && structuredPatientExplanation.mostProbableDiagnosis.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">
                        {structuredPatientExplanation.mostProbableDiagnosis.map((diag, index) => (
                          <li key={`diag-${index}`}>{diag}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>Not available.</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">General Advice:</h4> {/* Explicit heading color */}
                    <p>{structuredPatientExplanation.advice || "Not available."}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1 text-green-800 dark:text-green-200">Recommended Specialists (Most Relevant First):</h4> {/* Explicit heading color */}
                     {structuredPatientExplanation.recommendedSpecialists && structuredPatientExplanation.recommendedSpecialists.length > 0 ? (
                       <ul className="list-disc list-inside space-y-1">
                         {structuredPatientExplanation.recommendedSpecialists.map((spec, index) => (
                           <li key={`spec-${index}`}>{spec}</li>
                         ))}
                       </ul>
                     ) : (
                       <p>Not specified.</p>
                     )}
                  </div>
                </CardContent>
              </Card>

              {/* Medical Record Preview (Simplified - No change needed here) */}
              {/* Medical Record Preview */}
              <Card>
                 <CardHeader className="pb-3"> {/* Reduced padding */}
                   <CardTitle className="text-base font-medium">Medical Record (for Healthcare Professional)</CardTitle> {/* Adjusted font weight */}
                 </CardHeader>
                 <CardContent className="text-sm">
                  {/* Render the markdown content as HTML using marked */}
                  <div
                    className="markdown-content max-w-none p-4 bg-muted/50 dark:bg-muted/30 rounded-md border border-border" // Use theme colors, add border
                    dangerouslySetInnerHTML={{ __html: marked(medicalRecord || '') }}
                  />
                </CardContent>
               </Card>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <Button variant="outline" onClick={resetSession} disabled={anyLoading}>Start New Session</Button>
              <Button
                onClick={handleDownloadRecord}
                disabled={anyLoading || !medicalRecord} // Disable if no record
              >
                Download Record (.txt)
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
