// Runs against throwaway repos under /tmp/kanbanlight-test only.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Board, BoardDeps, STORE_KEY, UNREADABLE_KEY, parseMessage, unsavedInRepo, unsavedMessage } from '../src/board';
import { Card, actionLine, uniqueBranch } from '../src/model';
import { branchNameFor, defaultBranch, startCard } from '../src/git';

const ROOT = '/tmp/kanbanlight-test';
mkdirSync(ROOT, { recursive: true });
process.env.GIT_CEILING_DIRECTORIES = ROOT; // A non-repo folder can never resolve to a repo above it.

function tmpDir(): string {
  const dir = mkdtempSync(join(ROOT, 'case-'));
  assert.ok(dir.startsWith(ROOT + '/'));
  return dir;
}

function g(dir: string, ...args: string[]): string {
  assert.ok(dir.startsWith(ROOT + '/'), 'tests run git only under ' + ROOT);
  const id = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false'];
  return execFileSync('git', ['-C', dir, ...id, ...args], { encoding: 'utf8' });
}

function repo(base = 'main'): string {
  const dir = tmpDir();
  g(dir, 'init', '-q', '-b', base);
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  g(dir, 'add', 'a.txt');
  g(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

/** Everything a blocked move must leave untouched. */
function snapshot(dir: string): string {
  return [
    g(dir, 'branch', '--show-current'),
    g(dir, 'for-each-ref', 'refs/heads'),
    g(dir, 'status', '--porcelain=v1'),
    g(dir, 'rev-parse', 'HEAD'),
  ].join('|');
}

test('branch names keep only [a-z0-9-] under kl/', () => {
  assert.equal(branchNameFor('Fix login'), 'kl/fix-login');
  assert.equal(branchNameFor('  Fix   LOGIN!! '), 'kl/fix-login');
  assert.equal(branchNameFor('../x'), 'kl/x');
  assert.equal(branchNameFor('-rf --force'), 'kl/rf-force');
  assert.equal(branchNameFor('a..b'), 'kl/a-b');
  assert.equal(branchNameFor('x.lock'), 'kl/x-lock');
  assert.equal(branchNameFor('HEAD'), 'kl/head');
  assert.equal(branchNameFor('$(rm -rf ~); `id`'), 'kl/rm-rf-id');
  assert.equal(branchNameFor('Café ünïcode'), 'kl/caf-n-code');
  assert.equal(branchNameFor('🚀🔥'), null);
  assert.equal(branchNameFor('...'), null);
  const long = branchNameFor('word '.repeat(50));
  assert.ok(long !== null && long.length <= 43 && !long.endsWith('-'));
  for (const t of ['Fix login', '../x', 'a..b', 'x.lock', 'word '.repeat(50), '@{u}', 'a/b\\c']) {
    const name = branchNameFor(t);
    assert.ok(name && /^kl\/[a-z0-9]+(-[a-z0-9]+)*$/.test(name), `${t} -> ${name}`);
  }
});

/** Commits a new file on a new branch, leaving that branch checked out. */
function commitOn(dir: string, branch: string, file: string): void {
  g(dir, 'switch', '-q', '-c', branch);
  writeFileSync(join(dir, file), branch + '\n');
  g(dir, 'add', file);
  g(dir, 'commit', '-q', '-m', branch);
}

test('success: creates kl/<slug> from main and switches to it', async () => {
  const dir = repo();
  const head = g(dir, 'rev-parse', 'HEAD');
  assert.deepEqual(await startCard('git', dir, 'Fix login'), { ok: true, branch: 'kl/fix-login', created: true });
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login');
  assert.equal(g(dir, 'rev-parse', 'HEAD'), head);
});

test('base: a new card branch starts from main, not from the current branch', async () => {
  const dir = repo();
  const main = g(dir, 'rev-parse', 'main');
  commitOn(dir, 'feature', 'f.txt');
  assert.notEqual(g(dir, 'rev-parse', 'HEAD'), main);
  const r = await startCard('git', dir, 'Fix login');
  assert.deepEqual(r, { ok: true, branch: 'kl/fix-login', created: true });
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), main);
});

test('base: uses master when there is no main', async () => {
  const dir = repo('master');
  const master = g(dir, 'rev-parse', 'master');
  commitOn(dir, 'feature', 'f.txt');
  assert.equal(await defaultBranch('git', dir), 'master');
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(r.ok, true);
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), master);
});

