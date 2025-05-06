import { NextResponse } from 'next/server';
import OpenAI from 'openai'; // Import OpenAI if you need to check for specific API errors
import { getAIResponse } from '@/lib/services/openaiService';
import {
    buildInitialPrompt,
    buildNextPrompt,
    buildGeneratePatientExplanationPrompt, // Import new builder
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
}

interface GenerateRecordRequest extends BaseRequest {
    action: 'generateRecord';
    history: ChatCompletionMessageParam[];
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
    return typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'generatePatientExplanation' &&
           'history' in body && Array.isArray((body as {history: unknown}).history) &&
           ((body as GeneratePatientExplanationRequest).history as ChatCompletionMessageParam[]).length > 0;
}

function isGenerateRecordRequest(body: unknown): body is GenerateRecordRequest {
    return typeof body === 'object' && body !== null &&
           'action' in body && (body as {action: unknown}).action === 'generateRecord' &&
           'history' in body && Array.isArray((body as {history: unknown}).history) &&
           ((body as GenerateRecordRequest).history as ChatCompletionMessageParam[]).length > 0 &&
           'initialData' in body && typeof (body as {initialData: unknown}).initialData === 'object' && (body as {initialData: object | null}).initialData !== null &&
           typeof ((body as GenerateRecordRequest).initialData as {fullName: unknown}).fullName === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {age: unknown}).age === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {gender: unknown}).gender === 'string' &&
           typeof ((body as GenerateRecordRequest).initialData as {complaint: unknown}).complaint === 'string';
}


export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    let messages: ChatCompletionMessageParam[];
    let expectedResponseType: 'questions' | 'readyForRecord' | 'patientExplanation' | 'medicalRecord' | 'any' = 'any';
    let fullName = '';

    if (typeof body !== 'object' || body === null || !('action' in body) || typeof (body as {action: unknown}).action !== 'string') {
        return NextResponse.json({ error: 'Invalid request body: missing or invalid action.' }, { status: 400 });
    }
    const action = (body as BaseRequest).action;

    switch (action) {
      case 'start':
        if (!isStartRequest(body)) {
            return NextResponse.json({ error: 'Invalid request body for action="start". Required: { action: "start", initialData: { fullName, age, gender, complaint } }.' }, { status: 400 });
        }
        messages = buildInitialPrompt(body.initialData);
        expectedResponseType = 'questions';
        break;

      case 'next':
        if (!isNextRequest(body)) {
            return NextResponse.json({ error: 'Invalid request body for action="next". Required: { action: "next", history: [...] } (history must not be empty).' }, { status: 400 });
        }
        messages = buildNextPrompt(body.history);
        expectedResponseType = 'any';
        break;

      case 'generatePatientExplanation':
         if (!isGeneratePatientExplanationRequest(body)) {
             return NextResponse.json({ error: 'Invalid request body for action="generatePatientExplanation". Required: { action: "generatePatientExplanation", history: [...] } (history must not be empty).' }, { status: 400 });
         }
        messages = buildGeneratePatientExplanationPrompt(body.history);
        expectedResponseType = 'patientExplanation';
        break;

       case 'generateRecord':
          if (!isGenerateRecordRequest(body)) {
              return NextResponse.json({ error: 'Invalid request body for action="generateRecord". Required: { action: "generateRecord", history: [...], initialData: { fullName, age, gender, complaint } } (history must not be empty).' }, { status: 400 });
          }
         fullName = body.initialData.fullName;
         messages = buildGenerateRecordPrompt(body.history, body.initialData);
         console.log("--- Full Prompt for Generate Record ---");
         console.log(JSON.stringify(messages, null, 2));
         console.log("---------------------------------------");
         expectedResponseType = 'medicalRecord';
         break;

      default:
        return NextResponse.json({ error: `Invalid action field. Received: ${action}` }, { status: 400 });
    }

    const aiResponseRaw = await getAIResponse(messages);

    if (aiResponseRaw && typeof aiResponseRaw === 'object' && 'type' in aiResponseRaw && aiResponseRaw.type === 'error' && 'message' in aiResponseRaw && aiResponseRaw.message === 'Failed to parse AI response as JSON.') {
        const errorDetails = aiResponseRaw as { details?: unknown, rawContent?: unknown };
        console.error("AI response JSON parsing failed in openaiService:", errorDetails.details, "\nRaw AI Response Content:", errorDetails.rawContent);
        return NextResponse.json({
            type: 'error',
            error: 'Failed to parse AI response from service.',
            details: errorDetails.details,
            rawContent: errorDetails.rawContent
        }, { status: 500 });
    }

    const parsedResponse = parseAIResponse(aiResponseRaw as string | Record<string, unknown>);

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

    if (action === 'generateRecord' && isGenerateRecordRequest(body) && parsedResponse.type === 'medicalRecord' && typeof parsedResponse.data?.medicalRecord === 'string') {
        const placeholder = '[PATIENT_FULL_NAME]';
        const finalRecord = parsedResponse.data.medicalRecord.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), fullName);
        if (parsedResponse.data) { // Ensure data exists before assigning
            parsedResponse.data.medicalRecord = finalRecord;
        }
        console.log(`Replaced "${placeholder}" with "${fullName}" in medical record.`);
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
