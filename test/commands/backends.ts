// Board services over one shared backing store, as tabs of one browser would be.

import { createBoardService, type Platform } from '../../src/commands/service';
import { memoryFeedHub, memoryLockHub } from '../../src/commands/ports';
import { counterClock, counterIds } from '../../src/domain/ids';
import { indexedDbStorage } from '../../src/platform/web/indexeddb';
import { createMemoryBacking, memoryStorage } from '../../src/storage/memory';
import type { StorageAdapter } from '../../src/storage/types';

export const backends: [string, () => () => StorageAdapter][] = [
  ['memory', () => {
    const backing = createMemoryBacking();
    return () => memoryStorage(backing);
  }],
  // Each test gets a fresh IndexedDB from test/setup.ts.
  ['indexeddb', () => () => indexedDbStorage()],
];

export function harness(makeBackend: () => () => StorageAdapter) {
  const storage = makeBackend();
  const counter = { value: 0 };
  const time = { value: 0 };
  const locks = memoryLockHub();
  const feeds = memoryFeedHub();
  return {
    locks,
    open: (overrides: Partial<Platform> = {}) =>
      createBoardService({
        storage: storage(),
        lock: locks(),
        feed: feeds(),
        clock: counterClock(time),
        ids: counterIds(counter),
        ...overrides,
      }),
    storage,
  };
}

export async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the command to reject');
}

export const titles = (cards: { title: string }[] | undefined) => (cards ?? []).map((card) => card.title).sort();