test('base: prefers main when both main and master exist', async () => {
  const dir = repo();
  const main = g(dir, 'rev-parse', 'main');
  commitOn(dir, 'master', 'm.txt');
  assert.equal(await defaultBranch('git', dir), 'main');
  await startCard('git', dir, 'Fix login');
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), main);
});

test('base: a tag named main does not replace the main branch', async () => {
  const dir = repo();
  const main = g(dir, 'rev-parse', 'main');
  commitOn(dir, 'feature', 'f.txt');
  g(dir, 'tag', 'main');
  await startCard('git', dir, 'Fix login');
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), main);
});

test('blocked: neither main nor master exists', async () => {
  const dir = repo('trunk');
  const before = snapshot(dir);
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(!r.ok && r.reason, 'no-base');
  assert.match(!r.ok ? r.message : '', /no main or master/);
  assert.equal(snapshot(dir), before);
});

test('blocked: not a Git repo', async () => {
  const dir = tmpDir();
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not-repo');
});

test('return: an existing kl/ branch is switched to, not recreated or moved', async () => {
  const dir = repo();
  commitOn(dir, 'kl/fix-login', 'work.txt');
  const tip = g(dir, 'rev-parse', 'kl/fix-login');
  g(dir, 'switch', '-q', 'main');
  const r = await startCard('git', dir, 'Fix login');
  assert.deepEqual(r, { ok: true, branch: 'kl/fix-login', created: false });
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login');
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), tip);
});

test('return: works without main or master', async () => {
  const dir = repo('trunk');
  g(dir, 'branch', 'kl/fix-login');
  const r = await startCard('git', dir, 'Fix login');
  assert.deepEqual(r, { ok: true, branch: 'kl/fix-login', created: false });
});

test('return: blocked by tracked changes', async () => {
  const dir = repo();
  g(dir, 'branch', 'kl/fix-login');
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  const before = snapshot(dir);
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(!r.ok && r.reason, 'dirty');
  assert.equal(snapshot(dir), before);
});

test('blocked: unstaged change to a tracked file', async () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  const before = snapshot(dir);
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(!r.ok && r.reason, 'dirty');
  assert.equal(snapshot(dir), before);
});

test('blocked: staged change', async () => {
  const dir = repo();
  writeFileSync(join(dir, 'b.txt'), 'new\n');
  g(dir, 'add', 'b.txt');
  const before = snapshot(dir);
  const r = await startCard('git', dir, 'Fix login');
  assert.equal(!r.ok && r.reason, 'dirty');
  assert.equal(snapshot(dir), before);
});

test('blocked: title with no valid branch name', async () => {
  const dir = repo();
  const before = snapshot(dir);
  const r = await startCard('git', dir, '🚀');
  assert.equal(!r.ok && r.reason, 'bad-name');
  assert.equal(snapshot(dir), before);
});

test('unsaved: only dirty files inside the repo are named', () => {
  const root = '/r/repo';
  const docs = [
    { fsPath: '/r/repo/src/b.ts', isDirty: true },
    { fsPath: '/r/repo/a.ts', isDirty: true },
    { fsPath: '/r/repo/a.ts', isDirty: true }, // Same file in two editors.
    { fsPath: '/r/repo/clean.ts', isDirty: false },
    { fsPath: '/r/repo2/x.ts', isDirty: true }, // Sibling folder sharing the prefix.
    { fsPath: '/r/other.ts', isDirty: true },
    { fsPath: '/r/repo/..hidden', isDirty: true },
    { fsPath: null, isDirty: true }, // Untitled.
  ];
  assert.deepEqual(unsavedInRepo(docs, root), ['..hidden', 'a.ts', 'src/b.ts']);
  assert.deepEqual(unsavedInRepo([], root), []);
});

test('unsaved: the message names files and caps the list', () => {
  assert.equal(unsavedMessage(['a.ts']), 'Save or close these files first: a.ts. Nothing was changed.');
  const many = ['1', '2', '3', '4', '5', '6', '7'];
  assert.equal(unsavedMessage(many), 'Save or close these files first: 1, 2, 3, 4, 5 and 2 more. Nothing was changed.');
});

/** Workspace storage that keeps only JSON, as VS Code's Memento does, so a reload sees copies. */
function memStore(): BoardDeps['store'] & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get: (k) => (raw.has(k) ? JSON.parse(raw.get(k) as string) : undefined),
    update: async (k, v) => void raw.set(k, JSON.stringify(v)),
  };
}

function load(dir: string | null, more: Partial<BoardDeps> = {}): Promise<Board> {
  return Board.load({ gitPath: 'git', dir, store: memStore(), confirm: async () => true, ...more });
}

