import { create } from 'zustand';
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
    buildInitialPrompt,
    buildNextPrompt,
    buildGeneratePatientExplanationPrompt,
    buildGenerateRecordPrompt,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parseAIResponse, // Keep parseAIResponse import, it's used by the API route, not directly here anymore
    PatientExplanationData
} from '@/lib/utils/promptBuilder'; // Ensure all are imported

// Define AppStep type
export type AppStep =
  | 'initial'
  | 'anamnesis'
  | 'paraclinicalUpload'
  | 'generatingExplanation'
  | 'viewExplanation'
  | 'generatingRecord'
  | 'viewResults'
  | 'errorState';

// Define the structure for a single question from the AI
interface Question {
  id: string;
  text: string;
  suggestions?: string[];
}

// Define the state structure (Updated for Images)
interface SessionState {
  conversationHistory: ChatCompletionMessageParam[];
  currentQuestions: Question[];
  currentExplanation: string | null;
  isLoading: boolean; // General loading for start/next steps
  isGeneratingExplanation: boolean; // Kept for now, sync with currentAppStep
  isGeneratingRecord: boolean; // Kept for now, sync with currentAppStep
  error: string | null;
  isSessionActive: boolean; // Kept for now
  isComplete: boolean; // True only after final medical record is generated
  isReadyForRecord: boolean; // True when AI signals readiness for paraclinical upload
  structuredPatientExplanation: PatientExplanationData | null;
  medicalRecord: string | null;
  initialData: { fullName: string; age: string; gender: string; complaint: string } | null;
  paraclinicalImagesBase64: string[]; // Renamed state for base64 images
  currentAppStep: AppStep; // New state for managing UI flow

  // Define actions (Updated for Images)
  startSession: (initialData: { fullName: string; age: string; gender: string; complaint: string }) => Promise<void>;
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  submitParaclinicalImages: (imagesBase64: string[]) => Promise<void>; // New action for images
  generateRecord: () => Promise<void>; // Existing action, will be updated
  generateResultsSkippingParaclinical: () => Promise<void>; // New action to skip paraclinical
  setError: (error: string | null) => void;
  resetSession: () => void;

  // Internal helper actions
  _addHistory: (message: ChatCompletionMessageParam) => void;
}

// Helper to create the user answer string
const formatUserAnswers = (answers: Record<string, string>, questions: Question[]): string => {
    return questions
      .map(q => `Answer for Q (${q.id}): "${q.text}"\n${answers[q.id] || 'No answer provided.'}`)
      .join('\n\n');
}

