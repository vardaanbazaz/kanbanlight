// BoardDriver v1: the same user-level driver as board-driver.ts, over the new board service and any
// storage adapter. A "tab" is another service over the same storage, lock hub and change feed.

import type { BoardDriver, CardView } from './board-driver';
import { memoryFeedHub, memoryLockHub } from '../src/commands/ports';
import type { LegacySource } from '../src/commands/bootstrap';
import { createBoardService, type BoardService } from '../src/commands/service';
import { counterClock, counterIds } from '../src/domain/ids';
import { sameName } from '../src/domain/names';
import type { CardRecord } from '../src/domain/types';
import { checked } from '../src/storage/checked';
import { storageError, type StorageAdapter } from '../src/storage/types';

export interface ServiceBoardDriver extends BoardDriver {
  // Any command or query, through this tab's queue.
  run(command: unknown): Promise<unknown>;
  // Another tab over the same storage.
  openTab(): Promise<ServiceBoardDriver>;
  takeOver(): Promise<void>;
  readOnly(): boolean;
  settled(): Promise<void>;
  // The next write to storage, from any tab, fails before reaching it.
  failNextWrite(): void;
  close(): Promise<void>;
  reload(): Promise<ServiceBoardDriver>;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export const viewOf = (cards: { id: string; title: string; columnId: string }[]) =>
  JSON.stringify([...cards].sort(byId).map((card): CardView => [card.id, card.title, card.columnId]));

export async function openServiceBoard(backend: () => StorageAdapter, legacy?: LegacySource): Promise<ServiceBoardDriver> {
  const locks = memoryLockHub();
  const feeds = memoryFeedHub();
  const counter = { value: 0 };
  const time = { value: 0 };
  const fault = { armed: false };

  const storage = (): StorageAdapter => {
    const inner = backend();
    return {
      ...inner,
      apply(batch) {
        if (!fault.armed) return inner.apply(batch);
        fault.armed = false;
        return Promise.reject(storageError('write-failed'));
      },
    };
  };

  async function openTab(): Promise<ServiceBoardDriver> {
    const service: BoardService = await createBoardService({
      storage: storage(),
      lock: locks(),
      feed: feeds(),
      clock: counterClock(time),
      ids: counterIds(counter),
      legacy,
    });
    const state = () => service.state()!;
    const pickCard = (pick: number): CardRecord | undefined => {
      const cards = [...state().current.cards].sort(byId);
      return cards.length ? cards[pick % cards.length] : undefined;
    };

    const driver: ServiceBoardDriver = {
      async create(title, columnId) {
        await service.run({ method: 'card.create', params: { title, columnId } });
      },
      async update(pick, patch) {
        const card = pickCard(pick);
        if (card) await service.run({ method: 'card.update', params: { cardId: card.id, ...patch } });
      },
      async remove(pick) {
        const card = pickCard(pick);
        if (card) await service.run({ method: 'card.delete', params: { cardId: card.id } });
      },
      async branch(name) {
        return ((await service.run({ method: 'branch.create', params: { name } })) as { id: string }).id;
      },
      async switchTo(pick) {
        const all = driver.branches();
        const target = all[pick % all.length];
        if (target !== driver.activeBranch()) await service.run({ method: 'branch.switch', params: { branch: target } });
      },
      async reload() {
        await service.close();
        return openTab();
      },
      view: () => viewOf(state().current.cards),
      activeBranch: () => state().head.branchId,
      branches: () => state().branches.map((branch) => branch.id),
      async invariants() {
        const raw = checked(backend());
        await raw.open();
        try {
          const boardId = state().board.id;
          const snapshot = (await raw.readBoard(boardId))!;
          const copies = await Promise.all(snapshot.branches.map((branch) => raw.readWorkingCopy(boardId, branch.id)));
          const known = new Set(await raw.listCommitIds(boardId));
          const commits = await raw.readCommits(boardId, [...known]);
          const names = snapshot.branches.map((branch) => branch.name);
          const head = copies.find((copy) => copy?.copy.branchId === snapshot.head.branchId);
          const comparable = (copy: typeof head) => copy && JSON.stringify({ ...copy, cards: [...copy.cards].sort(byId) });
          const checks: Record<string, boolean> = {
            'the head names a branch of the board': snapshot.branches.some((branch) => branch.id === snapshot.head.branchId),
            'every branch has a working copy whose base commit exists': copies.every((copy) => copy && known.has(copy.copy.baseCommitId)),
            "every commit's parents exist": commits.every((commit) => commit.parents.every((parent) => known.has(parent))),
            "every card's board and branch match its working copy": copies.every(
              (copy) => !copy || copy.cards.every((card) => card.boardId === copy.copy.boardId && card.branchId === copy.copy.branchId)
            ),
            'branch names are unique per board, ignoring case': names.every((name, i) => names.findIndex((other) => sameName(other, name)) === i),
            'a clean working copy has an empty op log': copies.every((copy) => !copy || copy.copy.dirty || copy.ops.length === 0),
            'the stored board matches this tab':
              snapshot.head.branchId === state().head.branchId && comparable(head) === comparable(state().current),
          };
          return Object.entries(checks)
            .filter(([, holds]) => !holds)
            .map(([name]) => name);
        } finally {
          await raw.close();
        }
      },
      run: (command) => service.run(command),
      openTab,
      takeOver: () => service.takeOver(),
      readOnly: () => service.readOnly(),
      settled: () => service.settled(),
      failNextWrite: () => (fault.armed = true),
      close: () => service.close(),
    };
    return driver;
  }

  return openTab();
}