function colId(b: Board, name: string): string {
  const c = b.data.columns.find((x) => x.name === name);
  assert.ok(c, name);
  return c.id;
}

async function addCard(b: Board, title: string, column = 'To Do'): Promise<Card> {
  await b.handle({ type: 'addCard', columnId: colId(b, column), title, description: '' });
  const card = b.data.cards.at(-1);
  assert.ok(card && card.title === title.trim());
  return card;
}

async function move(b: Board, card: Card, column: string): Promise<void> {
  await b.handle({ type: 'move', cardId: card.id, columnId: colId(b, column) });
}

function columnOf(b: Board, card: Card): string | undefined {
  return b.data.columns.find((c) => c.id === card.columnId)?.name;
}

test('board: a blocked move keeps the card in place, shows a message and assigns no branch', async () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  const v = await board.view();
  assert.equal(columnOf(board, card), 'To Do');
  assert.equal(card.branch, null);
  assert.equal(v.notice?.kind, 'error');
  assert.equal(v.currentBranch, 'main');
});

test('board: a move into In Progress switches branch; other moves do no Git work', async () => {
  const dir = repo();
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'Review');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'main');
  assert.equal(card.branch, null);
  await move(board, card, 'In Progress');
  assert.equal(columnOf(board, card), 'In Progress');
  assert.equal(card.branch, 'kl/fix-login');
  assert.equal((await board.view()).currentBranch, 'kl/fix-login');
});

test('board: moving a card back into In Progress returns to its branch', async () => {
  const dir = repo();
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  await move(board, card, 'Review');
  g(dir, 'switch', '-q', 'main');
  await move(board, card, 'In Progress');
  const v = await board.view();
  assert.equal(columnOf(board, card), 'In Progress');
  assert.equal(v.currentBranch, 'kl/fix-login');
  assert.match(v.notice?.text ?? '', /existing branch kl\/fix-login/);
});

test('board: unsaved files in the repo block the move before any Git action', async () => {
  const dir = repo();
  const before = snapshot(dir);
  const board = await load(dir, {
    openDocs: () => [
      { fsPath: join(dir, 'a.txt'), isDirty: true },
      { fsPath: '/elsewhere/x.ts', isDirty: true },
    ],
  });
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  const v = await board.view();
  assert.equal(columnOf(board, card), 'To Do');
  assert.equal(v.notice?.text, 'Save or close these files first: a.txt. Nothing was changed.');
  assert.equal(snapshot(dir), before);
});

test('board: unsaved files outside the repo do not block', async () => {
  const dir = repo();
  const board = await load(dir, { openDocs: () => [{ fsPath: '/elsewhere/x.ts', isDirty: true }] });
  await move(board, await addCard(board, 'Fix login'), 'In Progress');
  assert.equal((await board.view()).currentBranch, 'kl/fix-login');
});

test('branch: a name another card owns gets -2, -3 and so on', async () => {
  assert.equal(uniqueBranch('kl/a', new Set()), 'kl/a');
  assert.equal(uniqueBranch('kl/a', new Set(['kl/a', 'kl/a-2'])), 'kl/a-3');
  const dir = repo();
  const board = await load(dir);
  const first = await addCard(board, 'Fix login');
  const other = await addCard(board, 'Fix login 2'); // Owns kl/fix-login-2 before the second "Fix login" starts.
  const second = await addCard(board, 'Fix login!');
  for (const c of [first, other, second]) {
    await move(board, c, 'In Progress');
    g(dir, 'switch', '-q', 'main');
  }
  assert.deepEqual([first.branch, other.branch, second.branch], ['kl/fix-login', 'kl/fix-login-2', 'kl/fix-login-3']);
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login-3'), g(dir, 'rev-parse', 'main'));
  assert.equal(await board.branchFor(first), 'kl/fix-login'); // Its own branch is never counted as taken.
});

test('branch: a new card skips names that already exist as branches in the repo', async () => {
  const dir = repo();
  commitOn(dir, 'kl/fix-login', 'work.txt'); // Someone else's work, owned by no card.
  const tip = g(dir, 'rev-parse', 'kl/fix-login');
  g(dir, 'switch', '-q', 'main');
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  assert.equal(card.branch, 'kl/fix-login-2');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login-2');
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login-2'), g(dir, 'rev-parse', 'main'));
  assert.equal(g(dir, 'rev-parse', 'kl/fix-login'), tip);
  assert.match(board.notice?.text ?? '', /Created and switched to kl\/fix-login-2/);
});

