import React from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette } from './components/CommandPalette';
import { CollaborationProvider } from './providers/CollaborationProvider';
import { EventSourcingProvider } from './providers/EventSourcingProvider';
import { AIProvider } from './providers/AIProvider';

function App() {
  return (
    <EventSourcingProvider>
      <CollaborationProvider>
        <AIProvider>
          <div className="min-h-screen bg-slate-50">
            <KanbanBoard />
            <CommandPalette />
          </div>
        </AIProvider>
      </CollaborationProvider>
    </EventSourcingProvider>
  );
}

export default App;