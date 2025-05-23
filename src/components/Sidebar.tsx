'use client'; // Important for hooks and event handlers

import React, { useEffect, useState } from 'react';

// Using the placeholder Consultation and related types as specified
export type AppStep = string; // Simplified for placeholder
export interface Question { id: string; text: string; suggestions?: string[]; }
// Using a simplified PatientExplanationData for this placeholder
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
// End of placeholder types

import { getConsultations, deleteConsultation } from '@/lib/utils/localStorageManager';
import { useSessionStore } from '@/store/sessionStore';
import { Button } from '@/components/ui/button';
// Potentially: import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
// Potentially: import { ScrollArea } from '@/components/ui/scroll-area';


export function Sidebar() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const { loadConsultation, currentConsultationId, resetSession } = useSessionStore(); // Removed startSession as it's not used directly here

  const fetchConsultations = () => {
    const storedConsultations = getConsultations();
    // Sort by lastUpdated descending (most recent first)
    storedConsultations.sort((a, b) => b.lastUpdated - a.lastUpdated);
    setConsultations(storedConsultations);
  };

  useEffect(() => {
    fetchConsultations();
    // Basic polling as a simple way to refresh if other tabs modify local storage.
    const intervalId = setInterval(fetchConsultations, 5000); // Refresh every 5 seconds
    return () => clearInterval(intervalId);
  }, []);

  // Effect to refresh consultations if the currentConsultationId changes (e.g., session status changes)
  useEffect(() => {
    fetchConsultations();
  }, [currentConsultationId]);


  const handleLoad = (id: string) => {
    loadConsultation(id);
  };

  const handleDelete = (id: string) => {
    // If deleting the currently loaded session, also reset the main view
    if (id === currentConsultationId) {
        resetSession(); // This will also update the status in local storage
    }
    deleteConsultation(id);
    fetchConsultations(); // Refresh list
  };

  const handleStartNew = () => {
    resetSession();
    // The main page (page.tsx) should react to currentAppStep === 'initial'
    // and display the form to collect initialData for a new session.
  };

  if (consultations.length === 0) {
    return (
      <aside className="w-80 p-4 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 h-full flex flex-col">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Consultation History</h2>
        <Button onClick={handleStartNew} className="w-full mb-4">Start New Consultation</Button>
        <div className="flex-grow flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No past consultations found.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 p-4 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col h-full">
      <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Consultation History</h2>
      <Button onClick={handleStartNew} className="w-full mb-6">Start New Consultation</Button>
      {/* Using div with overflow-y-auto for scrolling as ScrollArea might need specific setup */}
      <div className="space-y-3 flex-grow overflow-y-auto pr-1"> {/* Added pr-1 for scrollbar spacing */}
        {consultations.map((consult) => (
          <div 
            key={consult.id} 
            className={`p-3 border rounded-lg shadow-sm transition-colors
                        ${consult.id === currentConsultationId 
                            ? 'bg-blue-50 dark:bg-blue-900 border-blue-500 dark:border-blue-700' 
                            : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
          >
            <h3 
              className="text-sm font-semibold truncate text-gray-900 dark:text-white" 
              title={consult.title || `Consultation for ${consult.initialData?.fullName || 'N/A'}`}
            >
              {consult.title || `Consultation for ${consult.initialData?.fullName || 'N/A'}`}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Last updated: {new Date(consult.lastUpdated).toLocaleString()}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Status: <span 
                        className={`font-medium ${
                            consult.status === 'completed' ? 'text-green-600 dark:text-green-400' : 
                            consult.status === 'in-progress' ? 'text-yellow-600 dark:text-yellow-400' : 
                            'text-red-600 dark:text-red-400'}`}
                      >
                {consult.status.charAt(0).toUpperCase() + consult.status.slice(1)} {/* Capitalize status */}
              </span>
            </p>
            <div className="mt-3 space-x-2 flex">
              {(consult.status === 'in-progress' || consult.status === 'abandoned') && (
                <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleLoad(consult.id)} 
                    className="flex-1 text-xs py-1 px-2 h-auto"
                    disabled={consult.id === currentConsultationId && consult.status === 'in-progress'} // Disable continue if already loaded and in-progress
                >
                  {consult.id === currentConsultationId && consult.status === 'in-progress' ? 'Current' : 'Continue'}
                </Button>
              )}
              {consult.status === 'completed' && (
                <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleLoad(consult.id)} 
                    className="flex-1 text-xs py-1 px-2 h-auto"
                    disabled={consult.id === currentConsultationId} // Disable view if already loaded
                >
                  {consult.id === currentConsultationId ? 'Viewing' : 'View'}
                </Button>
              )}
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={() => handleDelete(consult.id)} 
                className="flex-1 text-xs py-1 px-2 h-auto"
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
