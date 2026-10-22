// The board service: the one place that changes a board. Every command from every source goes
// through one queue, is checked, computed by the domain, stored as one batch, and only then
// applied in memory and answered. Only the instance holding the writer lock may change anything.

import { compareBranches } from '../domain/diff';
import type { DomainError } from '../domain/errors';
import { applyCardChange, createBoard, createBranch, mergeBase, switchBranch, toFields, type CardChange, type Env } from '../domain/history';
import type { Clock, IdSource } from '../domain/ids';
import { resolveBranch } from '../domain/names';
import type { BoardRecord, BranchRecord, CommitId, CommitRecord, HeadRecord } from '../domain/types';
import { checked } from '../storage/checked';
import { isStorageError, storageError, type Change, type StorageAdapter, type WorkingCopyState } from '../storage/types';
import { checkCommand, commandError, isQuery, type Command, type CommandError, type CommandErrorCode, type Query } from './commands';
import type { ChangeFeed, WriterLock } from './ports';

export interface Platform {
  storage: StorageAdapter;
  lock: WriterLock;
  feed: ChangeFeed;
  clock: Clock;
  ids: IdSource;
}

export interface BoardState {
  board: BoardRecord;
  branches: BranchRecord[];
  head: HeadRecord;
  current: WorkingCopyState; // the head branch's working copy
}

export interface BoardService {
  // null only in a read-only instance that opened an empty store before the writer created a board.
  state(): BoardState | null;
  readOnly(): boolean;
  // Resolves with the result once the change is stored; rejects with a plain CommandError.
  run(command: unknown): Promise<unknown>;
  subscribe(listener: () => void): () => void;
  // Takes the writer lock from another instance ("Use here").
  takeOver(): Promise<void>;
  // Resolves when everything queued so far has finished.
  settled(): Promise<void>;
  close(): Promise<void>;
}

const COMMAND_ERROR_CODES: readonly CommandErrorCode[] = [
  'invalid-input', 'unknown-branch', 'ambiguous-branch', 'name-taken', 'unknown-card', 'missing-commit',
  'read-only', 'storage-failed', 'storage-unavailable', 'internal-error',
];

// Storage errors map to two codes; anything thrown that is not a known error is a bug: internal-error.
function toCommandError(error: unknown): CommandError {
  if (isStorageError(error)) return commandError(error.code === 'unavailable' ? 'storage-unavailable' : 'storage-failed', error.reason);
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && (COMMAND_ERROR_CODES as readonly string[]).includes(code)) return error as CommandError;
  return commandError('internal-error');
}

type CardCommand = Extract<Command, { method: 'card.create' | 'card.update' | 'card.move' | 'card.delete' }>;

function toCardChange(command: CardCommand): CardChange {
  switch (command.method) {
    case 'card.create':
      return { command: 'card.create', input: command.params };
    case 'card.update':
      return { command: 'card.update', cardId: command.params.cardId, input: command.params.changes };
    case 'card.move':
      return { command: 'card.move', ...command.params };
    case 'card.delete':
      return { command: 'card.delete', cardId: command.params.cardId };
  }
}

const refuse = (error: DomainError): never => {
  throw commandError(error.code, error.reason);
};

