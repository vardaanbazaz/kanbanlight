import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { indexedDbStorage } from '../../src/platform/web/indexeddb';
import { storageContract } from './contract';

// Each test runs on a fresh IndexedDB (test/setup.ts); two adapters over it are a reload.
storageContract('indexeddb', () => ({ connect: () => indexedDbStorage() }));

describe('IndexedDB adapter', () => {
  it('uses its own database and never creates or opens the old one', async () => {
    const adapter = indexedDbStorage();
    await adapter.open();
    expect((await indexedDB.databases()).map((database) => database.name)).toEqual(['kanbanlight']);
  });

  it('becomes unavailable, without an event, when another connection upgrades the database', async () => {
    const adapter = indexedDbStorage();
    await adapter.open();
    const newer = await openDB('kanbanlight', 2);
    newer.close();
    await expect(adapter.listBoards()).rejects.toMatchObject({ code: 'unavailable' });
    await expect(adapter.apply([])).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('refuses a database of the right name that lacks its tables', async () => {
    const stray = await openDB('kanbanlight', 1);
    stray.close();
    await expect(indexedDbStorage().open()).rejects.toMatchObject({ code: 'read-failed' });
  });

  it('dumps every table for the recovery download', async () => {
    const adapter = indexedDbStorage();
    await adapter.open();
    const dump = (await adapter.dumpRaw()) as Record<string, unknown[]>;
    expect(Object.keys(dump).sort()).toEqual(['boards', 'branches', 'cards', 'commits', 'heads', 'meta', 'ops', 'working']);
    expect(dump.meta).toEqual([{ key: 'schemaVersion', value: 1 }]);
  });
});
