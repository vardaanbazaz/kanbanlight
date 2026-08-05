import { useSyncExternalStore } from 'react';
import { Board, Card, Column, Conflict, Event, User } from '../types';
import { databaseService } from '../services/DatabaseService';
import { CollaborationService } from '../services/CollaborationService';
import { aiService } from '../services/AIService';

// Idiomatic lightweight Zustand implementation using React's useSyncExternalStore
export function createStore<T>(
  createState: (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T
  ) => T
) {
  let state: T;
  const listeners = new Set<() => void>();

  const setState = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const nextState = typeof partial === 'function' ? (partial as any)(state) : partial;
    if (!Object.is(nextState, state)) {
      state = Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener());
    }
  };

  const getState = () => state;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = createState(setState, getState);

  const useStore = <U = T>(selector?: (state: T) => U): U => {
    const slice = useSyncExternalStore(subscribe, getState, getState);
    return selector ? selector(slice) : (slice as unknown as U);
  };

  Object.assign(useStore, { getState, setState, subscribe });

  return useStore;
}

export interface KanbanState {
  // Board & Card State
  board: Board | null;
  columns: Column[];
  cards: Card[];
  events: Event[];
  
  // Collaboration & Presence State
  users: User[];
  currentUser: User | null;
  conflicts: Conflict[];
  connectionStatus: string;
  collaborationService: CollaborationService | null;
  
  // AI Insights State
  isAIProcessing: boolean;
  insights: string | null;
  workflowInsights: any[];
  velocityPrediction: any | null;
  taskSuggestions: string[];

  // UI Navigation State
  isCommandPaletteOpen: boolean;
  showPluginManager: boolean;
  showBranchManager: boolean;
  showSmartCardCreator: boolean;
  isInitialized: boolean;

