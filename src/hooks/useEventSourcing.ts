import { useKanbanStore } from '../store/useKanbanStore';
import { databaseService } from '../services/DatabaseService';

export const useEventSourcing = () => {
  const events = useKanbanStore((state) => state.events);
  const dispatchBoardEvent = useKanbanStore((state) => state.dispatchBoardEvent);
  const board = useKanbanStore((state) => state.board);

  return {
    events,
    dispatch: dispatchBoardEvent,
    createSnapshot: async () => {
      if (board) {
        await databaseService.createSnapshot(board.id, board, `Snapshot at ${new Date().toLocaleString()}`);
      }
    },
    revertToSnapshot: async (snapshotId: string) => {
      if (!board) return;
      const snapshots = await databaseService.getSnapshotsByBoard(board.id);
      const snapshot = snapshots.find((s) => s.id === snapshotId);
      if (snapshot) {
        await databaseService.saveBoard(snapshot.data);
        await dispatchBoardEvent({
          type: 'BOARD_REVERTED',
          payload: { snapshotId, timestamp: snapshot.timestamp },
          userId: 'system',
          boardId: board.id,
        });
      }
    },
    loadEvents: async (boardId: string) => {
      await databaseService.getEventsByBoard(boardId);
    },
    exportEvents: async () => {
      return board ? await databaseService.getEventsByBoard(board.id) : [];
    },
    importEvents: async (importedEvents: any[]) => {
      for (const event of importedEvents) {
        await databaseService.saveEvent(event);
        await dispatchBoardEvent(event);
      }
    }
  };
};