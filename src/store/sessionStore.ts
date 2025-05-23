import { create } from 'zustand';
// import { ChatCompletionMessageParam } from "openai/resources/chat/completions"; // Already part of Consultation
import {
    buildInitialPrompt,
    buildNextPrompt,
    buildGeneratePatientExplanationPrompt,
    buildGenerateRecordPrompt,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parseAIResponse, // Keep parseAIResponse import, it's used by the API route, not directly here anymore
    // PatientExplanationData // Already part of Consultation
} from '@/lib/utils/promptBuilder'; // Ensure all are imported

// Placeholder types (copied from localStorageManager.ts for this subtask)
export type AppStep =
  | 'initial'
  | 'anamnesis'
  | 'paraclinicalUpload'
  | 'generatingExplanation'
  | 'viewExplanation'
  | 'generatingRecord'
  | 'viewResults'
  | 'errorState';

export interface Question { id: string; text: string; suggestions?: string[]; }
export interface PatientExplanationData { mostProbableDiagnosis?: string[]; advice?: string; recommendedSpecialists?: string[]; }
export interface ChatCompletionMessageParam { role: 'user' | 'assistant' | 'system'; content: string; }

export interface Consultation {
  id: string;
  startTime: number;
  lastUpdated: number;
  status: 'in-progress' | 'completed' | 'abandoned';
  currentAppStep: AppStep;
  conversationHistory: ChatCompletionMessageParam[];
  currentQuestions: Question[];
  currentExplanation: string | null;
  structuredPatientExplanation: PatientExplanationData | null;
  medicalRecord: string | null;
  initialData: { fullName: string; age: string; gender: string; complaint: string } | null;
  paraclinicalImagesBase64?: string[];
  title?: string;
}

import {
  saveConsultation,
  getConsultationById,
  updateConsultation,
} from '@/lib/utils/localStorageManager';

// Helper to generate unique IDs
const generateUniqueId = () => Date.now().toString() + Math.random().toString(36).substring(2, 9);


// Define the state structure (Updated for Images & Local Storage)
interface SessionState {
  currentConsultationId: string | null; // Added for local storage integration
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
  paraclinicalImagesBase64: string[];
  currentAppStep: AppStep;

  // Define actions
  startSession: (initialData: { fullName: string; age: string; gender: string; complaint: string }) => Promise<void>;
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  submitParaclinicalImages: (imagesBase64: string[]) => Promise<void>;
  generateRecord: () => Promise<void>;
  generateResultsSkippingParaclinical: () => Promise<void>;
  setError: (error: string | null) => void;
  resetSession: () => void;
  loadConsultation: (consultationId: string) => Promise<void>; // Added for local storage

  // Internal helper actions
  _addHistory: (message: ChatCompletionMessageParam) => void;
}

// Helper to create the user answer string
const formatUserAnswers = (answers: Record<string, string>, questions: Question[]): string => {
    return questions
      .map(q => `Answer for Q (${q.id}): "${q.text}"\n${answers[q.id] || 'No answer provided.'}`)
      .join('\n\n');
}; // Added semicolon