test('branch: a card with a stored branch keeps switching to it', async () => {
  const dir = repo();
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  await move(board, card, 'Review');
  g(dir, 'switch', '-q', 'main');
  await move(board, card, 'In Progress'); // kl/fix-login exists now, but it is this card's own branch.
  assert.equal(card.branch, 'kl/fix-login');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login');
  assert.match(board.notice?.text ?? '', /Switched to existing branch kl\/fix-login\./);
  assert.equal(g(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/kl').trim(), 'kl/fix-login');
});

test('branch: renaming a card keeps the branch it was given', async () => {
  const dir = repo();
  const board = await load(dir);
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  await board.handle({ type: 'editCard', cardId: card.id, title: 'Repair sign in', description: 'details' });
  assert.equal(card.title, 'Repair sign in');
  assert.equal(card.branch, 'kl/fix-login');
  await move(board, card, 'Review');
  g(dir, 'switch', '-q', 'main');
  await move(board, card, 'In Progress');
  assert.equal((await board.view()).currentBranch, 'kl/fix-login');
  assert.equal(g(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/kl').trim(), 'kl/fix-login');
});

test('column action decides whether Git runs', async () => {
  const dir = repo();
  const board = await load(dir);
  const ip = colId(board, 'In Progress');
  await board.handle({ type: 'editColumn', columnId: ip, name: 'In Progress', action: 'none' });
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  assert.equal(columnOf(board, card), 'In Progress');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'main');
  assert.equal(card.branch, null);
  await board.handle({ type: 'addColumn', name: 'Doing', action: 'start' });
  await move(board, card, 'Doing');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login');
  const v = await board.view();
  assert.equal(v.columns.find((c) => c.name === 'Doing')?.actionText, 'Moving a card here creates its branch from main and switches to it');
  assert.equal(v.columns.find((c) => c.name === 'In Progress')?.actionText, 'No Git action');
  assert.match(actionLine('start', null), /needs a main or master/);
});

test('columns: add, rename, reorder, and the delete rules', async () => {
  const board = await load(null);
  const names = (): string[] => board.data.columns.map((c) => c.name);
  assert.deepEqual(names(), ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
  assert.deepEqual(board.data.columns.map((c) => c.action), ['none', 'none', 'start', 'none', 'none']);
  await board.handle({ type: 'moveColumn', columnId: colId(board, 'Backlog'), delta: -1 }); // Already first.
  await board.handle({ type: 'moveColumn', columnId: colId(board, 'Done'), delta: -1 });
  await board.handle({ type: 'editColumn', columnId: colId(board, 'To Do'), name: ' Next ', action: 'none' });
  assert.deepEqual(names(), ['Backlog', 'Next', 'In Progress', 'Done', 'Review']);
  const card = await addCard(board, 'x', 'Review');
  await board.handle({ type: 'deleteColumn', columnId: colId(board, 'Review') });
  assert.ok(names().includes('Review'));
  assert.match(board.notice?.text ?? '', /Move or delete the cards in "Review" first/);
  await move(board, card, 'Done');
  await board.handle({ type: 'deleteColumn', columnId: colId(board, 'Review') });
  assert.equal(board.notice?.text, undefined);
  assert.deepEqual(names(), ['Backlog', 'Next', 'In Progress', 'Done']);
  await board.handle({ type: 'deleteCard', cardId: card.id });
  for (const n of ['Backlog', 'Next', 'In Progress']) await board.handle({ type: 'deleteColumn', columnId: colId(board, n) });
  await board.handle({ type: 'deleteColumn', columnId: colId(board, 'Done') });
  assert.deepEqual(names(), ['Done']);
  assert.match(board.notice?.text ?? '', /at least one column/);
  for (let i = 0; i < 25; i++) await board.handle({ type: 'addColumn', name: `c${i}`, action: 'none' });
  assert.equal(board.data.columns.length, 20);
  assert.match(board.notice?.text ?? '', /at most 20 columns/);
});

test('cards: deleting a card keeps its branch, and the confirmation says so', async () => {
  const dir = repo();
  const asked: string[] = [];
  let answer = false;
  const board = await load(dir, { confirm: async (t) => (asked.push(t), answer) });
  const card = await addCard(board, 'Fix login');
  await move(board, card, 'In Progress');
  await board.handle({ type: 'deleteCard', cardId: card.id });
  assert.equal(board.data.cards.length, 1); // Cancelled.
  answer = true;
  await board.handle({ type: 'deleteCard', cardId: card.id });
  assert.equal(board.data.cards.length, 0);
  assert.equal(asked[1], 'Delete the card "Fix login"? Its Git branch kl/fix-login is kept; only the card is deleted.');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'kl/fix-login');
  assert.equal(g(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/kl/fix-login').trim(), 'kl/fix-login');
});

test('storage: the board survives a reload; first run seeds the default board', async () => {
  const dir = repo();
  const store = memStore();
  const a = await Board.load({ gitPath: 'git', dir, store });
  assert.equal(a.data.cards.length, 0);
  assert.ok(store.raw.has(STORE_KEY));
  const card = await addCard(a, 'Fix login');
  await a.handle({ type: 'editCard', cardId: card.id, title: 'Fix login', description: 'Line one\nLine two' });
  await move(a, card, 'In Progress');
  await a.handle({ type: 'addColumn', name: 'Blocked', action: 'none' });
  const b = await Board.load({ gitPath: 'git', dir, store });
  assert.deepEqual(b.data, a.data);
  assert.notEqual(b.data, a.data);
  assert.equal(JSON.parse(store.raw.get(STORE_KEY) as string).version, 1);
  const v = await b.view();
  assert.equal(v.cards[0].branch, 'kl/fix-login');
  assert.equal(v.cards[0].branch, v.currentBranch); // The page highlights this card as active.
});

test('storage: unreadable saved data is kept aside, never silently dropped', async () => {
  const store = memStore();
  const bad = { version: 1, columns: [], cards: [] };
  await store.update(STORE_KEY, bad);
  const board = await Board.load({ gitPath: 'git', dir: null, store });
  assert.equal(board.data.columns.length, 5);
  assert.deepEqual(store.get(UNREADABLE_KEY), bad);
  assert.equal(board.notice?.kind, 'error');
  const tampered = JSON.parse(JSON.stringify(board.data));
  tampered.cards.push({ id: 'abc', title: 't', description: '', columnId: tampered.columns[0].id, branch: 'main' });
  await store.update(STORE_KEY, tampered);
  assert.equal((await Board.load({ gitPath: 'git', dir: null, store })).data.cards.length, 0); // A non-kl/ branch is refused.
});

test('messages from the webview are validated', () => {
  const ok = [
    { type: 'ready' },
    { type: 'move', cardId: 'c1', columnId: 'done' },
    { type: 'addCard', columnId: 'a1', title: 'x'.repeat(200), description: 'd'.repeat(20_000) },
    { type: 'editCard', cardId: 'a1', title: 't', description: '' },
    { type: 'deleteCard', cardId: 'a1' },
    { type: 'addColumn', name: 'n'.repeat(50), action: 'start' },
    { type: 'editColumn', columnId: 'a1', name: 'n', action: 'none' },
    { type: 'moveColumn', columnId: 'a1', delta: -1 },
    { type: 'deleteColumn', columnId: 'a1' },
  ];
  for (const m of ok) assert.deepEqual(parseMessage(m), m, JSON.stringify(m));
  for (const bad of [
    null,
    'move',
    [],
    { type: 'move', cardId: '../c1', columnId: 'done' },
    { type: 'move', cardId: 'c1', columnId: 'done', title: 'x' },
    { type: 'move', cardId: 1, columnId: 'done' },
    { type: 'move', cardId: 'c1', column: 'done' },
    { type: 'ready', extra: true },
    { type: 'run', cmd: 'git reset --hard' },
    { type: 'toString' },
    { type: 'addCard', columnId: 'a1', title: 'x'.repeat(201), description: '' },
    { type: 'addCard', columnId: 'a1', title: '   ', description: '' },
    { type: 'addCard', columnId: 'a1', title: 't', description: 'd'.repeat(20_001) },
    { type: 'addCard', columnId: 'a1', title: 't' },
    { type: 'editCard', cardId: 'a1', title: 't', description: '', branch: 'kl/x' },
    { type: 'addColumn', name: 'n'.repeat(51), action: 'none' },
    { type: 'addColumn', name: 'n', action: 'merge' },
    { type: 'moveColumn', columnId: 'a1', delta: 2 },
  ]) {
    assert.equal(parseMessage(bad), null, JSON.stringify(bad));
  }
});

test('cards: at most 500', async () => {
  const board = await load(null);
  for (let i = 0; i < 501; i++) await board.handle({ type: 'addCard', columnId: colId(board, 'Backlog'), title: `t${i}`, description: '' });
  assert.equal(board.data.cards.length, 500);
  assert.match(board.notice?.text ?? '', /at most 500 cards/);
});
