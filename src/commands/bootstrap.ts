// The first board of an empty store: a 0.0.2 board converted once if this browser has one, otherwise
// a new board. Runs only in the writer, so two tabs opening together cannot both migrate.

import { createBoard, type Env } from '../domain/history';
import { convertLegacy, migrationMarker, type LegacyData } from '../domain/legacy';
import { checkChange } from '../storage/checked';
import { isStorageError, type StorageAdapter } from '../storage/types';

export const MIGRATION_KEY = 'migration';

export interface LegacySource {
  // null when there is no 0.0.2 data. Rejects when the data exists but cannot be read now; nothing
  // is written then, so the next open tries again. Never writes to the old data.
  read(): Promise<LegacyData | null>;
}

export async function createFirstBoard(storage: StorageAdapter, env: Env, legacy?: LegacySource): Promise<void> {
  const fresh = (failed?: string) =>
    storage.apply([
      ...createBoard(env).batch,
      ...(failed === undefined ? [] : [{ kind: 'setMeta' as const, key: MIGRATION_KEY, value: migrationMarker(env.clock.now(), { failed }) }]),
    ]);
  if (!legacy || (await storage.readMeta(MIGRATION_KEY)) !== null) return fresh();
  const data = await legacy.read();
  if (data === null) return fresh();
  const converted = convertLegacy(env, data);
  if (!converted.ok) return fresh(converted.reason);
  // A record the conversion should have repaired: keep the old data and start fresh. A failure to
  // store is not this case; it fails the open, and the next open tries again.
  try {
    converted.value.batch.forEach(checkChange);
  } catch (error) {
    if (isStorageError(error)) return fresh(error.reason ?? 'a converted record was refused');
    throw error;
  }
  const marker = migrationMarker(env.clock.now(), { notes: converted.value.notes });
  await storage.apply([...converted.value.batch, { kind: 'setMeta', key: MIGRATION_KEY, value: marker }]);
}
