import { useKanbanStore } from '../store/useKanbanStore';

export const useCollaboration = () => {
  const users = useKanbanStore((state) => state.users);
  const conflicts = useKanbanStore((state) => state.conflicts);
  const connectionStatus = useKanbanStore((state) => state.connectionStatus);
  const collaborationService = useKanbanStore((state) => state.collaborationService);
  const resolveConflict = useKanbanStore((state) => state.resolveConflict);
  const updateCursor = useKanbanStore((state) => state.updateCursor);

  return {
    users,
    conflicts,
    connectionStatus,
    collaborationService,
    resolveConflict,
    updateCursor,
    setSelection: (elementId: string | null) => {
      if (collaborationService) {
        collaborationService.setSelection(elementId);
      }
    }
  };
};