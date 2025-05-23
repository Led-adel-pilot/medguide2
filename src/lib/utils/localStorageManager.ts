// Placeholder types (if actual import is not feasible for this subtask)
export type AppStep = string; // Simplified for placeholder
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

const CONSULTATION_HISTORY_KEY = 'medguideAiConsultationHistory';

export const saveConsultation = (consultationData: Consultation): void => {
  try {
    const historyJson = localStorage.getItem(CONSULTATION_HISTORY_KEY);
    const history: Consultation[] = historyJson ? JSON.parse(historyJson) : [];
    history.push(consultationData);
    localStorage.setItem(CONSULTATION_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving consultation to local storage:', error);
  }
};

export const getConsultations = (): Consultation[] => {
  try {
    const historyJson = localStorage.getItem(CONSULTATION_HISTORY_KEY);
    if (!historyJson) {
      return [];
    }
    return JSON.parse(historyJson) as Consultation[];
  } catch (error) {
    console.error('Error getting consultations from local storage:', error);
    return [];
  }
};

export const getConsultationById = (id: string): Consultation | undefined => {
  try {
    const consultations = getConsultations();
    return consultations.find(consultation => consultation.id === id);
  } catch (error) {
    console.error('Error getting consultation by ID from local storage:', error);
    return undefined;
  }
};

export const updateConsultation = (id: string, updatedPartialData: Partial<Consultation>): void => {
  try {
    const consultations = getConsultations();
    const consultationIndex = consultations.findIndex(consultation => consultation.id === id);

    if (consultationIndex !== -1) {
      consultations[consultationIndex] = {
        ...consultations[consultationIndex],
        ...updatedPartialData,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(CONSULTATION_HISTORY_KEY, JSON.stringify(consultations));
    } else {
      console.warn(`Consultation with ID "${id}" not found. Cannot update.`);
    }
  } catch (error) {
    console.error('Error updating consultation in local storage:', error);
  }
};

export const deleteConsultation = (id: string): void => {
  try {
    let consultations = getConsultations();
    consultations = consultations.filter(consultation => consultation.id !== id);
    localStorage.setItem(CONSULTATION_HISTORY_KEY, JSON.stringify(consultations));
  } catch (error) {
    console.error('Error deleting consultation from local storage:', error);
  }
};
