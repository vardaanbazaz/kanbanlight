import React from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette } from './components/CommandPalette';
import { CollaborationProvider } from './providers/CollaborationProvider';
import { EventSourcingProvider } from './providers/EventSourcingProvider';
import { AIProvider } from './providers/AIProvider';
import { ThemeProvider } from './providers/ThemeProvider';

function App() {
  return (
    <ThemeProvider>
      <EventSourcingProvider>
        <CollaborationProvider>
          <AIProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors duration-200">
              <KanbanBoard />
              <CommandPalette />
            </div>
          </AIProvider>
        </CollaborationProvider>
      </EventSourcingProvider>
    </ThemeProvider>
  );
}

export default App;