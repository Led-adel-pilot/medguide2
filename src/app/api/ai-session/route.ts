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
    action: 'start' | 'next' | 'generatePatientExplanation' | 'generateRecord'; // Added action
}

interface StartRequest extends BaseRequest {
    action: 'start';
    initialData: {
        fullName: string; // Added fullName
        age: string;
        gender: string;
        complaint: string;
    };
}

interface NextRequest extends BaseRequest {
    action: 'next';
    history: ChatCompletionMessageParam[];
}

// New interface for Patient Explanation request
interface GeneratePatientExplanationRequest extends BaseRequest {
    action: 'generatePatientExplanation';
    history: ChatCompletionMessageParam[];
}

interface GenerateRecordRequest extends BaseRequest {
    action: 'generateRecord';
    history: ChatCompletionMessageParam[];
    initialData: { // Add initialData here
        fullName: string; // Added fullName
        age: string;
        gender: string;
        complaint: string;
    };
}

// Type guard functions for validation
function isStartRequest(body: any): body is StartRequest {
    return body.action === 'start' &&
           typeof body.initialData === 'object' &&
           body.initialData !== null && // Check for null
           typeof body.initialData.fullName === 'string' && // Added fullName check
           typeof body.initialData.age === 'string' &&
           typeof body.initialData.gender === 'string' &&
           typeof body.initialData.complaint === 'string';
}

function isNextRequest(body: any): body is NextRequest {
    return body.action === 'next' &&
           Array.isArray(body.history) &&
           body.history.length > 0;
}

// New type guard
function isGeneratePatientExplanationRequest(body: any): body is GeneratePatientExplanationRequest {
    return body.action === 'generatePatientExplanation' &&
           Array.isArray(body.history) &&
           body.history.length > 0;
}

function isGenerateRecordRequest(body: any): body is GenerateRecordRequest {
    return body.action === 'generateRecord' &&
           Array.isArray(body.history) &&
           body.history.length > 0 &&
           typeof body.initialData === 'object' && // Add validation for initialData
           body.initialData !== null &&
           typeof body.initialData.fullName === 'string' && // Added fullName check
           typeof body.initialData.age === 'string' &&
           typeof body.initialData.gender === 'string' &&
           typeof body.initialData.complaint === 'string';
}


export async function POST(request: Request) {
  try {
    const body: BaseRequest | any = await request.json();

    let messages: ChatCompletionMessageParam[];
    let expectedResponseType: 'questions' | 'readyForRecord' | 'patientExplanation' | 'medicalRecord' | 'any' = 'any'; // Track expected response type for better error handling

    // Determine action and build messages accordingly
    let fullName = ''; // Variable to store fullName for replacement
    switch (body.action) {
      case 'start':
        if (!isStartRequest(body)) {
            // Updated error message
            return NextResponse.json({ error: 'Invalid request body for action="start". Required: { action: "start", initialData: { fullName, age, gender, complaint } }.' }, { status: 400 });
        }
        messages = buildInitialPrompt(body.initialData); // Pass full initialData
        expectedResponseType = 'questions'; // Start should always return questions first
        break;

      case 'next':
        if (!isNextRequest(body)) {
            return NextResponse.json({ error: 'Invalid request body for action="next". Required: { action: "next", history: [...] } (history must not be empty).' }, { status: 400 });
        }
        messages = buildNextPrompt(body.history);
        expectedResponseType = 'any'; // Can be questions or readyForRecord
        break;

      // New case for patient explanation
      case 'generatePatientExplanation':
         if (!isGeneratePatientExplanationRequest(body)) {
             return NextResponse.json({ error: 'Invalid request body for action="generatePatientExplanation". Required: { action: "generatePatientExplanation", history: [...] } (history must not be empty).' }, { status: 400 });
         }
        messages = buildGeneratePatientExplanationPrompt(body.history);
        expectedResponseType = 'patientExplanation'; // Expecting the explanation structure
        break;

       case 'generateRecord':
          if (!isGenerateRecordRequest(body)) {
              // Update error message to reflect the new requirement
              return NextResponse.json({ error: 'Invalid request body for action="generateRecord". Required: { action: "generateRecord", history: [...], initialData: { fullName, age, gender, complaint } } (history must not be empty).' }, { status: 400 });
          }
         // Store fullName for later replacement
         fullName = body.initialData.fullName;
         // Pass initialData to the prompt builder
         messages = buildGenerateRecordPrompt(body.history, body.initialData);

         // Log the full prompt for debugging
         console.log("--- Full Prompt for Generate Record ---");
         console.log(JSON.stringify(messages, null, 2));
         console.log("---------------------------------------");

         expectedResponseType = 'medicalRecord'; // Expecting the final record structure
         break;

      default:
        return NextResponse.json({ error: `Invalid or missing action field. Received: ${body.action || 'undefined'}` }, { status: 400 });
    }

    // Call the AI service with the prepared messages
    const aiResponse = await getAIResponse(messages);

    // Check if getAIResponse returned a JSON parsing error (from openaiService)
    if (aiResponse && typeof aiResponse === 'object' && aiResponse.type === 'error' && aiResponse.message === 'Failed to parse AI response as JSON.') {
        console.error("AI response JSON parsing failed in openaiService:", aiResponse.details, "\nRaw AI Response Content:", aiResponse.rawContent);
        return NextResponse.json({
            type: 'error',
            error: 'Failed to parse AI response from service.',
            details: aiResponse.details,
            rawContent: aiResponse.rawContent
        }, { status: 500 });
    }

    // If no JSON parsing error from service, proceed to parse the AI's response structure using promptBuilder's parser
    const parsedResponse = parseAIResponse(aiResponse);

    // Handle parsing errors from parseAIResponse (structure validation)
    if (parsedResponse.type === 'error') {
      console.error(`Error parsing AI response structure for action "${body.action}":`, parsedResponse.message, "\nRaw AI Response:", JSON.stringify(aiResponse, null, 2));
      return NextResponse.json({ type: 'error', error: 'Failed to process the AI response structure. Please try again.', details: parsedResponse.message }, { status: 500 });
    }

    // Optional: Add check if the received type matches the expected type for the action
    if (expectedResponseType !== 'any' && parsedResponse.type !== expectedResponseType) {
        console.warn(`Unexpected response type for action "${body.action}". Expected "${expectedResponseType}", but received "${parsedResponse.type}". Raw Response: ${JSON.stringify(aiResponse, null, 2)}`);
        // Decide whether to return an error or proceed cautiously
        // For now, let's return an error to be strict
        return NextResponse.json({
            type: 'error',
            error: `AI returned an unexpected response type. Expected ${expectedResponseType} but got ${parsedResponse.type}.`,
            details: `Received data structure: ${JSON.stringify(parsedResponse.data, null, 2)}`
        }, { status: 500 });
    }

    // --- Placeholder Replacement ---
    // If the action was 'generateRecord' and it was successful, replace the placeholder
    if (body.action === 'generateRecord' && parsedResponse.type === 'medicalRecord' && typeof parsedResponse.data?.medicalRecord === 'string') {
        const placeholder = '[PATIENT_FULL_NAME]';
        // Use a regex with the 'g' flag to replace all occurrences
        const finalRecord = parsedResponse.data.medicalRecord.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), fullName); // Escape placeholder for regex

        // Update the data object with the replaced content
        parsedResponse.data.medicalRecord = finalRecord;
        console.log(`Replaced "${placeholder}" with "${fullName}" in medical record.`);
    }


    // Return the successfully parsed (and potentially modified) data
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
