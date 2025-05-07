import { NextResponse } from 'next/server';
import OpenAI from 'openai'; // Import OpenAI if you need to check for specific API errors
import { getAIResponse } from '@/lib/services/openaiService';
import {
    buildInitialPrompt,
    buildNextPrompt,
    buildGeneratePatientExplanationPrompt,
    buildGenerateRecordPrompt,
    parseAIResponse
} from '@/lib/utils/promptBuilder';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Define expected request body structures based on action
interface BaseRequest {
    action: 'start' | 'next' | 'generatePatientExplanation' | 'generateRecord';
}

interface StartRequest extends BaseRequest {
    action: 'start';
    initialData: {
        fullName: string;
        age: string;
        gender: string;
        complaint: string;
    };
}

interface NextRequest extends BaseRequest {
    action: 'next';
    history: ChatCompletionMessageParam[];
}

interface GeneratePatientExplanationRequest extends BaseRequest {
    action: 'generatePatientExplanation';
    history: ChatCompletionMessageParam[];
    images?: string[]; // Optional base64 image strings
}

interface GenerateRecordRequest extends BaseRequest {
    action: 'generateRecord';
    history: ChatCompletionMessageParam[];
    images?: string[]; // Optional base64 image strings
    initialData: {
        fullName: string;
        age: string;
        gender: string;
        complaint: string;
    };
}

// Type guard functions for validation
function isStartRequest(body: unknown): body is StartRequest {
    return typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'start' &&
           'initialData' in body && typeof (body as {initialData: unknown}).initialData === 'object' && (body as {initialData: object | null}).initialData !== null &&
           typeof ((body as StartRequest).initialData as {fullName: unknown}).fullName === 'string' &&
           typeof ((body as StartRequest).initialData as {age: unknown}).age === 'string' &&
           typeof ((body as StartRequest).initialData as {gender: unknown}).gender === 'string' &&
           typeof ((body as StartRequest).initialData as {complaint: unknown}).complaint === 'string';
}

function isNextRequest(body: unknown): body is NextRequest {
    return typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'next' &&
           'history' in body && Array.isArray((body as {history: unknown}).history) &&
           ((body as NextRequest).history as ChatCompletionMessageParam[]).length > 0;
}

function isGeneratePatientExplanationRequest(body: unknown): body is GeneratePatientExplanationRequest {
    const check = typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'generatePatientExplanation' &&
           'history' in body && Array.isArray((body as {history: unknown}).history) &&
           ((body as GeneratePatientExplanationRequest).history as ChatCompletionMessageParam[]).length > 0 &&
           // Check for optional images array
           (!('images' in body) || (Array.isArray((body as {images: unknown}).images) && (body as {images: string[]}).images.every(img => typeof img === 'string')));
    return check;
}

function isGenerateRecordRequest(body: unknown): body is GenerateRecordRequest {
    const check = typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'generateRecord' &&
           'history' in body && Array.isArray((body as {history: unknown}).history) &&
           ((body as GenerateRecordRequest).history as ChatCompletionMessageParam[]).length > 0 &&
           // Check for optional images array
           (!('images' in body) || (Array.isArray((body as {images: unknown}).images) && (body as {images: string[]}).images.every(img => typeof img === 'string'))) &&
           'initialData' in body && typeof (body as {initialData: unknown}).initialData === 'object' && (body as {initialData: object | null}).initialData !== null &&
           typeof ((body as GenerateRecordRequest).initialData as {fullName: unknown}).fullName === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {age: unknown}).age === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {gender: unknown}).gender === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {complaint: unknown}).complaint === 'string';
    return check;
}

// Helper to log character codes
function logCharCodes(str: string, label: string) {
    const codes = [];
    for (let i = 0; i < str.length; i++) {
        codes.push(str.charCodeAt(i));
    }
    console.log(`${label} (length ${str.length}) char codes: [${codes.join(', ')}]`);
}


