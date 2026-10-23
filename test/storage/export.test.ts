import { describe, expect, it } from 'vitest';
import { checked } from '../../src/storage/checked';
import { readExport, writeExport, type ExportFile } from '../../src/storage/exportFormat';
import type { JsonValue } from '../../src/domain/types';
import type { Change, StorageAdapter } from '../../src/storage/types';
import { backends, harness } from '../commands/backends';

// The cases below spoil a parsed file in place. Each step of a path is checked, so a path that
// does not fit the file fails the test instead of spoiling nothing.
type JsonObject = { [key: string]: JsonValue };

function at(json: JsonValue, path: (string | number)[]): JsonValue {
  return path.reduce<JsonValue>((value, key) => {
    const next = Array.isArray(value) ? value[key as number] : value !== null && typeof value === 'object' ? value[key] : undefined;
    if (next === undefined) throw new Error(`the file has no ${path.join('.')}`);
    return next;
  }, json);
}

function object(json: JsonValue, ...path: (string | number)[]): JsonObject {
  const value = at(json, path);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path.join('.')} is not an object`);
  return value;
}

function list(json: JsonValue, ...path: (string | number)[]): JsonValue[] {
  const value = at(json, path);
  if (!Array.isArray(value)) throw new Error(`${path.join('.')} is not a list`);
  return value;
}

const parse = (text: string): JsonObject => object(JSON.parse(text) as JsonValue);

const options = { exportedAt: 1000, app: { version: '0.0.2', platform: 'web' } };

// A board with two branches, edits on both, and a commit from the switch between them.
async function sampleStorage(makeBackend: () => () => StorageAdapter) {
  const h = harness(makeBackend);
  const service = await h.open();
  const card = (await service.run({ method: 'card.create', params: { title: 'Shared', tags: ['a'], assignee: 'Ann' } })) as { id: string };
  await service.run({ method: 'branch.create', params: { name: 'idea' } });
  await service.run({ method: 'card.update', params: { cardId: card.id, title: 'Changed on idea' } });
  await service.run({ method: 'branch.switch', params: { branch: 'main' } });
  await service.run({ method: 'card.create', params: { title: 'Only on main', columnId: 'done' } });
  await service.close();
  const storage = checked(h.storage());
  await storage.open();
  return storage;
}

// Applies read records the way a later import would, straight through the adapter.
function toBatch(file: ExportFile): Change[] {
  return file.boards.flatMap(({ board, branches, head, workingCopies, commits = [] }): Change[] => [
    { kind: 'putBoard', board },
    ...branches.map((branch): Change => ({ kind: 'putBranch', branch })),
    ...commits.map((commit): Change => ({ kind: 'putCommit', commit })),
    ...workingCopies.flatMap(({ branchId, baseCommitId, dirty, cards }): Change[] => [
      ...cards.map((card): Change => ({ kind: 'putCard', card: { ...card, boardId: board.id, branchId } })),
      { kind: 'setWorkingCopy', copy: { boardId: board.id, branchId, baseCommitId, dirty } },
    ]),
    { kind: 'setHead', head },
  ]);
}

const read = (text: string) => {
  const result = readExport(text);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
};

describe.each(backends)('export format v1 on %s storage', (_name, makeBackend) => {
  it.each([false, true])('export, read, apply to an empty store, export again: identical (history %s)', async (history) => {
    const source = await sampleStorage(makeBackend);
    const text = await writeExport(source, { ...options, history });
    const { file, warnings } = read(text);
    expect(warnings).toEqual([]);
    expect(file.boards[0].branches.map((branch) => branch.name)).toEqual(['main', 'idea']);
    expect(file.boards[0].commits === undefined).toBe(!history);

    const target = checked(makeBackend()());
    await target.open();
    await target.apply(toBatch(file));
    expect(await writeExport(target, { ...options, history })).toBe(text);
  });
});

describe('reading an export', () => {
  const valid = async () => parse(await writeExport(await sampleStorage(backends[0][1]), { ...options, history: true }));

  it('drops unknown collections with a warning, at file and board level', async () => {
    const file = await valid();
    file.cardLinks = [];
    object(file, 'boards', 0).reviews = [{}];
    const { file: kept, warnings } = read(JSON.stringify(file));
    expect(warnings).toEqual(['file: unknown collection cardLinks was skipped', 'board 0: unknown collection reviews was skipped']);
    expect(kept).not.toHaveProperty('cardLinks');
    expect(kept.boards[0]).not.toHaveProperty('reviews');
  });

  it('rejects anything else, naming the problem but not the content', async () => {
    const card = ['boards', 0, 'workingCopies', 0, 'cards', 0];
    const cases: [string, (file: JsonObject) => unknown][] = [
      ['the file is not a KanbanLight export', (file) => (file.format = 'trello')],
      ['the export version is not supported', (file) => (file.version = 2)],
      ['exportedAt must be a time', (file) => (file.exportedAt = 'now')],
      ['app must name a version and platform', (file) => (file.app = { version: '1' })],
      ['card: unknown field secret', (file) => (object(file, ...card).secret = 'Private title')],
      ['card: priority is not a known value', (file) => (object(file, ...card).priority = 'urgent')],
      ['working copy: unknown field', (file) => (object(file, 'boards', 0, 'workingCopies', 0).ops = [])],
      ['the head names no branch', (file) => (object(file, 'boards', 0, 'head').branchId = 'nowhere')],
      ['every branch needs exactly one working copy', (file) => list(file, 'boards', 0, 'workingCopies').pop()],
      ['branch ids repeat', (file) => list(file, 'boards', 0, 'branches').push(at(file, ['boards', 0, 'branches', 0]))],
      ['card ids repeat', (file) => list(file, ...card.slice(0, -1)).push(at(file, card))],
      ['a record names another board', (file) => (object(file, 'boards', 0, 'branches', 1).boardId = 'other')],
      ['boards must be a list', (file) => (file.boards = {})],
    ];
    for (const [reason, spoil] of cases) {
      const file = await valid();
      spoil(file);
      expect(readExport(JSON.stringify(file))).toEqual({ ok: false, reason });
    }
    expect(readExport('{')).toEqual({ ok: false, reason: 'the file is not JSON' });
    expect(readExport('[]')).toEqual({ ok: false, reason: 'the file is not an export' });
    expect(readExport(' '.repeat(100_000_001))).toEqual({ ok: false, reason: 'the file is too large' });
  });
});
