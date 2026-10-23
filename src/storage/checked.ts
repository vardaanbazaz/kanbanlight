// Wraps any adapter so every record read is checked (2a.2 rules) and filed where it was asked for,
// and every record written passes the same checks. Failures carry the reason, never the content.

import {
  checkBoard,
  checkBranch,
  checkCard,
  checkCommit,
  checkHead,
  checkOpEntry,
  checkWorkingCopy,
  type Checked,
} from '../domain/records';
import { storageError, type Change, type StorageAdapter, type StorageErrorCode } from './types';

const must =
  (code: StorageErrorCode) =>
  <T>(result: Checked<T>): T => {
    if (!result.ok) throw storageError(code, result.reason);
    return result.value;
  };
const readOk = must('read-failed');
const writeOk = must('write-failed');

const filedUnder = (record: { boardId: string; branchId?: string }, boardId: string, branchId?: string) => {
  if (record.boardId !== boardId || (branchId !== undefined && record.branchId !== branchId)) {
    throw storageError('read-failed', 'a record is filed under another board or branch');
  }
};

// Exported for callers that must know a batch passes before they try to store it.
export function checkChange(change: Change) {
  switch (change.kind) {
    case 'putBoard':
      return writeOk(checkBoard(change.board));
    case 'putBranch':
      return writeOk(checkBranch(change.branch));
    case 'setHead':
      return writeOk(checkHead(change.head));
    case 'putCommit':
      return writeOk(checkCommit(change.commit));
    case 'putCard':
      return writeOk(checkCard(change.card));
    case 'setWorkingCopy':
      return writeOk(checkWorkingCopy(change.copy));
    case 'appendOp':
      return writeOk(checkOpEntry(change.entry));
  }
}

export function checked(inner: StorageAdapter): StorageAdapter {
  return {
    open: () => inner.open(),
    close: () => inner.close(),
    readMeta: (key) => inner.readMeta(key),
    listBoards: async () => (await inner.listBoards()).map((board) => readOk(checkBoard(board))),
    async readBoard(boardId) {
      const snapshot = await inner.readBoard(boardId);
      if (!snapshot) return null;
      const board = readOk(checkBoard(snapshot.board));
      if (board.id !== boardId) throw storageError('read-failed', 'a record is filed under another board or branch');
      const branches = snapshot.branches.map((branch) => readOk(checkBranch(branch)));
      const head = readOk(checkHead(snapshot.head));
      [...branches, head].forEach((record) => filedUnder(record, boardId));
      return { board, branches, head };
    },
    async readWorkingCopy(boardId, branchId) {
      const state = await inner.readWorkingCopy(boardId, branchId);
      if (!state) return null;
      const copy = readOk(checkWorkingCopy(state.copy));
      const cards = state.cards.map((card) => readOk(checkCard(card)));
      [copy, ...cards].forEach((record) => filedUnder(record, boardId, branchId));
      const ops = state.ops.map((entry) => readOk(checkOpEntry(entry)));
      if (ops.some((entry, index) => index > 0 && entry.seq <= ops[index - 1].seq)) {
        throw storageError('read-failed', 'ops are out of order');
      }
      return { copy, cards, ops };
    },
    async readCommits(boardId, ids) {
      const commits = (await inner.readCommits(boardId, ids)).map((commit) => readOk(checkCommit(commit)));
      commits.forEach((commit) => filedUnder(commit, boardId));
      return commits;
    },
    async listCommitIds(boardId) {
      const ids = await inner.listCommitIds(boardId);
      if (!ids.every((id) => typeof id === 'string' && id !== '')) throw storageError('read-failed', 'a commit id is not text');
      return ids;
    },
    async apply(batch) {
      batch.forEach(checkChange);
      return inner.apply(batch);
    },
    dumpRaw: () => inner.dumpRaw(),
  };
}
