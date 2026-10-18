import { Component, type ReactNode } from 'react';
import { openDB } from 'idb';

// Shown instead of the board when stored data cannot be displayed. It reads storage
// directly and only reads: no store, no theme provider, nothing that could write.

async function readIndexedDB(): Promise<Record<string, unknown[]>> {
  const stores: Record<string, unknown[]> = {};
  // No version: opens whatever exists. If nothing exists, abort so no empty database is created.
  const db = await openDB('kanban-light', undefined, {
    upgrade(_db, oldVersion, _newVersion, transaction) {
      if (oldVersion === 0) {
        transaction.done.catch(() => {});
        transaction.abort();
      }
    },
  });
  try {
    for (const name of db.objectStoreNames) stores[name] = await db.getAll(name);
  } finally {
    db.close();
  }
  return stores;
}

async function downloadData(): Promise<void> {
  let indexedDB: Record<string, unknown[]> = {};
  try {
    indexedDB = await readIndexedDB();
  } catch {
    // No database, or IndexedDB is unavailable: save what localStorage holds.
  }
  const localStorageData: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('kanban')) localStorageData[key] = localStorage.getItem(key) ?? '';
  }

  const file = JSON.stringify({ indexedDB, localStorage: localStorageData }, null, 2);
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `kanbanlight-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RecoveryView() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 p-6">
      <div className="max-w-lg space-y-4">
        <h1 className="text-lg font-semibold">Something on this board can't be displayed.</h1>
        <p className="text-sm text-slate-700">
          Your data is still in this browser. Download a copy before doing anything else. To start over, clear this
          site's data in your browser settings; this deletes every card and branch.
        </p>
        <button
          type="button"
          onClick={() => void downloadData()}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"
        >
          Download data
        </button>
      </div>
    </main>
  );
}

export class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <RecoveryView /> : this.props.children;
  }
}
