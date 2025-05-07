import { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";

// Define interfaces matching the blueprint's JSON structure
interface Question {
  id: string;
  text: string;
  suggestions?: string[];
}

interface QuestionResponse {
  explanation: string;
  questions: Question[];
}

// Interface for signaling readiness to generate the final record (Updated)
interface ReadyForRecordResponse {
  readyForRecord: true;
  explanation?: string; // Optional explanation for why it's ready
}

// Interface for the structured Patient Explanation (New)
interface PatientExplanationData {
    mostProbableDiagnosis: string[]; // Sorted array of potential diagnoses
    advice: string;                  // General advice
    recommendedSpecialists: string[]; // Sorted array of specialist types
}

// Interface for the actual final medical record data (Renamed for clarity)
interface MedicalRecordResponse {
  medicalRecord: string; // The medical record content as a markdown string
}


// Define the core system prompt for the anamnesis phase (Updated)
const ANAMNESIS_SYSTEM_PROMPT_CONTENT = `Consultation Time: {TIME}
Your task is to conduct a thorough diagnostic conversation.
**Process to Follow:**

1. **Initiate & Chief Complaint:** Start by asking about the chief complaint and how long it's been going on.
2. **History of Present Illness (HPI):** This is the core. Systematically explore the primary symptom(s) using a framework like **SOCRATES** or **OPQRST**:
3. **Review of Systems (ROS):** Briefly ask about symptoms in other body systems (e.g., constitutional like fever/chills/weight change, head/neck, cardiovascular, respiratory, gastrointestinal, genitourinary, neurological, skin, musculoskeletal) to uncover potentially related issues. Ask general screening questions for each system unless a specific symptom points elsewhere.
4. **Past Medical History (PMH):** Ask about chronic illnesses, past major illnesses, surgeries, hospitalizations, and relevant screenings/vaccinations.
5. **Medications & Allergies:** Ask about all current medications (prescription, over-the-counter), supplements, and any known allergies (drugs, food, environmental).
6. **Family History (FH):** Ask about significant illnesses in immediate family members (parents, siblings, children), especially conditions that might be relevant (e.g., heart disease, diabetes, cancer, autoimmune conditions).
7. **Social History (SH):** Briefly inquire about relevant lifestyle factors like smoking, alcohol use, recreational drug use, occupation, living situation, diet, exercise, and stress levels, *only as potentially relevant* to the symptoms presented.
8. **Clarification & Summary:** Ask clarifying questions as needed.
9. **Red Flag Check & Disclaimer:** Explicitly ask if there are any 'red flag' symptoms (e.g., sudden severe pain, difficulty breathing, chest pain, neurological deficits like weakness/numbness/confusion, unexplained weight loss, blood where it shouldn't be).

**CRITICAL: Your output MUST be a single JSON object.**

**WRITE IN FRENCH**

**Output Format for Asking Questions:**
When asking questions, the JSON object MUST have this structure:
\`\`\`json
{
  "explanation": "A brief, reassuring explanation of the current step or why you're asking these questions.",
  "questions": [
    { "id": "qN", "text": "The question text.", "suggestions": ["Suggestion 1", "Suggestion 2", "..."] },
    { "id": "qN+1", "text": "Another question text.", "suggestions": ["...", "..."] }
  ]
}
\`\`\`
- Each question MUST have a unique \`id\` (e.g., "q1", "q2").
- Include relevant \`suggestions\` as an array of strings to help the user answer.

**Output Format for Signaling Readiness to Conclude:**
When you determine you have sufficient information to theorize a diagnosis and write a Medical Record, output ONLY this JSON object:
\`\`\`json
{
  "readyForRecord": true
}
\`\`\`
- A separate request will be made to find the right diagnosis and generate a Medical Record (record to be given to a doctor) based on your conversation with the patient.

Start the conversation by asking initial questions based on the user's provided age, gender, and initial complaint.`;

// Define the system prompt specifically for generating the PATIENT EXPLANATION (Updated for images)
const PATIENT_EXPLANATION_SYSTEM_PROMPT_CONTENT = `Consultation Time: {TIME}
Based on the provided diagnosis conversation history AND ANY SUBMITTED PARACLINICAL EXAM IMAGES, you are tasked with identifying the patient's diagnosis and guiding him to get the best help. Analyze the images provided along with the text.
**CRITICAL: Your output MUST be a single JSON object.**
**WRITE IN FRENCH**

**Analysis Task:**
1.  Reason and identify the most likely diagnoses, considering all available information including conversation history and any provided paraclinical exam images. Rank them from most likely to least likely.
2.  Formulate general wellness advice relevant to the patient's situation, incorporating insights from conversation and any paraclinical exams.
3.  Recommend the types of medical specialists the patient should consider consulting, informed by all data. Rank them by relevance or urgency if possible.

**Output Format:**
The JSON object MUST contain exactly these three keys: "mostProbableDiagnosis", "advice", and "recommendedSpecialists".
\`\`\`json
{
  "mostProbableDiagnosis": [
    "Most Likely Diagnosis",
    "Second Most Likely Diagnosis",
    "..."
  ],
  "advice": "General wellness advice based on the conversation and any provided paraclinical exam images.",
  "recommendedSpecialists": [
    "Most Relevant Specialist Type",
    "Second Most Relevant Specialist Type",
    "..."
  ]
}
\`\`\`
- \`mostProbableDiagnosis\`: Must be an array of strings, sorted by likelihood. Phrase these carefully as possibilities, not certainties.
- \`advice\`: Must be a single string.
- \`recommendedSpecialists\`: Must be an array of strings, sorted by relevance/urgency.
- Do NOT include any conversational text outside the JSON object.
- Do NOT ask any further questions.`;


// Define the system prompt specifically for generating the final MEDICAL RECORD (Updated for images)
const RECORD_SYSTEM_PROMPT_CONTENT = `Consultation Time: {TIME}
You tasked with synthesizing a Medical Record based on a provided medical anamnesis conversation AND ANY SUBMITTED PARACLINICAL EXAM IMAGES. Use bullet points. Analyze the images provided along with the text.
**CRITICAL: Your output MUST be a single JSON object.**
**WRITE IN FRENCH**

**Output Format for Final Medical Record:**
The JSON object MUST contain exactly one key: "medicalRecord". The value must be a string containing the markdown content of the Medical Record.
\`\`\`json
{
 "medicalRecord": "A markdown file containning a Medical Observation based on the provided conversation history and any submitted paraclinical exam images."
}
\`\`\`
- Do NOT include any conversational text outside the JSON object.
- Do NOT ask any further questions.
- Do NOT ask about documents; summarize them if they were part of the history provided (this includes any uploaded paraclinical exam images).`;


// Function to get the current local time in a readable format
function getCurrentLocalTime(): string {
    return new Date().toLocaleString();
}

// Interface for initial user data
interface InitialData {
  fullName: string;
  age: string;
  gender: string;
  complaint: string;
}

// Function to build the initial prompt, now accepting initial data
export function buildInitialPrompt(initialData: InitialData): ChatCompletionMessageParam[] {
    const currentTime = getCurrentLocalTime();
    const anamnesisSystemPromptWithTime: ChatCompletionMessageParam = {
        role: "system",
        content: ANAMNESIS_SYSTEM_PROMPT_CONTENT.replace('{TIME}', currentTime),
    };

  return [
    anamnesisSystemPromptWithTime,
    {
      role: "user",
      content: `Start the medical anamnesis. Here is the initial patient information:
- Age: ${initialData.age}
- Gender: ${initialData.gender}
- Initial Complaint/Reason for Consultation: ${initialData.complaint}

Ask the first set of relevant questions based on this information. Remember to strictly follow the JSON output format for questions.`,
    },
  ];
}

// Function to build subsequent prompts based on history
export function buildNextPrompt(history: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    const currentTime = getCurrentLocalTime();
    const anamnesisSystemPromptWithTime: ChatCompletionMessageParam = {
        role: "system",
        content: ANAMNESIS_SYSTEM_PROMPT_CONTENT.replace('{TIME}', currentTime),
    };

  const nextStepInstruction: ChatCompletionMessageParam = {
    role: "user",
    content: `Based on the conversation history above, continue the diagnosis conversation. Ask the next set of relevant questions OR, if you have sufficient information, signal that you are ready to conclude by outputting ONLY the required JSON object.

    **CRITICAL: Your output MUST be a single JSON object matching one of the formats specified in the system prompt.**

    If asking questions, use this format:
    \`\`\`json
    {
      "explanation": "...",
      "questions": [ ... ]
    }
    \`\`\`

    If ready to conclude, use ONLY this format:
    \`\`\`json
    {
      "readyForRecord": true,
      "explanation"?: "Optional explanation..."
    }`,
  };

  // Ensure the ANAMNESIS_SYSTEM_PROMPT is always the first message
  const historyWithoutSystem = history.filter(msg => msg.role !== 'system');
  return [anamnesisSystemPromptWithTime, ...historyWithoutSystem, nextStepInstruction];
}


// Function to build the prompt specifically requesting the PATIENT EXPLANATION (Updated for images)
export function buildGeneratePatientExplanationPrompt(
    history: ChatCompletionMessageParam[],
    imagesBase64?: string[] // Parameter for base64 images
): ChatCompletionMessageParam[] {
    const currentTime = getCurrentLocalTime();
    const patientExplanationSystemPromptWithTime: ChatCompletionMessageParam = {
        role: "system",
        content: PATIENT_EXPLANATION_SYSTEM_PROMPT_CONTENT.replace('{TIME}', currentTime),
    };

    if (!history || history.length === 0) {
        console.error("buildGeneratePatientExplanationPrompt received empty or invalid history.");
        return [
            patientExplanationSystemPromptWithTime,
            { role: "user", content: "Error: Cannot generate patient explanation from empty history." }
        ];
    }

    const conversationHistoryWithoutSystem = history.filter(msg => msg.role !== 'system');

    const messages: ChatCompletionMessageParam[] = [
        patientExplanationSystemPromptWithTime,
        ...conversationHistoryWithoutSystem,
    ];

    // Construct the multimodal content for the final instruction message
    const instructionContent: Array<ChatCompletionContentPart> = [
        {
            type: "text",
            text: `Based on the entire conversation history AND the submitted paraclinical exam images (if any), generate the patient explanation.
            **CRITICAL: Your output MUST be a single JSON object strictly following the format specified in the system prompt:**
            \`\`\`json
            {
              "mostProbableDiagnosis": ["...", "..."],
              "advice": "...",
              "recommendedSpecialists": ["...", "..."]
            }
            \`\`\`
            Ensure the arrays are sorted appropriately (diagnosis by likelihood, specialists by relevance). Analyze the images provided.`
        }
    ];

    // Add image parts if provided
    if (imagesBase64 && imagesBase64.length > 0) {
        imagesBase64.forEach(base64String => {
            // Basic check for base64 prefix (though fileToBase64 should remove it)
            const cleanBase64 = base64String.startsWith('data:') ? base64String.split(',')[1] : base64String;
            if (cleanBase64) {
                instructionContent.push({
                    type: "image_url",
                    image_url: {
                        // Assuming JPEG for now, might need to detect mime type or require specific format
                        url: `data:image/jpeg;base64,${cleanBase64}`,
                        detail: "auto" // Or "low" / "high" depending on needs
                    }
                });
            }
        });
    }

    const generateInstruction: ChatCompletionMessageParam = {
        role: "user",
        content: instructionContent // Use the array of content parts
    };
    messages.push(generateInstruction);
    return messages;
}


// Function to build the prompt specifically requesting the final MEDICAL RECORD (Updated for images)
export function buildGenerateRecordPrompt(
    history: ChatCompletionMessageParam[],
    initialData: InitialData,
    imagesBase64?: string[] // Parameter for base64 images
): ChatCompletionMessageParam[] {
    const currentTime = getCurrentLocalTime();
    const recordSystemPromptWithTime: ChatCompletionMessageParam = {
        role: "system",
        content: RECORD_SYSTEM_PROMPT_CONTENT.replace('{TIME}', currentTime),
    };

  if (!history || history.length === 0) {
      console.error("buildGenerateRecordPrompt received empty or invalid history.");
      const generateInstruction: ChatCompletionMessageParam = {
          role: "user",
          content: `Error: Cannot generate medical record. The conversation history is missing.
Initial Patient Information (if available):
- Age: ${initialData?.age || 'N/A'}
- Gender: ${initialData?.gender || 'N/A'}
- Initial Complaint: ${initialData?.complaint || 'N/A'}`,
      };
       return [recordSystemPromptWithTime, generateInstruction];
  }

  // Filter out any system prompts from the history
  const conversationHistoryWithoutSystem = history.filter(msg => msg.role !== 'system');

  // Filter out any previous Patient Explanation messages from the history
  const conversationHistoryWithoutExplanation = conversationHistoryWithoutSystem.filter(msg => {
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
          try {
              const parsedContent = JSON.parse(msg.content);
              if (
                  'mostProbableDiagnosis' in parsedContent && Array.isArray(parsedContent.mostProbableDiagnosis) &&
                  'advice' in parsedContent && typeof parsedContent.advice === 'string' &&
                  'recommendedSpecialists' in parsedContent && Array.isArray(parsedContent.recommendedSpecialists) &&
                  Object.keys(parsedContent).length === 3
              ) {
                  return false; // Exclude this message
              }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_) { /* Ignore parsing errors */ }
      }
      return true; // Keep other messages
  });

  const messages: ChatCompletionMessageParam[] = [
    recordSystemPromptWithTime,
    ...conversationHistoryWithoutExplanation, // Use the filtered history
  ];

    // Construct the multimodal content for the final instruction message
    const instructionText = `Based on the initial patient information, the conversation history, AND the submitted paraclinical exam images (if any), please generate the final Medical Record (for a doctor).

    Initial Patient Information:
    - Age: ${initialData.age}
    - Gender: ${initialData.gender}
    - Initial Complaint/Reason for Consultation: ${initialData.complaint}

    The full conversation history and submitted images are provided in the messages above. Analyze the images as part of generating the record.

    **CRITICAL: Your output MUST be a single JSON object containing only the 'medicalRecord' key, with the value being a string containing the markdown record, as specified in the system prompt.**
    \`\`\`json
    {
      "medicalRecord": "..."
    }
    \`\`\`
    **IMPORTANT PRIVACY INSTRUCTION:** When generating the medical record, use the exact placeholder \`[PATIENT_FULL_NAME]\` wherever the patient's full name should appear.

    Do not include any other text or explanations outside this JSON structure. Synthesize the record from all provided information, including the images.`;

    const instructionContent: Array<ChatCompletionContentPart> = [{ type: "text", text: instructionText }];

    // Add image parts if provided
    if (imagesBase64 && imagesBase64.length > 0) {
        imagesBase64.forEach(base64String => {
            const cleanBase64 = base64String.startsWith('data:') ? base64String.split(',')[1] : base64String;
            if (cleanBase64) {
                instructionContent.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${cleanBase64}`, // Assuming JPEG
                        detail: "auto"
                    }
                });
            }
        });
    }

    const generateInstruction: ChatCompletionMessageParam = {
        role: "user",
        content: instructionContent // Use the array of content parts
    };
    messages.push(generateInstruction);
    return messages;
}


// Updated parser function to handle questions, readiness signal, patient explanation, and medical record
export function parseAIResponse(response: unknown):
  | { type: 'questions', data: QuestionResponse }
  | { type: 'readyForRecord', data: ReadyForRecordResponse }
  | { type: 'patientExplanation', data: PatientExplanationData }
  | { type: 'medicalRecord', data: MedicalRecordResponse }
  | { type: 'error', message: string }
{
  console.log("parseAIResponse received:", response); // Added debug log

  if (typeof response !== 'object' || response === null) {
      // Log the type if it's not an object or null
      console.error(`parseAIResponse expected an object, but received type: ${typeof response}, value:`, response);
      return { type: 'error', message: `Invalid AI response format: Expected object, received ${typeof response}.` };
  }

  try {
    // 1. Check for the "Ready for Record" signal
    if ('readyForRecord' in response && response.readyForRecord === true) {
        const resp = response as { readyForRecord: true, explanation?: unknown };
        if ('explanation' in resp && resp.explanation && typeof resp.explanation !== 'string') {
            return { type: 'error', message: 'Invalid explanation type in readyForRecord response.' };
        }
        const allowedKeys = ['readyForRecord', 'explanation'];
        const extraKeys = Object.keys(resp).filter(key => !allowedKeys.includes(key));
        if (extraKeys.length > 0) {
             return { type: 'error', message: `Unexpected keys in readyForRecord response: ${extraKeys.join(', ')}. Expected only 'readyForRecord' and optional 'explanation'.` };
        }
        const responseData: ReadyForRecordResponse = { readyForRecord: true };
        if (resp.explanation && typeof resp.explanation === 'string') {
            responseData.explanation = resp.explanation;
        }
        return { type: 'readyForRecord', data: responseData };
    }

    // 2. Check for the Patient Explanation structure
    if (
        'mostProbableDiagnosis' in response && Array.isArray(response.mostProbableDiagnosis) && response.mostProbableDiagnosis.every((item: unknown) => typeof item === 'string') &&
        'advice' in response && typeof response.advice === 'string' &&
        'recommendedSpecialists' in response && Array.isArray(response.recommendedSpecialists) && response.recommendedSpecialists.every((item: unknown) => typeof item === 'string')
    ) {
        const resp = response as { mostProbableDiagnosis: string[], advice: string, recommendedSpecialists: string[] };
        const allowedKeys = ['mostProbableDiagnosis', 'advice', 'recommendedSpecialists'];
        const extraKeys = Object.keys(resp).filter(key => !allowedKeys.includes(key));
        if (extraKeys.length > 0) {
             return { type: 'error', message: `Unexpected keys in patientExplanation response: ${extraKeys.join(', ')}` };
        }
        return { type: 'patientExplanation', data: resp as PatientExplanationData };
    }

    // 3. Check for the final medical record structure
    if ('medicalRecord' in response && typeof response.medicalRecord === 'string' && Object.keys(response).length === 1) {
        return { type: 'medicalRecord', data: { medicalRecord: response.medicalRecord } };
    }

    // 4. Check for the question structure
    if ('explanation' in response && typeof response.explanation === 'string' && 'questions' in response && Array.isArray(response.questions)) {
       const resp = response as { explanation: string, questions: unknown[] };
       if (resp.questions.every((q: unknown) =>
           typeof q === 'object' && q !== null &&
           'id' in q && typeof (q as Question).id === 'string' &&
           'text' in q && typeof (q as Question).text === 'string' &&
           (!('suggestions' in q) || (Array.isArray((q as Question).suggestions) && (q as Question).suggestions?.every(s => typeof s === 'string')))
       )) {
            const allowedKeys = ['explanation', 'questions'];
            const extraKeys = Object.keys(resp).filter(key => !allowedKeys.includes(key));
            if (extraKeys.length > 0) {
                 return { type: 'error', message: `Unexpected keys in questions response: ${extraKeys.join(', ')}` };
            }
           return { type: 'questions', data: resp as QuestionResponse };
       } else {
          return { type: 'error', message: 'Invalid structure within questions array.' };
       }
    }

    // 5. If none of the above match, it's an unexpected format
    console.error("Unexpected AI response format received (parseAIResponse):", response);
    // Add more specific checks if needed based on common errors
    return { type: 'error', message: `Unexpected AI response format. Keys found: ${Object.keys(response).join(', ')}. Does not match expected structures.` };

  } catch (error) {
    console.error("Error parsing or validating AI response:", error);
    if (error instanceof SyntaxError) {
        return { type: 'error', message: `Failed to parse AI response as JSON: ${error.message}` };
    }
    return { type: 'error', message: `Failed to process AI response: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Export the new interface type if needed elsewhere (optional)
export type { PatientExplanationData };
