// Export format v1: boards as domain records, independent of how any adapter stores them. History
// (commits) is opt-in; by default a file holds each branch's current cards. The op log is not
// exported. A later 1.x file may add collections: this reader drops ones it does not know and warns.

import {
  checkBoard,
  checkBranch,
  checkCardFields,
  checkCommit,
  checkHead,
  type Checked,
} from '../domain/records';
import { toFields } from '../domain/history';
import type { BoardRecord, BranchRecord, CardFields, CommitRecord, HeadRecord } from '../domain/types';
import type { StorageAdapter } from './types';

export const EXPORT_FORMAT = 'kanbanlight';
export const EXPORT_VERSION = 1;
export const EXPORT_MAX_CHARACTERS = 100_000_000;

export interface ExportedWorkingCopy {
  branchId: string;
  baseCommitId: string;
  dirty: boolean;
  cards: CardFields[];
}

export interface ExportedBoard {
  board: BoardRecord;
  branches: BranchRecord[];
  head: HeadRecord;
  workingCopies: ExportedWorkingCopy[];
  commits?: CommitRecord[];
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  app: { version: string; platform: string };
  boards: ExportedBoard[];
}

export interface ExportOptions {
  exportedAt: number;
  app: { version: string; platform: string };
  history?: boolean;
}

type Reader = Pick<StorageAdapter, 'listBoards' | 'readBoard' | 'readWorkingCopy' | 'listCommitIds' | 'readCommits'>;

export async function writeExport(reader: Reader, options: ExportOptions): Promise<string> {
  const boards: ExportedBoard[] = [];
  for (const { id } of await reader.listBoards()) {
    const snapshot = await reader.readBoard(id);
    if (!snapshot) continue;
    const workingCopies: ExportedWorkingCopy[] = [];
    for (const branch of snapshot.branches) {
      const working = await reader.readWorkingCopy(id, branch.id);
      if (!working) continue;
      const cards = working.cards.map(toFields);
      workingCopies.push({ branchId: branch.id, baseCommitId: working.copy.baseCommitId, dirty: working.copy.dirty, cards });
    }
    const exported: ExportedBoard = { ...snapshot, workingCopies };
    if (options.history) exported.commits = await reader.readCommits(id, await reader.listCommitIds(id));
    boards.push(exported);
  }
  const file: ExportFile = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: options.exportedAt, app: options.app, boards };
  return JSON.stringify(file, null, 2);
}

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

class Rejected extends Error {}
const must = <T>(result: Checked<T>): T => {
  if (!result.ok) throw new Rejected(result.reason);
  return result.value;
};
const ensure = (holds: boolean, reason: string) => {
  if (!holds) throw new Rejected(reason);
};
const list = (value: unknown, what: string): unknown[] => {
  ensure(Array.isArray(value), `${what} must be a list`);
  return value as unknown[];
};
const unique = (ids: string[], what: string) => ensure(new Set(ids).size === ids.length, `${what} ids repeat`);

// Known keys are checked; unknown collections are dropped with a warning.
function known(value: Fields, keys: string[], where: string, warnings: string[]) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) warnings.push(`${where}: unknown collection ${key} was skipped`);
}

function readBoard(raw: unknown, at: number, warnings: string[]): ExportedBoard {
  ensure(isObject(raw), `board ${at} must be an object`);
  const value = raw as Fields;
  known(value, ['board', 'branches', 'head', 'workingCopies', 'commits'], `board ${at}`, warnings);
  const board = must(checkBoard(value.board));
  const branches = list(value.branches, 'branches').map((branch) => must(checkBranch(branch)));
  const head = must(checkHead(value.head));
  const workingCopies = list(value.workingCopies, 'workingCopies').map((copy): ExportedWorkingCopy => {
    ensure(isObject(copy), 'working copy must be an object');
    const { branchId, baseCommitId, dirty, cards, ...rest } = copy as Fields;
    ensure(Object.keys(rest).length === 0, 'working copy: unknown field');
    ensure(typeof branchId === 'string' && typeof baseCommitId === 'string' && typeof dirty === 'boolean', 'working copy: bad field');
    const checkedCards = list(cards, 'cards').map((card) => must(checkCardFields(card)));
    unique(checkedCards.map((card) => card.id), 'card');
    return { branchId: branchId as string, baseCommitId: baseCommitId as string, dirty: dirty as boolean, cards: checkedCards };
  });
  const branchIds = branches.map((branch) => branch.id);
  unique(branchIds, 'branch');
  ensure(branches.every((branch) => branch.boardId === board.id) && head.boardId === board.id, 'a record names another board');
  ensure(branchIds.includes(head.branchId), 'the head names no branch');
  ensure(
    workingCopies.length === branches.length && branchIds.every((id) => workingCopies.some((copy) => copy.branchId === id)),
    'every branch needs exactly one working copy'
  );
  const exported: ExportedBoard = { board, branches, head, workingCopies };
  if (value.commits !== undefined) {
    exported.commits = list(value.commits, 'commits').map((commit) => must(checkCommit(commit)));
    unique(exported.commits.map((commit) => commit.id), 'commit');
    ensure(exported.commits.every((commit) => commit.boardId === board.id), 'a commit names another board');
  }
  return exported;
}

// Checks a file completely before anything is used; the reason names the problem, never content.
export function readExport(text: string): Checked<{ file: ExportFile; warnings: string[] }> {
  if (text.length > EXPORT_MAX_CHARACTERS) return { ok: false, reason: 'the file is too large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'the file is not JSON' };
  }
  try {
    ensure(isObject(raw), 'the file is not an export');
    const value = raw as Fields;
    ensure(value.format === EXPORT_FORMAT, 'the file is not a KanbanLight export');
    ensure(value.version === EXPORT_VERSION, 'the export version is not supported');
    ensure(typeof value.exportedAt === 'number' && Number.isFinite(value.exportedAt), 'exportedAt must be a time');
    const app = value.app as Fields;
    ensure(isObject(app) && typeof app.version === 'string' && typeof app.platform === 'string' && Object.keys(app).length === 2, 'app must name a version and platform');
    const warnings: string[] = [];
    known(value, ['format', 'version', 'exportedAt', 'app', 'boards'], 'file', warnings);
    const boards = list(value.boards, 'boards').map((board, at) => readBoard(board, at, warnings));
    unique(boards.map((board) => board.board.id), 'board');
    const file: ExportFile = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: value.exportedAt as number, app: { version: app.version as string, platform: app.platform as string }, boards };
    return { ok: true, value: { file, warnings } };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.message };
    throw error;
  }
}