export async function createBoardService(platform: Platform): Promise<BoardService> {
  const storage = checked(platform.storage);
  const env: Env = { clock: platform.clock, ids: platform.ids };
  const commits = new Map<CommitId, CommitRecord>(); // immutable, so safe to keep
  const listeners = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let writer = false;
  let board: BoardState | null = null;

  const notify = () => listeners.forEach((listener) => listener());

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result.catch((error: unknown) => {
      throw toCommandError(error);
    });
  }

  async function commitOf(id: CommitId): Promise<CommitRecord> {
    if (!commits.has(id)) {
      const [found] = await storage.readCommits(board?.board.id ?? '', [id]);
      if (!found) throw commandError('missing-commit');
      commits.set(id, found);
    }
    return commits.get(id)!;
  }

  async function workingCopyOf(branchId: string): Promise<WorkingCopyState> {
    if (board && branchId === board.head.branchId) return board.current;
    const copy = await storage.readWorkingCopy(board!.board.id, branchId);
    if (!copy) throw storageError('read-failed', 'branch has no working copy');
    return copy;
  }

  async function load(): Promise<BoardState | null> {
    const boards = (await storage.listBoards()).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    if (boards.length === 0) {
      if (!writer) return null;
      const created = createBoard(env);
      await storage.apply(created.batch);
      commits.set(created.value.commit.id, created.value.commit);
      platform.feed.publish({ boardId: created.value.board.id });
      return { board: created.value.board, branches: [created.value.branch], head: created.value.head, current: created.value.working };
    }
    const snapshot = (await storage.readBoard(boards[0].id))!;
    const current = await storage.readWorkingCopy(snapshot.board.id, snapshot.head.branchId);
    if (!current) throw storageError('read-failed', 'the current branch has no working copy');
    return { ...snapshot, current };
  }

  // Stores a batch, then (only then) takes the new state, tells subscribers and other instances.
  async function store(batch: Change[], next: BoardState, newCommits: (CommitRecord | null)[] = []) {
    if (batch.length === 0) return;
    if (!writer) throw commandError('read-only');
    await storage.apply(batch);
    for (const commit of newCommits) if (commit) commits.set(commit.id, commit);
    board = next;
    notify();
    platform.feed.publish({ boardId: next.board.id });
  }

  async function execute(command: Command): Promise<unknown> {
    if (!writer) throw commandError('read-only');
    const state = board!;
    switch (command.method) {
      case 'card.create':
      case 'card.update':
      case 'card.move':
      case 'card.delete': {
        const result = applyCardChange(env, state.current, toCardChange(command));
        if (!result.ok) return refuse(result.error);
        await store(result.batch, { ...state, current: result.value.working });
        return result.value.card;
      }
      case 'branch.switch': {
        const target = resolveBranch(command.params.branch, state.branches);
        if (!target.ok) return refuse(target.error);
        if (target.value.id === state.head.branchId) return state.head;
        const next = await workingCopyOf(target.value.id);
        const switched = switchBranch(env, {
          branches: state.branches,
          head: state.head,
          current: state.current,
          currentBase: await commitOf(state.current.copy.baseCommitId),
          target: target.value.id,
        });
        if (!switched.ok) return refuse(switched.error);
        await store(switched.batch, { ...state, head: switched.value.head, current: next }, [switched.value.commit]);
        return switched.value.head;
      }
      case 'branch.create': {
        // Create from `from` (default: the current branch), then switch to the new branch, in one batch.
        let source = state.current;
        if (command.params.from !== undefined) {
          const from = resolveBranch(command.params.from, state.branches);
          if (!from.ok) return refuse(from.error);
          source = await workingCopyOf(from.value.id);
        }
        const created = createBranch(env, {
          name: command.params.name,
          branches: state.branches,
          source,
          sourceBase: await commitOf(source.copy.baseCommitId),
        });
        if (!created.ok) return refuse(created.error);
        const fromHead = source.copy.branchId === state.head.branchId;
        const current = fromHead ? created.value.source : state.current;
        const branches = [...state.branches, created.value.branch];
        const switched = switchBranch(env, {
          branches,
          head: state.head,
          current,
          currentBase: fromHead && created.value.commit ? created.value.commit : await commitOf(current.copy.baseCommitId),
          target: created.value.branch.id,
        });
        if (!switched.ok) return refuse(switched.error);
        await store(
          [...created.batch, ...switched.batch],
          { ...state, branches, head: switched.value.head, current: created.value.working },
          [created.value.commit, switched.value.commit]
        );
        return created.value.branch;
      }
    }
  }

  async function answer(query: Query): Promise<unknown> {
    if (!board) throw commandError('storage-unavailable', 'no board yet');
    const state = board;
    switch (query.method) {
      case 'board.view':
        return { board: state.board, branches: state.branches, head: state.head, cards: state.current.cards };
      case 'branch.list':
        return state.branches;
      case 'branch.compare': {
        const [a, b] = [resolveBranch(query.params.a, state.branches), resolveBranch(query.params.b, state.branches)];
        if (!a.ok) return refuse(a.error);
        if (!b.ok) return refuse(b.error);
        const [ours, theirs] = [await workingCopyOf(a.value.id), await workingCopyOf(b.value.id)];
        const missing = (await storage.listCommitIds(state.board.id)).filter((id) => !commits.has(id));
        for (const commit of await storage.readCommits(state.board.id, missing)) commits.set(commit.id, commit);
        const base = mergeBase(ours.copy.baseCommitId, theirs.copy.baseCommitId, commits);
        if (!base.ok) return refuse(base.error);
        const differences = compareBranches(
          ours.cards.map(toFields),
          theirs.cards.map(toFields),
          base.value ? commits.get(base.value)!.state.cards : []
        );
        return { a: a.value.id, b: b.value.id, base: base.value, differences };
      }
    }
  }

  const reload = () =>
    enqueue(async () => {
      board = await load();
      notify();
    });

  try {
    await storage.open();
    writer = await platform.lock.acquire();
    board = await load();
  } catch (error) {
    throw toCommandError(error);
  }

  const stopLost = platform.lock.onLost(() => {
    writer = false;
    notify();
  });
  // A read-only instance follows the writer's changes.
  const stopFeed = platform.feed.subscribe(() => {
    if (!writer) reload().catch(() => undefined);
  });

  return {
    state: () => board,
    readOnly: () => !writer,
    run(raw) {
      const parsed = checkCommand(raw);
      return enqueue(async () => {
        if (!parsed.ok) throw commandError('invalid-input', parsed.reason);
        return isQuery(parsed.value) ? answer(parsed.value) : execute(parsed.value);
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async takeOver() {
      writer = await platform.lock.acquire({ steal: true });
      await reload();
    },
    settled: () => tail.then(() => undefined),
    async close() {
      stopLost();
      stopFeed();
      platform.feed.close();
      if (writer) await platform.lock.release();
      writer = false;
      await storage.close();
    },
  };
}
