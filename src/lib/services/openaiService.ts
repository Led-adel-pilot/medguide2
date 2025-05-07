import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export async function getAIResponse(messages: ChatCompletionMessageParam[]) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gemini-2.5-flash-preview-04-17",
      messages: messages,
      response_format: { type: "json_object" }, // Requesting JSON output
    });

    // Assuming the AI response is in the first choice's message content
    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error("AI response content is empty.");
    }

    // Attempt to parse the JSON content
    try {
      return JSON.parse(content);
    } catch (jsonError) {
      console.error("Failed to parse AI response JSON:", jsonError);
      console.error("Raw AI response content:", content);
      // Return a structured error object instead of throwing
      return {
        type: 'error',
        message: 'Failed to parse AI response as JSON.',
        details: jsonError instanceof Error ? jsonError.message : String(jsonError),
        rawContent: content // Include raw content for debugging
      };
    }

  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw error;
  }
}
