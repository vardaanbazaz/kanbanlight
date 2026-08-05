import React, { createContext, useContext, useState, useReducer } from 'react';
import { databaseService } from '../services/DatabaseService';
import { Event } from '../types';


interface EventSourcingContextType {
  events: Event[];
  dispatch: (event: Omit<Event, 'id' | 'timestamp'>) => void;
  createSnapshot: () => void;
  revertToSnapshot: (snapshotId: string) => void;
  loadEvents: (boardId: string) => Promise<void>;
  exportEvents: () => Promise<Event[]>;
  importEvents: (events: Event[]) => Promise<void>;
}

const EventSourcingContext = createContext<EventSourcingContextType | undefined>(undefined);

const eventReducer = (state: Event[], action: Event): Event[] => {
  return [...state, action];
};

export const EventSourcingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, dispatch] = useReducer(eventReducer, []);
  const [snapshots, setSnapshots] = useState<{ id: string; events: Event[]; timestamp: number }[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string>('default-board');

  const dispatchEvent = async (event: Omit<Event, 'id' | 'timestamp'>) => {
    const fullEvent: Event = {
      ...event,
      id: Date.now().toString(),
      timestamp: Date.now(),
      boardId: currentBoardId
    };
    
    dispatch(fullEvent);
    
    // Persist to IndexedDB
    try {
      await databaseService.saveEvent(fullEvent);
    } catch (error) {
      console.error('Failed to save event:', error);
    }
  };

  const createSnapshot = async () => {
    // Get current board state
    const boards = await databaseService.getAllBoards();
    const currentBoard = boards.find(b => b.id === currentBoardId);
    
    if (!currentBoard) {
      console.error('No current board found for snapshot');
      return;
    }

    const snapshot = {
      id: Date.now().toString(),
      boardId: currentBoardId,
      data: currentBoard,
      timestamp: Date.now()
    };
    
    setSnapshots(prev => [...prev, snapshot]);
    
    try {
      await databaseService.createSnapshot(currentBoardId, currentBoard, `Snapshot at ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    }
    
    console.log('Snapshot created:', snapshot.id);
  };

  const revertToSnapshot = async (snapshotId: string) => {
    try {
      const snapshots = await databaseService.getSnapshotsByBoard(currentBoardId);
      const snapshot = snapshots.find(s => s.id === snapshotId);
      
      if (snapshot) {
        // Restore board state from snapshot
        await databaseService.saveBoard(snapshot.data);
        
        // Create revert event
        await dispatchEvent({
          type: 'BOARD_REVERTED',
          payload: { snapshotId, timestamp: snapshot.timestamp },
          userId: 'system'
        });
        
        console.log('Reverted to snapshot:', snapshotId);
      }
    } catch (error) {
      console.error('Failed to revert to snapshot:', error);
    }
  };

  const loadEvents = async (boardId: string) => {
    try {
      setCurrentBoardId(boardId);
      const boardEvents = await databaseService.getEventsByBoard(boardId);
      
      // Replace current events with loaded events
      boardEvents.forEach(event => dispatch(event));
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  const exportEvents = async (): Promise<Event[]> => {
    try {
      return await databaseService.getEventsByBoard(currentBoardId);
    } catch (error) {
      console.error('Failed to export events:', error);
      return [];
    }
  };

  const importEvents = async (importedEvents: Event[]): Promise<void> => {
    try {
      for (const event of importedEvents) {
        await databaseService.saveEvent(event);
        dispatch(event);
      }
    } catch (error) {
      console.error('Failed to import events:', error);
    }
  };

  return (
    <EventSourcingContext.Provider value={{
      events,
      dispatch: dispatchEvent,
      createSnapshot,
      revertToSnapshot,
      loadEvents,
      exportEvents,
      importEvents
    }}>
      {children}
    </EventSourcingContext.Provider>
  );
};

export const useEventSourcing = () => {
  const context = useContext(EventSourcingContext);
  if (!context) {
    throw new Error('useEventSourcing must be used within EventSourcingProvider');
  }
  return context;
};