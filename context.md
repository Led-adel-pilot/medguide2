# MedGuide AI Assistant - Project Context

## Description

This web application is an AI-powered assistant designed to conduct a preliminary medical anamnesis (patient history collection). It interacts with a user (simulating a patient) by asking a series of questions based on their initial complaint and demographic information. The goal is to gather sufficient information to generate a structured patient explanation and a medical record summary, which could potentially be reviewed by a healthcare professional.

**Disclaimer:** The application includes a disclaimer stating it provides informational suggestions based on AI and does not constitute medical advice.

## Current User Flow

1.  **Welcome & Initial Input:** The user is presented with a welcome screen and a form to enter their full name, age, gender, and initial complaint.
2.  **Start Session:** Upon submitting the initial data, a new session is started by calling the backend API. The patient's full name is stored locally and sent to the backend, but it is NOT included in the prompt sent to the AI for privacy reasons.
3.  **Question & Answer Phase:** The application displays questions received from the AI. The user provides answers.
4.  **Submit Answers:** User submits their answers, which are sent back to the API along with the conversation history. The AI processes the answers and either provides the next set of questions or signals readiness to conclude.
5.  **Ready for Paraclinical Upload:** When the AI determines it has enough information from the conversation, it signals readiness. The UI transitions to a page prompting the user to upload paraclinical exam images. At this stage, the user also has the option to **skip the paraclinical upload** and proceed directly to generating the explanation & record.
6.  **Paraclinical Exam Upload (Optional):** The user can upload relevant images (screenshots, scanned documents) of biological tests, radiology results, etc.
7.  **Generate Patient Explanation & Record:**
    *   If images were uploaded, upon submitting the images, the application calls the backend API to generate both the structured patient explanation and the final medical record, using the conversation history *and* the uploaded images as context for the AI.
    *   If the user chose to skip the upload, the application calls the backend API to generate the explanation and record using only the conversation history.
    *   The backend instructs the AI to use the placeholder `[PATIENT_FULL_NAME]` in the medical record.
8.  **View Results:** Once the explanation and record are generated, the session is marked complete. The application displays the structured patient explanation and a preview of the medical record, rendered as HTML. The backend replaces the `[PATIENT_FULL_NAME]` placeholder with the actual full name before displaying the record. A button is also available to download the raw medical record in Markdown format as a `.txt` file.
9.  **Reset Session:** The user can click a button to reset the session and start over.

## Tech Stack

*   **Frontend:** Next.js (App Router), React, Zustand (for state management), Tailwind CSS (with Shadcn UI components)
*   **Backend:** Next.js API Routes
*   **AI Service:** OpenAI API (configured to use a Gemini model via a custom `baseURL`)
*   **Language:** TypeScript

## Folder Structure

```
.
├── public/             # Static assets (images, etc.)
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── api/        # API Routes
│   │   │   └── ai-session/
│   │   │       └── route.ts  # Handles AI session interactions (start, next, generate explanation/record)
│   │   ├── favicon.ico
│   │   ├── globals.css     # Global styles
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Main application page (frontend UI)
│   ├── components/     # Reusable UI components (Shadcn UI)
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── textarea.tsx
│   ├── lib/            # Utility functions and services
│   │   ├── services/
│   │   │   └── openaiService.ts # Handles communication with the OpenAI/Gemini API
│   │   ├── utils/
│   │   │   ├── promptBuilder.ts # Builds prompts for the AI and parses AI responses
│   │   │   └── utils.ts         # General utilities (currently empty)
│   │   └── store/
│   │       └── sessionStore.ts  # Zustand store for managing session state
│   └── ...             # Other configuration files (.gitignore, package.json, tsconfig.json, etc.)
```

**Key Files Explained:**

*   `src/app/page.tsx`: The main frontend component rendering the user interface, handling local state, and interacting with the Zustand store.
*   `src/app/api/ai-session/route.ts`: The backend API route that receives requests from the frontend, builds appropriate prompts using `promptBuilder`, calls the AI service, and returns the parsed AI response.
*   `src/lib/utils/promptBuilder.ts`: Contains functions to construct prompts for different stages of the AI interaction (initial questions, next questions, patient explanation, medical record) and a parser to interpret the AI's JSON responses. Defines expected JSON structures.
*   `src/lib/services/openaiService.ts`: A service layer responsible for making the actual API call to the configured AI endpoint (OpenAI compatible, using Gemini). It handles basic API interaction and JSON parsing of the raw AI response.
*   `src/store/sessionStore.ts`: A Zustand store managing the entire application state, including conversation history, current questions, loading states, errors, and the final results (patient explanation and medical record). It orchestrates the API calls via `fetch`.

## To Do

*   [x] Implement the display and download functionality for the medical record.
*   Refine error handling and user feedback in the UI.
*   Potentially add more robust validation for user inputs.
*   Improve the UI/UX, especially for the Q&A flow and displaying results.
*   Consider streaming AI responses for a more interactive experience.
*   Add more detailed logging or monitoring.
*   Explore options for handling longer conversation histories if needed.
*   Implement proper authentication/authorization if this were a production application.
*   Review and potentially refine AI prompts for better accuracy and reliability.
