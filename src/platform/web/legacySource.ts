// Reads this browser's 0.0.2 data (the `kanban-light` database and `kanban*` localStorage keys) in the
// shape of the recovery download. Read-only: opens the database without a version, and aborts if it
// does not exist, so no empty `kanban-light` is ever created.

import { openDB, type IDBPDatabase } from 'idb';
import type { LegacySource } from '../../commands/bootstrap';
import type { LegacyData } from '../../domain/legacy';
import { storageError } from '../../storage/types';

async function openExisting(): Promise<IDBPDatabase | null> {
  try {
    return await openDB('kanban-light', undefined, {
      upgrade(_db, oldVersion, _newVersion, transaction) {
        if (oldVersion === 0) {
          transaction.done.catch(() => {});
          transaction.abort();
        }
      },
    });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') return null;
    throw storageError('unavailable', 'the 0.0.2 database cannot be opened');
  }
}

export function legacyWebSource(storage: Storage = localStorage): LegacySource {
  return {
    async read(): Promise<LegacyData | null> {
      const saved: Record<string, string> = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith('kanban')) saved[key] = storage.getItem(key) ?? '';
      }
      const db = await openExisting();
      if (!db) return saved['kanban-branches'] === undefined ? null : { indexedDB: {}, localStorage: saved };
      const stores: Record<string, unknown[]> = {};
      try {
        for (const name of db.objectStoreNames) stores[name] = await db.getAll(name);
      } finally {
        db.close();
      }
      return { indexedDB: stores, localStorage: saved };
    },
  };
}
