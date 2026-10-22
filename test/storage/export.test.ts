import { describe, expect, it } from 'vitest';
import { checked } from '../../src/storage/checked';
import { readExport, writeExport, type ExportFile } from '../../src/storage/exportFormat';
import type { Change, StorageAdapter } from '../../src/storage/types';
import { backends, harness } from '../commands/backends';

// Whatever JSON.parse returns: the cases below spoil the parsed file in place.
type ParsedJson = ReturnType<typeof JSON.parse>;

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
  const valid = async () => JSON.parse(await writeExport(await sampleStorage(backends[0][1]), { ...options, history: true }));

  it('drops unknown collections with a warning, at file and board level', async () => {
    const file = await valid();
    file.cardLinks = [];
    file.boards[0].reviews = [{}];
    const { file: kept, warnings } = read(JSON.stringify(file));
    expect(warnings).toEqual(['file: unknown collection cardLinks was skipped', 'board 0: unknown collection reviews was skipped']);
    expect(kept).not.toHaveProperty('cardLinks');
    expect(kept.boards[0]).not.toHaveProperty('reviews');
  });

  it('rejects anything else, naming the problem but not the content', async () => {
    const cases: [string, (file: ParsedJson) => unknown][] = [
      ['the file is not a KanbanLight export', (file) => (file.format = 'trello')],
      ['the export version is not supported', (file) => (file.version = 2)],
      ['exportedAt must be a time', (file) => (file.exportedAt = 'now')],
      ['app must name a version and platform', (file) => (file.app = { version: '1' })],
      ['card: unknown field secret', (file) => (file.boards[0].workingCopies[0].cards[0].secret = 'Private title')],
      ['card: priority is not a known value', (file) => (file.boards[0].workingCopies[0].cards[0].priority = 'urgent')],
      ['working copy: unknown field', (file) => (file.boards[0].workingCopies[0].ops = [])],
      ['the head names no branch', (file) => (file.boards[0].head.branchId = 'nowhere')],
      ['every branch needs exactly one working copy', (file) => file.boards[0].workingCopies.pop()],
      ['branch ids repeat', (file) => file.boards[0].branches.push(file.boards[0].branches[0])],
      ['card ids repeat', (file) => file.boards[0].workingCopies[0].cards.push(file.boards[0].workingCopies[0].cards[0])],
      ['a record names another board', (file) => (file.boards[0].branches[1].boardId = 'other')],
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
