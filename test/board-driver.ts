import { openDB } from 'idb';
import { vi } from 'vitest';

export type CardView = [id: string, title: string, columnId: string];

// What a user can do to the board and observe, independent of how the app stores it.
export interface BoardDriver {
  create(title: string, columnId: string): Promise<void>;
  update(pick: number, patch: { title?: string; columnId?: string }): Promise<void>;
  remove(pick: number): Promise<void>;
  branch(name: string): Promise<string>;
  switchTo(pick: number): Promise<void>;
  reload(): Promise<BoardDriver>;
  view(): string;
  activeBranch(): string;
  branches(): string[];
  invariants(): Promise<string[]>;
}

type StoredBranches = { branches: [string, unknown][]; currentBranch: string };

const storedBranches = (): StoredBranches =>
  JSON.parse(localStorage.getItem('kanban-branches') ?? '{"branches":[],"currentBranch":""}');

const sortedIds = (items: { id: string }[]) => JSON.stringify(items.map((item) => item.id).sort());

// Adapter for the current app: a "tab" is a fresh module graph over the same storage.
export async function openBoard(): Promise<BoardDriver> {
  vi.resetModules();
  const { useKanbanStore } = await import('../src/store/useKanbanStore');
  const { branchingService } = await import('../src/services/BranchingService');
  await useKanbanStore.getState().initializeStore();
  const state = () => useKanbanStore.getState();
  const pickCard = (pick: number) => {
    const cards = state().cards;
    return cards.length ? cards[pick % cards.length] : undefined;
  };

  const driver: BoardDriver = {
    async create(title, columnId) {
      await state().createCard(title, columnId);
    },
    async update(pick, patch) {
      const card = pickCard(pick);
      if (card) await state().updateCard(card.id, patch);
    },
    async remove(pick) {
      const card = pickCard(pick);
      if (card) await state().deleteCard(card.id);
    },
    async branch(name) {
      const parent = branchingService.getCurrentBranch()?.id ?? 'main';
      return (await branchingService.createBranch(name, parent, '')).id;
    },
    async switchTo(pick) {
      const all = driver.branches();
      const target = all[pick % all.length];
      if (target !== state().activeBranchId) {
        if (!(await branchingService.switchBranch(target))) throw new Error(`switch to ${target} failed`);
      }
    },
    reload: openBoard,
    view() {
      return JSON.stringify(
        state()
          .cards.map((card): CardView => [card.id, card.title, card.columnId])
          .sort((a, b) => a[0].localeCompare(b[0]))
      );
    },
    activeBranch: () => state().activeBranchId,
    branches: () => storedBranches().branches.map(([id]) => id),
    async invariants() {
      const stored = storedBranches();
      const known = new Set(stored.branches.map(([id]) => id));
      const db = await openDB('kanban-light');
      const [cards, events, snapshots] = await Promise.all([
        db.getAll('cards'),
        db.getAll('events'),
        db.getAll('snapshots'),
      ]);
      db.close();
      const snapshotBranches = new Set(snapshots.map((snapshot: { branchId: string }) => snapshot.branchId));
      const checks: Record<string, boolean> = {
        'active branch is a real branch': known.has(state().activeBranchId),
        'store, saved list and branch service agree on the active branch':
          state().activeBranchId === stored.currentBranch &&
          stored.currentBranch === (branchingService.getCurrentBranch()?.id ?? null),
        'stored cards match the board': sortedIds(cards) === sortedIds(state().cards),
        'stored events match the board': events.length === state().events.length,
        'every branch has a snapshot': [...known].every((id) => snapshotBranches.has(id)),
        'every snapshot belongs to a real branch': [...snapshotBranches].every((id) => known.has(id)),
      };
      return Object.entries(checks)
        .filter(([, holds]) => !holds)
        .map(([name]) => name);
    },
  };
  return driver;
}

export const tick = (ms = 3) => new Promise((resolve) => setTimeout(resolve, ms));
