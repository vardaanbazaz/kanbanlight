// Runs against throwaway repos under /tmp/kanbanlight-test only.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Board, parseMessage, unsavedInRepo, unsavedMessage } from '../src/board';
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

test('board: a blocked move keeps the card in place and shows a message', async () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  const board = new Board('git', dir);
  await board.move('c1', 'inprogress');
  const v = await board.view();
  assert.equal(v.cards.find((c) => c.id === 'c1')?.column, 'todo');
  assert.equal(v.notice?.kind, 'error');
  assert.equal(v.currentBranch, 'main');
});

test('board: a move into In Progress switches branch; other moves do no Git work', async () => {
  const dir = repo();
  const board = new Board('git', dir);
  await board.move('c2', 'review');
  assert.equal(g(dir, 'branch', '--show-current').trim(), 'main');
  await board.move('c1', 'inprogress');
  const v = await board.view();
  assert.equal(v.cards.find((c) => c.id === 'c1')?.column, 'inprogress');
  assert.equal(v.currentBranch, 'kl/fix-login');
});

test('board: moving a card back into In Progress returns to its branch', async () => {
  const dir = repo();
  const board = new Board('git', dir);
  await board.move('c1', 'inprogress');
  await board.move('c1', 'review');
  g(dir, 'switch', '-q', 'main');
  await board.move('c1', 'inprogress');
  const v = await board.view();
  assert.equal(v.cards.find((c) => c.id === 'c1')?.column, 'inprogress');
  assert.equal(v.currentBranch, 'kl/fix-login');
  assert.equal(v.notice?.kind, 'ok');
  assert.match(v.notice?.text ?? '', /existing branch kl\/fix-login/);
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

test('board: unsaved files in the repo block the move before any Git action', async () => {
  const dir = repo();
  const before = snapshot(dir);
  const board = new Board('git', dir, () => [
    { fsPath: join(dir, 'a.txt'), isDirty: true },
    { fsPath: '/elsewhere/x.ts', isDirty: true },
  ]);
  await board.move('c1', 'inprogress');
  const v = await board.view();
  assert.equal(v.cards.find((c) => c.id === 'c1')?.column, 'todo');
  assert.equal(v.notice?.kind, 'error');
  assert.equal(v.notice?.text, 'Save or close these files first: a.txt. Nothing was changed.');
  assert.equal(snapshot(dir), before);
});

test('board: unsaved files outside the repo do not block', async () => {
  const dir = repo();
  const board = new Board('git', dir, () => [{ fsPath: '/elsewhere/x.ts', isDirty: true }]);
  await board.move('c1', 'inprogress');
  assert.equal((await board.view()).currentBranch, 'kl/fix-login');
});

test('messages from the webview are validated', () => {
  assert.deepEqual(parseMessage({ type: 'ready' }), { type: 'ready' });
  assert.deepEqual(parseMessage({ type: 'move', cardId: 'c1', column: 'done' }), { type: 'move', cardId: 'c1', column: 'done' });
  for (const bad of [
    null,
    'move',
    [],
    { type: 'move', cardId: 'c1', column: 'nowhere' },
    { type: 'move', cardId: '../c1', column: 'done' },
    { type: 'move', cardId: 'c1', column: 'done', title: 'x' },
    { type: 'move', cardId: 1, column: 'done' },
    { type: 'ready', extra: true },
    { type: 'run', cmd: 'git reset --hard' },
  ]) {
    assert.equal(parseMessage(bad), null, JSON.stringify(bad));
  }
});
