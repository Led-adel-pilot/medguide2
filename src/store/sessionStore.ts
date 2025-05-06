import { create } from 'zustand';
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
// Import the new interface
import { PatientExplanationData } from '@/lib/utils/promptBuilder';

// Define the structure for a single question from the AI
interface Question {
  id: string;
  text: string;
  suggestions?: string[];
}

// PatientExplanation interface from promptBuilder is imported above

// Define the state structure (Updated)
interface SessionState {
  conversationHistory: Array<Pick<ChatCompletionMessageParam, 'role' | 'content'>>;
  currentQuestions: Question[];
  currentExplanation: string | null; // Explanation from AI during Q&A or readiness signal
  isLoading: boolean; // General loading for start/next steps
  isGeneratingExplanation: boolean; // Specific loading for patient explanation step
  isGeneratingRecord: boolean; // Specific loading for final record step
  error: string | null;
  isSessionActive: boolean;
  isComplete: boolean; // True only after final medical record is generated
  isReadyForRecord: boolean; // True when AI signals readiness (first step)
  structuredPatientExplanation: PatientExplanationData | null; // Store the structured explanation (second step)
  medicalRecord: string | null; // Store the final medical record markdown string (third step)
  initialData: { fullName: string; age: string; gender: string; complaint: string } | null; // Store initial data (Added fullName)

  // Define actions
  startSession: (initialData: { fullName: string; age: string; gender: string; complaint: string }) => Promise<void>; // Updated signature
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  generatePatientExplanation: () => Promise<void>; // New action
  generateRecord: () => Promise<void>;
  setLoading: (loading: boolean) => void; // Consider removing if specific loaders are used
  setError: (error: string | null) => void;
  resetSession: () => void;
  // Internal actions updated
  _setQuestions: (explanation: string, questions: Question[]) => void;
  _addHistory: (message: Pick<ChatCompletionMessageParam, 'role' | 'content'>) => void;
  _setReadyForRecord: (explanation?: string) => void; // Updated signature
  _setPatientExplanation: (explanationData: PatientExplanationData) => void; // New internal action
  _setComplete: (medicalRecord: string) => void;
}

// Helper to create the user answer string
const formatUserAnswers = (answers: Record<string, string>, questions: Question[]): string => {
    return questions
      .map(q => `Answer for Q (${q.id}): "${q.text}"\n${answers[q.id] || 'No answer provided.'}`)
      .join('\n\n');
}