  // Actions
  initializeStore: () => Promise<void>;
  createCard: (title: string, columnId?: string, extra?: Partial<Card>) => Promise<Card>;
  moveCard: (cardId: string, targetColumnId: string) => Promise<void>;
  updateCard: (cardId: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  dispatchBoardEvent: (event: Omit<Event, 'id' | 'timestamp'>) => Promise<void>;
  
  // Collaboration Actions
  resolveConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => void;
  updateCursor: (x: number, y: number) => void;
  
  // AI Actions
  generateAIInsights: () => Promise<void>;
  
  // UI Modal Actions
  setCommandPaletteOpen: (isOpen: boolean) => void;
  setShowPluginManager: (show: boolean) => void;
  setShowBranchManager: (show: boolean) => void;
  setShowSmartCardCreator: (show: boolean) => void;
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', color: 'slate', position: 0, cards: [] },
  { id: 'todo', title: 'To Do', color: 'blue', position: 1, cards: [] },
  { id: 'in-progress', title: 'In Progress', color: 'amber', position: 2, cards: [] },
  { id: 'review', title: 'Review', color: 'purple', position: 3, cards: [] },
  { id: 'done', title: 'Done', color: 'emerald', position: 4, cards: [] },
];

export const useKanbanStore = createStore<KanbanState>((set, get) => ({
  board: null,
  columns: DEFAULT_COLUMNS,
  cards: [],
  events: [],
  users: [],
  currentUser: null,
  conflicts: [],
  connectionStatus: 'disconnected',
  collaborationService: null,
  isAIProcessing: false,
  insights: null,
  workflowInsights: [],
  velocityPrediction: null,
  taskSuggestions: [],
  isCommandPaletteOpen: false,
  showPluginManager: false,
  showBranchManager: false,
  showSmartCardCreator: false,
  isInitialized: false,

  initializeStore: async () => {
    if (get().isInitialized) return;

    try {
      await databaseService.initialize();

      // Load boards
      let boards = await databaseService.getAllBoards();
      let activeBoard: Board;

      if (boards.length === 0) {
        activeBoard = {
          id: 'default-board',
          title: 'Main Board',
          columns: DEFAULT_COLUMNS,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await databaseService.saveBoard(activeBoard);
      } else {
        activeBoard = boards[0];
      }

      // Load cards & events
      const loadedCards = await databaseService.getCardsByBoard(activeBoard.id);
      const loadedEvents = await databaseService.getEventsByBoard(activeBoard.id);

      // Create current user
      const currentUser: User = {
        id: 'user-' + Math.random().toString(36).substr(2, 9),
        name: 'You',
        cursor: { x: 0, y: 0 },
        color: '#3B82F6',
      };

      // Initialize Collaboration Service
      const colService = new CollaborationService(activeBoard.id, currentUser);
      colService.on('users-changed', (users: User[]) => set({ users }));
      colService.on('connection-status', (status: string) => set({ connectionStatus: status }));
      colService.on('conflict-detected', (conflict: Conflict) =>
        set((state) => ({ conflicts: [...state.conflicts, conflict] }))
      );

      // Attach mousemove handler safely with active service reference
      const handleMouseMove = (e: MouseEvent) => {
        colService.updateCursor(e.clientX, e.clientY);
      };
      window.addEventListener('mousemove', handleMouseMove);

      // Initialize AI Service
      aiService.initialize().catch(console.error);

      set({
        board: activeBoard,
        cards: loadedCards,
        events: loadedEvents,
        currentUser,
        collaborationService: colService,
        connectionStatus: colService.getConnectionStatus(),
        isInitialized: true,
      });

      // Initial AI insights run using real loaded cards and events
      get().generateAIInsights();
    } catch (error) {
      console.error('Failed to initialize Kanban store:', error);
    }
  },

  createCard: async (title: string, columnId: string = 'backlog', extra: Partial<Card> = {}) => {
    const currentBoardId = get().board?.id || 'default-board';
    const newCard: Card = {
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      description: extra.description || '',
      priority: extra.priority || 'medium',
      assignee: extra.assignee || get().currentUser?.name || 'You',
      tags: extra.tags || [],
      columnId,
      position: get().cards.filter((c) => c.columnId === columnId).length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conflicts: [],
      ...extra,
    };

    // Save to IndexedDB
    await databaseService.saveCard(newCard);

    // Save creation event
    const event: Omit<Event, 'id' | 'timestamp'> = {
      type: 'CARD_CREATED',
      payload: newCard,
      userId: get().currentUser?.id || 'current-user',
      boardId: currentBoardId,
    };
    await get().dispatchBoardEvent(event);

    set((state) => ({
      cards: [...state.cards, newCard],
    }));

    return newCard;
  },

  moveCard: async (cardId: string, targetColumnId: string) => {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card) return;

    const fromColumn = card.columnId;
    const updatedCard: Card = {
      ...card,
      columnId: targetColumnId,
      updatedAt: Date.now(),
    };

    await databaseService.saveCard(updatedCard);

    await get().dispatchBoardEvent({
      type: 'CARD_MOVED',
      payload: { cardId, fromColumn, toColumn: targetColumnId },
      userId: get().currentUser?.id || 'current-user',
      boardId: get().board?.id || 'default-board',
    });

    set((state) => ({
      cards: state.cards.map((c) => (c.id === cardId ? updatedCard : c)),
    }));
  },

  updateCard: async (cardId: string, updates: Partial<Card>) => {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card) return;

    const updatedCard: Card = {
      ...card,
      ...updates,
      updatedAt: Date.now(),
    };

    await databaseService.saveCard(updatedCard);

    await get().dispatchBoardEvent({
      type: 'CARD_UPDATED',
      payload: { cardId, updates },
      userId: get().currentUser?.id || 'current-user',
      boardId: get().board?.id || 'default-board',
    });

    set((state) => ({
      cards: state.cards.map((c) => (c.id === cardId ? updatedCard : c)),
    }));
  },

  deleteCard: async (cardId: string) => {
    await databaseService.deleteCard(cardId);

    await get().dispatchBoardEvent({
      type: 'CARD_DELETED',
      payload: { cardId },
      userId: get().currentUser?.id || 'current-user',
      boardId: get().board?.id || 'default-board',
    });

    set((state) => ({
      cards: state.cards.filter((c) => c.id !== cardId),
    }));
  },

  dispatchBoardEvent: async (eventData) => {
    const fullEvent: Event = {
      ...eventData,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };

    await databaseService.saveEvent(fullEvent);

    set((state) => ({
      events: [...state.events, fullEvent],
    }));
  },

  resolveConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => {
    const colService = get().collaborationService;
    if (colService) {
      colService.resolveConflict(conflictId, resolution);
    }
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflictId),
    }));
  },

  updateCursor: (x: number, y: number) => {
    const colService = get().collaborationService;
    if (colService) {
      colService.updateCursor(x, y);
    }
  },

  generateAIInsights: async () => {
    set({ isAIProcessing: true });
    try {
      const currentCards = get().cards;
      const currentEvents = get().events;

      const [workflowAnalysis, prediction, suggestions] = await Promise.all([
        aiService.generateWorkflowInsights(currentCards, currentEvents),
        aiService.predictCompletion(currentCards, currentEvents),
        aiService.generateTaskSuggestions({
          recentCards: currentCards,
          completedCards: currentCards.filter((c) => c.columnId === 'done'),
        }),
      ]);

      set({
        workflowInsights: workflowAnalysis,
        velocityPrediction: prediction,
        taskSuggestions: suggestions,
        insights: workflowAnalysis.length > 0 ? workflowAnalysis[0].description : null,
      });
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
      set({ insights: 'AI analysis temporarily unavailable' });
    } finally {
      set({ isAIProcessing: false });
    }
  },

  setCommandPaletteOpen: (isOpen: boolean) => set({ isCommandPaletteOpen: isOpen }),
  setShowPluginManager: (show: boolean) => set({ showPluginManager: show }),
  setShowBranchManager: (show: boolean) => set({ showBranchManager: show }),
  setShowSmartCardCreator: (show: boolean) => set({ showSmartCardCreator: show }),
}));