// Create the store
export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state (Updated for Images)
  conversationHistory: [],
  currentQuestions: [],
  currentExplanation: null,
  isLoading: false,
  isGeneratingExplanation: false,
  isGeneratingRecord: false,
  error: null,
  isSessionActive: false,
  isComplete: false,
  isReadyForRecord: false,
  structuredPatientExplanation: null,
  medicalRecord: null,
  initialData: null,
  paraclinicalImagesBase64: [], // Initialize new state
  currentAppStep: 'initial',

  // Actions implementations
  setError: (error: string | null) => set({ error: error, currentAppStep: 'errorState', isLoading: false, isGeneratingExplanation: false, isGeneratingRecord: false }),
  _addHistory: (message: ChatCompletionMessageParam) => set((state) => ({
     conversationHistory: [...state.conversationHistory, message],
  })),

  resetSession: () => set({
    initialData: null,
    conversationHistory: [],
    currentQuestions: [],
    currentExplanation: null,
    isLoading: false,
    isGeneratingExplanation: false,
    isGeneratingRecord: false,
    error: null,
    isSessionActive: false,
    isComplete: false,
    isReadyForRecord: false,
    structuredPatientExplanation: null,
    medicalRecord: null,
    paraclinicalImagesBase64: [], // Reset image state
    currentAppStep: 'initial',
  }),

  startSession: async (initialData: { fullName: string; age: string; gender: string; complaint: string }) => {
    get().resetSession();
    set({
        isLoading: true,
        isSessionActive: true,
        error: null,
        initialData: initialData,
        currentAppStep: 'anamnesis'
    });
    const { _addHistory } = get();
    const initialMessages = buildInitialPrompt(initialData);
    _addHistory(initialMessages[0]);
    _addHistory(initialMessages[1]);

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          history: get().conversationHistory,
          initialData: initialData,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.type === 'questions' && data.data) {
         _addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
        set({
          currentQuestions: data.data.questions,
          currentExplanation: data.data.explanation,
          isLoading: false,
          currentAppStep: 'anamnesis',
        });
      } else if (data.type === 'error') {
        throw new Error(data.error || 'Received an error response from the API.');
      } else {
        throw new Error('Invalid response format received from the API route.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start session.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isSessionActive: false });
    }
  },

  submitAnswers: async (answers: Record<string, string>) => {
    const { _addHistory, currentQuestions, initialData } = get();
    if (currentQuestions.length === 0) return;
    if (!initialData) {
        set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
        return;
    }
    set({ isLoading: true, error: null, currentAppStep: 'anamnesis' });
    const userAnswerContent = formatUserAnswers(answers, currentQuestions);
    _addHistory({ role: 'user', content: userAnswerContent });
    const nextPromptMessages = buildNextPrompt(get().conversationHistory);

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next', history: nextPromptMessages }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.type === 'questions' && data.data) {
        _addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
        set({
          currentQuestions: data.data.questions,
          currentExplanation: data.data.explanation,
          isLoading: false,
          currentAppStep: 'anamnesis',
        });
      } else if (data.type === 'readyForRecord' && data.data) {
         _addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
        set({
          isReadyForRecord: true,
          currentExplanation: data.data.explanation,
          currentQuestions: [],
          isLoading: false,
          currentAppStep: 'paraclinicalUpload',
        });
      } else if (data.type === 'error') {
        throw new Error(data.error || 'Received an error response from the API during next step.');
      } else {
        throw new Error('Invalid response format received from the API route during next step.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process answers.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false });
    }
  },

  // New action for submitting images
  submitParaclinicalImages: async (imagesBase64: string[]) => {
    const { conversationHistory, initialData, _addHistory } = get();
     if (!initialData) {
        set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
        return;
    }
    // Store the base64 images in the state first
    set({
        paraclinicalImagesBase64: imagesBase64,
        isLoading: true,
        isGeneratingExplanation: true,
        error: null,
        currentAppStep: 'generatingExplanation'
    });
    // Add a user message to history indicating images were submitted
    _addHistory({ role: 'user', content: `[User submitted ${imagesBase64.length} paraclinical image(s)]` });
    // Pass the images to the prompt builder
    // Ensure the correct state property is accessed here
    const currentImages = get().paraclinicalImagesBase64;
    const promptMessages = buildGeneratePatientExplanationPrompt(conversationHistory, currentImages);

    try {
        const response = await fetch('/api/ai-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generatePatientExplanation', // Correct action string
                history: promptMessages,
                images: currentImages // Send images in the body
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error generating explanation: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.type === 'patientExplanation' && data.data) {
             _addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
            set({
                structuredPatientExplanation: data.data,
                isLoading: false,
                isGeneratingExplanation: false,
                currentAppStep: 'viewExplanation',
                currentQuestions: [],
            });
        } else if (data.type === 'error') {
            throw new Error(data.error || 'Received an error response from the API generating explanation.');
        } else {
            throw new Error('Invalid response format received from the API route generating explanation.');
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to generate patient explanation.';
        set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isGeneratingExplanation: false });
    }
  },

  generateResultsSkippingParaclinical: async () => {
    const { conversationHistory, initialData, _addHistory } = get(); // generateRecord removed as it's not used in this action

    if (!initialData) {
      set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
      return;
    }

    set({
      isLoading: true,
      isGeneratingExplanation: true,
      error: null,
      currentAppStep: 'generatingExplanation',
      paraclinicalImagesBase64: [], // Ensure images are empty
    });

    _addHistory({ role: 'user', content: `[User chose to skip paraclinical data upload]` });

    // 1. Generate Patient Explanation (without images)
    const explanationPromptMessages = buildGeneratePatientExplanationPrompt(conversationHistory, []); // Empty array for images

    try {
      const explanationResponse = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generatePatientExplanation',
          history: explanationPromptMessages,
          images: [], // Explicitly send empty array
        }),
      });

      if (!explanationResponse.ok) {
        const errorData = await explanationResponse.json();
        throw new Error(errorData.error || `API Error generating explanation (skipped paraclinical): ${explanationResponse.statusText}`);
      }

      const explanationData = await explanationResponse.json();
      if (explanationData.type === 'patientExplanation' && explanationData.data) {
        _addHistory({ role: 'assistant', content: JSON.stringify(explanationData.data) });
        set({
          structuredPatientExplanation: explanationData.data,
          isLoading: false, // Stop loading for explanation part
          isGeneratingExplanation: false,
          currentAppStep: 'viewExplanation', // Temporarily to show explanation if needed, or directly to generatingRecord
          currentQuestions: [],
        });

        // 2. Automatically proceed to generate record (without images)
        // We need to ensure generateRecord uses an empty image array
        // For simplicity, we'll adapt the existing generateRecord or make it aware of this flow.
        // For now, let's call a modified version of the generateRecord logic directly.

        set({
            isLoading: true, // Start loading for record part
            isGeneratingRecord: true,
            error: null,
            currentAppStep: 'generatingRecord'
        });

        const recordPromptMessages = buildGenerateRecordPrompt(get().conversationHistory, initialData, []); // Empty array for images

        const recordResponse = await fetch('/api/ai-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generateRecord',
              history: recordPromptMessages,
              initialData: initialData,
              images: [], // Explicitly send empty array
            }),
        });

        if (!recordResponse.ok) {
            const errorData = await recordResponse.json();
            throw new Error(errorData.error || `API Error generating record (skipped paraclinical): ${recordResponse.statusText}`);
        }

        const recordData = await recordResponse.json();
        if (recordData.type === 'medicalRecord' && recordData.data) {
            _addHistory({ role: 'assistant', content: JSON.stringify(recordData.data) });
            set({
              medicalRecord: recordData.data.medicalRecord,
              isComplete: true,
              isLoading: false,
              isGeneratingRecord: false,
              currentAppStep: 'viewResults',
            });
        } else if (recordData.type === 'error') {
            throw new Error(recordData.error || 'Received an error response from the API generating record (skipped paraclinical).');
        } else {
            throw new Error('Invalid response format received from the API route generating record (skipped paraclinical).');
        }

      } else if (explanationData.type === 'error') {
        throw new Error(explanationData.error || 'Received an error response from the API generating explanation (skipped paraclinical).');
      } else {
        throw new Error('Invalid response format received from the API route generating explanation (skipped paraclinical).');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate results skipping paraclinical data.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isGeneratingExplanation: false, isGeneratingRecord: false });
    }
  },

  generateRecord: async () => {
    // Use paraclinicalImagesBase64
    const { conversationHistory, initialData, structuredPatientExplanation, paraclinicalImagesBase64, _addHistory } = get();
    if (!initialData) {
      set({ error: "Cannot generate final record: Initial patient data is missing.", currentAppStep: 'errorState' });
      return;
    }
    if (!structuredPatientExplanation) {
      set({ error: "Cannot generate final record until patient explanation is available.", currentAppStep: 'errorState' });
      return;
    }
    set({
        isLoading: true,
        isGeneratingRecord: true,
        error: null,
        currentAppStep: 'generatingRecord'
    });
    // Pass images to the prompt builder
    const recordPromptMessages = buildGenerateRecordPrompt(conversationHistory, initialData, paraclinicalImagesBase64);

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateRecord',
          history: recordPromptMessages,
          initialData: initialData,
          images: paraclinicalImagesBase64 // Send images in the body
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.type === 'medicalRecord' && data.data) {
        _addHistory({ role: 'assistant', content: JSON.stringify(data.data) });
        set({
          medicalRecord: data.data.medicalRecord,
          isComplete: true,
          isLoading: false,
          isGeneratingRecord: false,
          currentAppStep: 'viewResults',
        });
      } else if (data.type === 'error') {
        throw new Error(data.error || 'Received an error response from the API generating record.');
      } else {
        throw new Error('Invalid response format received from the API route generating record.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate medical record.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isGeneratingRecord: false });
    }
  },
}));

// AppStep is exported at the top