// Create the store
export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  currentConsultationId: null, // Initialize new state
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
  paraclinicalImagesBase64: [],
  currentAppStep: 'initial',

  // Actions implementations
  setError: (error: string | null) => set({ error: error, currentAppStep: 'errorState', isLoading: false, isGeneratingExplanation: false, isGeneratingRecord: false }),
  _addHistory: (message: ChatCompletionMessageParam) => set((state) => {
    const newHistory = [...state.conversationHistory, message];
    // Also update in local storage if a session is active
    const consultationId = get().currentConsultationId;
    if (consultationId) {
        updateConsultation(consultationId, { conversationHistory: newHistory, lastUpdated: Date.now() });
    }
    return { conversationHistory: newHistory };
  }),

  resetSession: () => {
    const consultationId = get().currentConsultationId;
    const isCompleted = get().isComplete; // Use isComplete flag
    const currentStep = get().currentAppStep;

    if (consultationId) {
      // Determine status based on whether it was completed or just ended
      const status: Consultation['status'] = isCompleted || currentStep === 'viewResults' ? 'completed' : 'abandoned';
      updateConsultation(consultationId, { status: status, lastUpdated: Date.now() });
    }
    set({
      currentConsultationId: null, // Clear current consultation ID
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
      paraclinicalImagesBase64: [],
      currentAppStep: 'initial',
    });
  },

  startSession: async (initialData: { fullName: string; age: string; gender: string; complaint: string }) => {
    get().resetSession(); // Resets previous session, if any, and updates its status

    const newConsultationId = generateUniqueId();
    set({
        currentConsultationId: newConsultationId, // Set new ID for current session
        isLoading: true,
        isSessionActive: true,
        error: null,
        initialData: initialData,
        currentAppStep: 'anamnesis',
        conversationHistory: [], // Ensure history is clean for new session
        currentQuestions: [],
        currentExplanation: null,
        structuredPatientExplanation: null,
        medicalRecord: null,
        paraclinicalImagesBase64: [],
    });

    const { _addHistory } = get();
    const initialMessages = buildInitialPrompt(initialData);
    // _addHistory will handle updating LS for these messages if we modify it to do so,
    // but for initial save, it's better to save once with all data.
    // For now, let's build history locally first.
    let tempHistory = [...initialMessages];
    set(state => ({ conversationHistory: [...state.conversationHistory, ...initialMessages] }));


    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          history: tempHistory, // Use tempHistory for the API call
          initialData: initialData,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.type === 'questions' && data.data) {
        // Add AI response to history (locally first, then set)
        const assistantResponse: ChatCompletionMessageParam = { role: 'assistant', content: JSON.stringify(data.data) };
        tempHistory.push(assistantResponse);
        set({
          currentQuestions: data.data.questions,
          currentExplanation: data.data.explanation,
          conversationHistory: tempHistory, // Set final history
          isLoading: false,
          // currentAppStep is already 'anamnesis'
        });

        // Now save the initial consultation
        const newConsultation: Consultation = {
          id: newConsultationId,
          startTime: Date.now(), // More accurate to place it here
          lastUpdated: Date.now(),
          status: 'in-progress',
          title: `Consultation for ${initialData.fullName} - ${new Date(Date.now()).toLocaleDateString()}`,
          initialData: initialData,
          currentAppStep: get().currentAppStep,
          conversationHistory: get().conversationHistory,
          currentQuestions: get().currentQuestions,
          currentExplanation: get().currentExplanation,
          structuredPatientExplanation: null,
          medicalRecord: null,
          paraclinicalImagesBase64: [],
        };
        saveConsultation(newConsultation);

      } else if (data.type === 'error') {
        throw new Error(data.error || 'Received an error response from the API.');
      } else {
        throw new Error('Invalid response format received from the API route.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start session.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isSessionActive: false });
      // If session start fails, we might want to remove the placeholder ID or mark it as failed.
      // For now, resetSession will handle it as 'abandoned' if called next.
    }
  },

  submitAnswers: async (answers: Record<string, string>) => {
    const { _addHistory, currentQuestions, initialData, currentConsultationId } = get();
    if (currentQuestions.length === 0) return;
    if (!initialData) {
        set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
        return;
    }
    set({ isLoading: true, error: null }); // currentAppStep remains 'anamnesis' or changes based on response
    const userAnswerContent = formatUserAnswers(answers, currentQuestions);
    _addHistory({ role: 'user', content: userAnswerContent }); // _addHistory will update LS
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
      let newAppStep: AppStep = get().currentAppStep; // Default to current
      if (data.type === 'questions' && data.data) {
        _addHistory({ role: 'assistant', content: JSON.stringify(data.data) }); // _addHistory will update LS
        newAppStep = 'anamnesis';
        set({
          currentQuestions: data.data.questions,
          currentExplanation: data.data.explanation,
          isLoading: false,
          currentAppStep: newAppStep,
        });
      } else if (data.type === 'readyForRecord' && data.data) {
         _addHistory({ role: 'assistant', content: JSON.stringify(data.data) }); // _addHistory will update LS
        newAppStep = 'paraclinicalUpload';
        set({
          isReadyForRecord: true,
          currentExplanation: data.data.explanation,
          currentQuestions: [], // Clear questions as we move to next phase
          isLoading: false,
          currentAppStep: newAppStep,
        });
      } else if (data.type === 'error') {
        throw new Error(data.error || 'Received an error response from the API during next step.');
      } else {
        throw new Error('Invalid response format received from the API route during next step.');
      }

      if (currentConsultationId) {
        const updatedConsultationData: Partial<Consultation> = {
          conversationHistory: get().conversationHistory,
          currentQuestions: get().currentQuestions,
          currentExplanation: get().currentExplanation,
          currentAppStep: newAppStep,
          lastUpdated: Date.now(),
          status: 'in-progress', // Remains in-progress
        };
        updateConsultation(currentConsultationId, updatedConsultationData);
      }

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process answers.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false });
    }
  },

  submitParaclinicalImages: async (imagesBase64: string[]) => {
    const { conversationHistory, initialData, _addHistory, currentConsultationId } = get();
     if (!initialData) {
        set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
        return;
    }
    set({
        paraclinicalImagesBase64: imagesBase64, // Store images in state first
        isLoading: true,
        isGeneratingExplanation: true,
        error: null,
        currentAppStep: 'generatingExplanation'
    });
    _addHistory({ role: 'user', content: `[User submitted ${imagesBase64.length} paraclinical image(s)]` });
    const currentImages = get().paraclinicalImagesBase64;
    const promptMessages = buildGeneratePatientExplanationPrompt(get().conversationHistory, currentImages);

    try {
        const response = await fetch('/api/ai-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generatePatientExplanation',
                history: promptMessages,
                images: currentImages
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
                currentQuestions: [], // Clear questions
            });
            if (currentConsultationId) {
              const updatedConsultationData: Partial<Consultation> = {
                conversationHistory: get().conversationHistory,
                structuredPatientExplanation: get().structuredPatientExplanation,
                paraclinicalImagesBase64: get().paraclinicalImagesBase64,
                currentAppStep: 'viewExplanation',
                lastUpdated: Date.now(),
                status: 'in-progress',
              };
              updateConsultation(currentConsultationId, updatedConsultationData);
            }
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
    const { conversationHistory, initialData, _addHistory, currentConsultationId } = get();

    if (!initialData) {
      set({ error: "Session not properly initialized.", currentAppStep: 'errorState' });
      return;
    }

    set({
      isLoading: true,
      isGeneratingExplanation: true, // Used for the first part
      error: null,
      currentAppStep: 'generatingExplanation',
      paraclinicalImagesBase64: [], // Ensure images are empty
    });

    _addHistory({ role: 'user', content: `[User chose to skip paraclinical data upload]` });
    const explanationPromptMessages = buildGeneratePatientExplanationPrompt(get().conversationHistory, []);

    try {
      // 1. Generate Patient Explanation (without images)
      const explanationResponse = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generatePatientExplanation',
          history: explanationPromptMessages,
          images: [],
        }),
      });

      if (!explanationResponse.ok) {
        const errorData = await explanationResponse.json();
        throw new Error(errorData.error || `API Error generating explanation (skipped): ${explanationResponse.statusText}`);
      }

      const explanationData = await explanationResponse.json();
      if (explanationData.type === 'patientExplanation' && explanationData.data) {
        _addHistory({ role: 'assistant', content: JSON.stringify(explanationData.data) });
        set({
          structuredPatientExplanation: explanationData.data,
          // isLoading: false, // Keep true for next step
          isGeneratingExplanation: false, // This part is done
          currentAppStep: 'generatingRecord', // Move to generating record
          isGeneratingRecord: true, // Indicate record generation started
          currentQuestions: [],
        });

        // Update consultation after explanation part
        if (currentConsultationId) {
          updateConsultation(currentConsultationId, {
            conversationHistory: get().conversationHistory,
            structuredPatientExplanation: get().structuredPatientExplanation,
            currentAppStep: 'generatingRecord', // Reflect current operation
            lastUpdated: Date.now(),
            paraclinicalImagesBase64: [],
          });
        }

        // 2. Automatically proceed to generate record (without images)
        const recordPromptMessages = buildGenerateRecordPrompt(get().conversationHistory, initialData, []);

        const recordResponse = await fetch('/api/ai-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generateRecord',
              history: recordPromptMessages,
              initialData: initialData,
              images: [],
            }),
        });

        if (!recordResponse.ok) {
            const errorData = await recordResponse.json();
            throw new Error(errorData.error || `API Error generating record (skipped): ${recordResponse.statusText}`);
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
            if (currentConsultationId) {
              const updatedConsultationData: Partial<Consultation> = {
                conversationHistory: get().conversationHistory,
                medicalRecord: get().medicalRecord,
                currentAppStep: 'viewResults',
                status: 'completed',
                lastUpdated: Date.now(),
              };
              updateConsultation(currentConsultationId, updatedConsultationData);
            }
        } else if (recordData.type === 'error') {
            throw new Error(recordData.error || 'API error generating record (skipped).');
        } else {
            throw new Error('Invalid API response for record (skipped).');
        }

      } else if (explanationData.type === 'error') {
        throw new Error(explanationData.error || 'API error generating explanation (skipped).');
      } else {
        throw new Error('Invalid API response for explanation (skipped).');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate results skipping paraclinical data.';
      set({ error: errorMessage, currentAppStep: 'errorState', isLoading: false, isGeneratingExplanation: false, isGeneratingRecord: false });
    }
  },

  generateRecord: async () => {
    const { conversationHistory, initialData, structuredPatientExplanation, paraclinicalImagesBase64, _addHistory, currentConsultationId } = get();
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
    const recordPromptMessages = buildGenerateRecordPrompt(get().conversationHistory, initialData, paraclinicalImagesBase64);

    try {
      const response = await fetch('/api/ai-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateRecord',
          history: recordPromptMessages,
          initialData: initialData,
          images: paraclinicalImagesBase64
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
        if (currentConsultationId) {
          const updatedConsultationData: Partial<Consultation> = {
            conversationHistory: get().conversationHistory,
            medicalRecord: get().medicalRecord,
            // structuredPatientExplanation is already set from previous step
            currentAppStep: 'viewResults',
            status: 'completed',
            lastUpdated: Date.now(),
          };
          updateConsultation(currentConsultationId, updatedConsultationData);
        }
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

  loadConsultation: async (consultationId: string) => {
    // Manually clear relevant fields before loading to avoid merging states
    set({
      currentConsultationId: null,
      initialData: null,
      conversationHistory: [],
      currentQuestions: [],
      currentExplanation: null,
      structuredPatientExplanation: null,
      medicalRecord: null,
      paraclinicalImagesBase64: [],
      currentAppStep: 'initial', // Default to initial before loading
      isSessionActive: false,
      isLoading: true, // Set loading true while fetching
      error: null,
      isComplete: false,
      isReadyForRecord: false,
      isGeneratingExplanation: false,
      isGeneratingRecord: false,
    });

    const consultation = getConsultationById(consultationId); // Synchronous call

    if (consultation) {
      set({
        currentConsultationId: consultation.id,
        initialData: consultation.initialData,
        conversationHistory: consultation.conversationHistory,
        currentQuestions: consultation.currentQuestions || [], // Ensure it's an array
        currentExplanation: consultation.currentExplanation,
        structuredPatientExplanation: consultation.structuredPatientExplanation,
        medicalRecord: consultation.medicalRecord,
        paraclinicalImagesBase64: consultation.paraclinicalImagesBase64 || [],
        currentAppStep: consultation.currentAppStep,
        isSessionActive: true, // A loaded session is active
        isLoading: false, // Done loading
        error: null,
        isComplete: consultation.status === 'completed',
        // Determine isReadyForRecord based on the loaded step
        isReadyForRecord: consultation.currentAppStep === 'paraclinicalUpload' ||
                          consultation.currentAppStep === 'viewExplanation' ||
                          (consultation.currentAppStep === 'anamnesis' && (consultation.currentQuestions || []).length === 0 && !!consultation.currentExplanation), // More robust check
      });
    } else {
      set({ error: `Consultation with ID ${consultationId} not found.`, isLoading: false, currentAppStep: 'initial' });
    }
  },
}));
