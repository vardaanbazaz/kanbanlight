import { storageError, type StorageAdapter } from '../../src/storage/types';

// Wraps any adapter so that the Nth call to `apply` (counting from 1) fails before reaching it.
export function faulty(inner: StorageAdapter, { failApply }: { failApply: number }): StorageAdapter {
  let applies = 0;
  return {
    open: () => inner.open(),
    close: () => inner.close(),
    readMeta: (key) => inner.readMeta(key),
    listBoards: () => inner.listBoards(),
    readBoard: (boardId) => inner.readBoard(boardId),
    readWorkingCopy: (boardId, branchId) => inner.readWorkingCopy(boardId, branchId),
    readCommits: (boardId, ids) => inner.readCommits(boardId, ids),
    listCommitIds: (boardId) => inner.listCommitIds(boardId),
    dumpRaw: () => inner.dumpRaw(),
    async apply(batch) {
      applies += 1;
      if (applies === failApply) throw storageError('write-failed');
      return inner.apply(batch);
    },
  };
}
