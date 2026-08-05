import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CollaborationService } from '../services/CollaborationService';
import { databaseService } from '../services/DatabaseService';
import { User, Conflict } from '../types';

interface CollaborationContextType {
  users: User[];
  conflicts: Conflict[];
  connectionStatus: string;
  collaborationService: CollaborationService | null;
  resolveConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => void;
  updateCursor: (x: number, y: number) => void;
  setSelection: (elementId: string | null) => void;
}

const CollaborationContext = createContext<CollaborationContextType | undefined>(undefined);

export const CollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [collaborationService, setCollaborationService] = useState<CollaborationService | null>(null);
  
  // Use ref to avoid stale closure in handleMouseMove
  const serviceRef = useRef<CollaborationService | null>(null);

  useEffect(() => {
    let service: CollaborationService | null = null;

    const initializeCollaboration = async () => {
      await databaseService.initialize();
      
      const currentUser: User = {
        id: 'user-' + Math.random().toString(36).substr(2, 9),
        name: 'You',
        cursor: { x: 0, y: 0 },
        color: '#3B82F6'
      };
      
      service = new CollaborationService('default-board', currentUser);
      serviceRef.current = service;
      
      service.on('users-changed', setUsers);
      service.on('connection-status', setConnectionStatus);
      service.on('conflict-detected', (conflict: Conflict) => {
        setConflicts(prev => [...prev, conflict]);
      });
      
      setCollaborationService(service);
      setConnectionStatus(service.getConnectionStatus());
    };

    initializeCollaboration();

    const handleMouseMove = (e: MouseEvent) => {
      if (serviceRef.current) {
        serviceRef.current.updateCursor(e.clientX, e.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (serviceRef.current) {
        serviceRef.current.destroy();
      }
    };
  }, []);

  const updateCursor = (x: number, y: number) => {
    if (serviceRef.current) {
      serviceRef.current.updateCursor(x, y);
    }
  };

  const setSelection = (elementId: string | null) => {
    if (serviceRef.current) {
      serviceRef.current.setSelection(elementId);
    }
  };

  const resolveConflict = (conflictId: string, resolution: 'local' | 'remote' | 'merge') => {
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    if (serviceRef.current) {
      serviceRef.current.resolveConflict(conflictId, resolution);
    }
  };

  return (
    <CollaborationContext.Provider value={{ 
      users, 
      conflicts, 
      connectionStatus,
      collaborationService,
      resolveConflict,
      updateCursor,
      setSelection
    }}>
      {children}
    </CollaborationContext.Provider>
  );
};

export const useCollaboration = () => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within CollaborationProvider');
  }
  return context;
};