export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    let messages: ChatCompletionMessageParam[] | undefined = undefined;
    let expectedResponseType: 'questions' | 'readyForRecord' | 'patientExplanation' | 'medicalRecord' | 'any' = 'any';
    let fullName = '';

    if (typeof body !== 'object' || body === null || !('action' in body) || typeof (body as {action: unknown}).action !== 'string') {
        return NextResponse.json({ error: 'Invalid request body: missing or invalid action.' }, { status: 400 });
    }

    // Trim the action string to remove potential leading/trailing whitespace
    const action = (body as BaseRequest).action.trim();

    console.log("API Route received action (trimmed):", action);
    logCharCodes(action, "Received action"); // Log char codes for received action
    logCharCodes('generatePatientExplanation', "Literal 'generatePatientExplanation'"); // Log char codes for literal

    // Using if/else if for clarity during debugging
    console.log(`Checking if action === 'start' (${action === 'start'})`);
    if (action === 'start') {
        console.log("Entered 'start' block");
        if (!isStartRequest(body)) {
            console.log("Validation failed for 'start'");
            return NextResponse.json({ error: 'Invalid request body for action="start". Required: { action: "start", initialData: { fullName, age, gender, complaint } }.' }, { status: 400 });
        }
        messages = buildInitialPrompt(body.initialData);
        expectedResponseType = 'questions';
    } else {
        console.log(`Checking if action === 'next' (${action === 'next'})`);
        if (action === 'next') {
            console.log("Entered 'next' block");
            if (!isNextRequest(body)) {
                 console.log("Validation failed for 'next'");
                return NextResponse.json({ error: 'Invalid request body for action="next". Required: { action: "next", history: [...] } (history must not be empty).' }, { status: 400 });
            }
            messages = buildNextPrompt(body.history);
            expectedResponseType = 'any';
        } else {
             // Try comparing using localeCompare as well
             const isGenerateExplanation = action.localeCompare('generatePatientExplanation') === 0;
             console.log(`Checking if action.localeCompare('generatePatientExplanation') === 0 (${isGenerateExplanation})`);

             if (isGenerateExplanation) { // Use localeCompare result
                 console.log("Entered 'generatePatientExplanation' block");
                 if (!isGeneratePatientExplanationRequest(body)) {
                      console.log("Validation failed for 'generatePatientExplanation'");
                     return NextResponse.json({ error: 'Invalid request body for action="generatePatientExplanation". Required: { action: "generatePatientExplanation", history: [...], images?: [...] } (history must not be empty).' }, { status: 400 });
                 }
                messages = buildGeneratePatientExplanationPrompt(body.history, body.images);
                expectedResponseType = 'patientExplanation';
            } else {
                 console.log(`Checking if action === 'generateRecord' (${action === 'generateRecord'})`);
                 if (action === 'generateRecord') {
                     console.log("Entered 'generateRecord' block");
                      if (!isGenerateRecordRequest(body)) {
                           console.log("Validation failed for 'generateRecord'");
                          return NextResponse.json({ error: 'Invalid request body for action="generateRecord". Required: { action: "generateRecord", history: [...], initialData: { fullName, age, gender, complaint }, images?: [...] } (history must not be empty).' }, { status: 400 });
                      }
                     fullName = body.initialData.fullName;
                     messages = buildGenerateRecordPrompt(body.history, body.initialData, body.images);
                     console.log("--- Full Prompt for Generate Record ---");
                     console.log(`Prompt includes ${messages.length} messages. Last message content type: ${typeof messages[messages.length - 1].content}`);
                     console.log("---------------------------------------");
                     expectedResponseType = 'medicalRecord';
                } else {
                    // Default case if action doesn't match known values
                    console.error(`Invalid action received (final else): ${action}`);
                    return NextResponse.json({ error: `Invalid action field. Received: ${action}` }, { status: 400 });
                }
            }
        }
    }


    // Check if messages were assigned (should always happen if action is valid and validation passes)
    if (!messages) {
         console.error(`Message generation failed for action: ${action}. This should not happen if validation passed.`);
         return NextResponse.json({ error: 'Internal server error: Failed to generate AI prompt.' }, { status: 500 });
    }

    const aiResponseRaw = await getAIResponse(messages);

    // Check if the response from getAIResponse is a structured error object
    if (aiResponseRaw && typeof aiResponseRaw === 'object' && 'type' in aiResponseRaw && aiResponseRaw.type === 'error') { // Simplified check
        const serviceError = aiResponseRaw as { type: 'error', message: string, details?: unknown, rawContent?: unknown };

        // Log the specific error from the service
        console.error(`Error received from getAIResponse for action "${action}":`, serviceError);

        // Check if the detailed error is an OpenAI APIError to get status code
        let statusCode = 500;
        if (serviceError.details instanceof OpenAI.APIError) {
            statusCode = serviceError.details.status || 500;
        }

        return NextResponse.json({
            type: 'error',
            error: serviceError.message || 'Error from AI service.', // Use message from service error
            details: serviceError.details // Pass along details if available
        }, { status: statusCode });
    }


    const parsedResponse = parseAIResponse(aiResponseRaw); // Pass the raw response directly

    if (parsedResponse.type === 'error') {
      console.error(`Error parsing AI response structure for action "${action}":`, parsedResponse.message, "\nRaw AI Response:", JSON.stringify(aiResponseRaw, null, 2));
      return NextResponse.json({ type: 'error', error: 'Failed to process the AI response structure. Please try again.', details: parsedResponse.message }, { status: 500 });
    }

    if (expectedResponseType !== 'any' && parsedResponse.type !== expectedResponseType) {
        console.warn(`Unexpected response type for action "${action}". Expected "${expectedResponseType}", but received "${parsedResponse.type}". Raw Response: ${JSON.stringify(aiResponseRaw, null, 2)}`);
        return NextResponse.json({
            type: 'error',
            error: `AI returned an unexpected response type. Expected ${expectedResponseType} but got ${parsedResponse.type}.`,
            details: `Received data structure: ${JSON.stringify(parsedResponse.data, null, 2)}`
        }, { status: 500 });
    }

    // Replace placeholder in the final record
    if (action === 'generateRecord' && parsedResponse.type === 'medicalRecord' && typeof parsedResponse.data?.medicalRecord === 'string') {
        // Ensure body is narrowed correctly to access initialData.fullName safely
        if (isGenerateRecordRequest(body)) {
            const placeholder = '[PATIENT_FULL_NAME]';
            // Use fullName captured earlier
            const finalRecord = parsedResponse.data.medicalRecord.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), fullName);
            if (parsedResponse.data) {
                parsedResponse.data.medicalRecord = finalRecord;
            }
            console.log(`Replaced "${placeholder}" with patient's name in medical record.`);
        } else {
             console.error("Type guard failed unexpectedly within generateRecord action after successful switch case.");
             // Handle this inconsistency? Maybe return an error.
        }
    }

    return NextResponse.json({
        type: parsedResponse.type,
        data: parsedResponse.data
    });

  } catch (error) {
    console.error("--- Error in API Route ---");
    let errorMessage = 'An unexpected internal server error occurred.';
    let statusCode = 500;

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        errorMessage = 'Invalid JSON received in request body.';
        statusCode = 400;
        console.error("Request Body Parsing Error:", error);
    } else if (error instanceof OpenAI.APIError) {
        // This might catch errors during the initial request.json() if the APIError bubbles up that far
        console.error("OpenAI API Error:", error);
        errorMessage = `AI service error: ${error.message}`;
        statusCode = error.status || 500;
    } else if (error instanceof Error) {
        console.error("Generic Error:", error);
        errorMessage = error.message;
    } else {
        console.error("Unknown Error Type:", error);
    }

    return NextResponse.json({ type: 'error', error: errorMessage }, { status: statusCode });
  }
}