// Create the store
export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  conversationHistory: [],
  currentQuestions: [],
  currentExplanation: null,
  isLoading: false,
  isGeneratingExplanation: false, // Initialize new state
  isGeneratingRecord: false, // Initialize new state
  error: null,
  isSessionActive: false,
  isComplete: false,
  isReadyForRecord: false,
  structuredPatientExplanation: null, // Initialize new state
  medicalRecord: null,
  initialData: null, // Initialize initialData

  // Actions implementations
  setLoading: (loading: boolean) => set({ isLoading: loading }), // Keep for initial load?
  setError: (error: string | null) => set({ error: error }),

  _setQuestions: (explanation: string, questions: Question[]) => set({
    currentExplanation: explanation,
    currentQuestions: questions,
    isLoading: false, // Stop general loading
    isGeneratingExplanation: false,
    isGeneratingRecord: false,
    error: null,
    isReadyForRecord: false, // Not ready if we just got questions
    structuredPatientExplanation: null, // Clear any previous explanation if we get new questions
    isComplete: false, // Not complete if we get new questions
  }),

  _addHistory: (message: Pick<ChatCompletionMessageParam, 'role' | 'content'>) => set((state) => ({
     conversationHistory: [...state.conversationHistory, message],
  })),

  // Updated: Only sets readiness flag and optional explanation text
  _setReadyForRecord: (explanation?: string) => set({
    isReadyForRecord: true, // Signal readiness for the *next* step (patient explanation)
    currentExplanation: explanation, // Use only the provided explanation (can be undefined)
    currentQuestions: [], // Clear questions
    isLoading: false, // Stop general loading
    isGeneratingExplanation: false,
    isGeneratingRecord: false,
    error: null,
    // structuredPatientExplanation remains null until generated
  }),

  // New: Sets the structured patient explanation
   _setPatientExplanation: (explanationData: PatientExplanationData) => set({
      structuredPatientExplanation: explanationData,
      isGeneratingExplanation: false, // Stop explanation loading
      isLoading: false,
      error: null,
      // isReadyForRecord remains true, isComplete remains false
   }),

  // Updated: Sets the final medical record and marks session complete
  _setComplete: (medicalRecord: string) => set({
    isComplete: true,
    medicalRecord: medicalRecord, // Store the record string
    isGeneratingRecord: false, // Stop record loading
    isLoading: false,
    error: null,
    currentQuestions: [], // Clear questions when complete
    // structuredPatientExplanation remains as it was set
    isReadyForRecord: false, // No longer just 'ready'
  }),

  resetSession: () => set({
    initialData: null, // Reset initialData
    conversationHistory: [],
    currentQuestions: [],
    currentExplanation: null,
    isLoading: false,
    isGeneratingExplanation: false, // Reset new state
    isGeneratingRecord: false, // Reset new state
    error: null,
    isSessionActive: false,
    isComplete: false,
    isReadyForRecord: false,
    structuredPatientExplanation: null, // Reset new state
    medicalRecord: null,
  }),

  // --- Actions involving API calls ---
  startSession: async (initialData: { fullName: string; age: string; gender: string; complaint: string }) => { // Updated signature
    get().resetSession();
    // Store initialData in the state
    set({ isLoading: true, isSessionActive: true, error: null, initialData: initialData }); // initialData now includes fullName

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          initialData: initialData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.type === 'questions' && data.data.explanation && data.data.questions) {
         get()._addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
         get()._setQuestions(data.data.explanation, data.data.questions);
      } else if (data.type === 'error') {
         throw new Error(data.message || 'API returned an error on initial call.');
      } else {
        console.error("Unexpected response type on initial call:", data);
        throw new Error('Invalid initial response format from API. Expected questions.');
      }

    } catch (err: unknown) {
      console.error("Error starting session:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start session.';
      set({ error: errorMessage, isSessionActive: false, isLoading: false });
    } finally {
        // Ensure loading is always turned off
        set({ isLoading: false });
    }
  },

  submitAnswers: async (answers: Record<string, string>) => {
    // Use specific loaders now? Or keep general isLoading? Let's use general for now.
    const { setError, _addHistory, _setQuestions, _setReadyForRecord, currentQuestions } = get();

    if (currentQuestions.length === 0) {
        console.warn("submitAnswers called with no current questions.");
        return;
    }

    set({ isLoading: true, error: null }); // Use general loader

    const userAnswerContent = formatUserAnswers(answers, currentQuestions);
    _addHistory({ role: 'user', content: userAnswerContent });

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next',
          history: get().conversationHistory
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Add raw response to history BEFORE processing it
      // Check if result.data exists before stringifying
       if (result.data) {
           _addHistory({ role: 'assistant', content: JSON.stringify(result.data) });
       } else if (result.type === 'error') {
            // Don't add error messages themselves as assistant history? Or maybe do?
            // Let's skip adding the error object itself to history for now.
       }


      if (result.type === 'questions') {
        _setQuestions(result.data.explanation, result.data.questions);
      } else if (result.type === 'readyForRecord') {
        // Updated call: Pass only the optional explanation string
        _setReadyForRecord(result.data.explanation);
      } else if (result.type === 'patientExplanation' || result.type === 'medicalRecord') {
         // Should not happen in 'next' action response
         console.warn(`Received unexpected response type '${result.type}' during submitAnswers.`);
         setError(`Received unexpected response type '${result.type}' during submitAnswers.`);
         set({ isLoading: false }); // Stop loading on error/warning
      } else if (result.type === 'error') {
         throw new Error(result.message || 'API returned an error.');
      } else {
        console.error("Invalid response type after submitting answers:", result);
        throw new Error('Invalid response format from API after submitting answers.');
      }

    } catch (err: unknown) {
      console.error("Error submitting answers:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to process answers.';
      setError(errorMessage);
      set({ isLoading: false }); // Ensure loading is false on error
    }
    // setLoading(false) is handled within the actions now or in catch
  }, // End of submitAnswers

  // New Action: Generate Patient Explanation
  generatePatientExplanation: async () => {
      const { setError, _addHistory, _setPatientExplanation, isReadyForRecord } = get();

      if (!isReadyForRecord) {
          console.warn("generatePatientExplanation called when not in ready state.");
          setError("Cannot generate patient explanation yet. AI has not indicated readiness.");
          return;
      }

      set({ isGeneratingExplanation: true, error: null }); // Use specific loader

      // Optional: Add a user message to history indicating this step was triggered
      // _addHistory({ role: 'user', content: "User requested patient explanation generation." });

      try {
          const response = await fetch('/api/ai-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action: 'generatePatientExplanation', // New action type
                  history: get().conversationHistory // Send history up to this point
              }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }

          const result = await response.json(); // Expected: { type: 'patientExplanation', data: PatientExplanationData }

          // Add the explanation JSON itself to history
          if (result.data) {
              _addHistory({ role: 'assistant', content: JSON.stringify(result.data) });
          }

          if (result.type === 'patientExplanation' && result.data) {
              // Validate structure maybe? For now, trust the parser/API
              _setPatientExplanation(result.data as PatientExplanationData);
          } else if (result.type === 'error') {
              throw new Error(result.message || 'API returned an error during patient explanation generation.');
          } else {
              console.error("Unexpected response type or structure during generatePatientExplanation:", result);
              throw new Error('Invalid response format from API when generating patient explanation.');
          }

      } catch (err: unknown) {
          console.error("Error generating patient explanation:", err);
          const errorMessage = err instanceof Error ? err.message : 'Failed to generate patient explanation.';
          setError(errorMessage);
          set({ isGeneratingExplanation: false }); // Ensure loading is false on error
      }
  }, // End of generatePatientExplanation


  // Updated Action: Generate Final Medical Record
  generateRecord: async () => {
    // Now depends on structuredPatientExplanation being present and needs initialData
    const { setError, _addHistory, _setComplete, structuredPatientExplanation, initialData } = get();

    if (!initialData) {
        console.error("generateRecord called but initialData is missing from state.");
        setError("Cannot generate final record: Initial patient data is missing.");
        return;
    }

    if (!structuredPatientExplanation) {
        console.warn("generateRecord called before patient explanation was generated.");
        setError("Cannot generate final record until patient explanation is available.");
        return;
    }

    set({ isGeneratingRecord: true, error: null }); // Use specific loader

    // Optional: Add user message to history
    // _addHistory({ role: 'user', content: "User requested final medical record generation." });

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateRecord', // Action remains the same
          history: get().conversationHistory, // Send full history including the patient explanation assistant message
          initialData: initialData // Include initialData in the request body
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json(); // Expected: { type: 'medicalRecord', data: { medicalRecord: "..." } }

       // Add the final record JSON to history
       if (result.data) {
           _addHistory({ role: 'assistant', content: JSON.stringify(result.data) });
       }

      if (result.type === 'medicalRecord' && typeof result.data?.medicalRecord === 'string') {
        _setComplete(result.data.medicalRecord);
      } else if (result.type === 'error') {
         throw new Error(result.message || 'API returned an error during record generation.');
      } else {
        console.error("Unexpected response type or structure during generateRecord:", result);
        throw new Error('Invalid response format or missing medicalRecord string from API when generating record.');
      }

    } catch (err: unknown) {
      console.error("Error generating record:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate record.';
      setError(errorMessage);
      set({ isGeneratingRecord: false }); // Ensure loading is false on error
    }
  }, // End of generateRecord
}));

// Export the new interface type if needed elsewhere (optional)
export type { PatientExplanationData };
