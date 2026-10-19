import { openDB } from 'idb';
import { vi } from 'vitest';
import { FakeWebSocket } from './setup';

// One browser tab of the current app: a fresh module graph over the same storage.
export async function openTab() {
  vi.resetModules();
  const { useKanbanStore } = await import('../src/store/useKanbanStore');
  const { branchingService } = await import('../src/services/BranchingService');
  await useKanbanStore.getState().initializeStore();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  return {
    state: () => useKanbanStore.getState(),
    branching: branchingService,
    socket,
    // Delivers one frame exactly as the bridge would.
    async deliver(frame: unknown) {
      if (!socket?.onmessage) throw new Error('the app opened no bridge socket');
      await socket.onmessage(new MessageEvent('message', { data: JSON.stringify(frame) }));
    },
  };
}

export type StoredBranches = { branches: [string, { id: string; name: unknown }][]; currentBranch: string };

export const storedBranches = (): StoredBranches =>
  JSON.parse(localStorage.getItem('kanban-branches') ?? '{"branches":[],"currentBranch":""}');

export async function storedCards(): Promise<Record<string, unknown>[]> {
  const db = await openDB('kanban-light');
  const cards = await db.getAll('cards');
  db.close();
  return cards;
}

export const tick = (ms = 3) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) return false;
    await tick(10);
  }
  return true;
}

// Mounts the app the way the page does: a #root element and the real entry module.
export async function mountPage(): Promise<{ root: HTMLElement; importError: unknown }> {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root')!;
  let importError: unknown = null;
  vi.resetModules();
  await import('../src/main').catch((error: unknown) => {
    importError = error;
  });
  return { root, importError };
}
