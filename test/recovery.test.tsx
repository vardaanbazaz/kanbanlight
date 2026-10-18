import { openDB } from 'idb';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPage, openTab, waitFor } from './harness';
import { FakeWebSocket } from './setup';

// Wraps whatever the entry module renders in an outer boundary that renders nothing on error,
// so a crash the app does not catch itself ends as an empty page instead of an uncaught error.
function wrapPageInCatchAll() {
  vi.doMock('react-dom/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom/client')>();
    const { Component, createElement } = await import('react');
    class CatchAll extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }
    return {
      ...actual,
      createRoot: (...args: Parameters<typeof actual.createRoot>): Root => {
        const root = actual.createRoot(...args);
        return { render: (node) => root.render(createElement(CatchAll, null, node)), unmount: () => root.unmount() };
      },
    };
  });
}

describe('data the app cannot use', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('react-dom/client');
  });

  it('an unreadable branch list shows the recovery screen and is kept', async () => {
    localStorage.setItem('kanban-branches', '{');
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    const { root } = await mountPage();
    await waitFor(() => root.textContent?.includes('Download data') ?? false);
    expect(root.textContent).toContain('Download data');
    expect(localStorage.getItem('kanban-branches')).toBe('{');
  });

  it('an unreadable branch list never starts the board', async () => {
    localStorage.setItem('kanban-branches', '{');
    const error = vi.spyOn(console, 'error');
    const { root } = await mountPage();
    await waitFor(() => root.textContent?.includes('Download data') ?? false);
    expect(await indexedDB.databases()).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('a card that cannot be displayed shows the recovery screen', async () => {
    const tab = await openTab();
    await tab.state().createCard({ pwned: 1 } as unknown as string, 'todo');
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    wrapPageInCatchAll();
    const { root } = await mountPage();
    await waitFor(() => root.textContent?.includes('Download data') ?? false);
    expect(root.textContent).toContain('Download data');
  });
});

// Everything the page has stored: each IndexedDB object store and each localStorage value, as stored.
async function storageNow() {
  const indexedDBNow: Record<string, unknown[]> = {};
  if ((await indexedDB.databases()).some((info) => info.name === 'kanban-light')) {
    const db = await openDB('kanban-light');
    for (const name of db.objectStoreNames) indexedDBNow[name] = await db.getAll(name);
    db.close();
  }
  return { indexedDB: indexedDBNow, localStorage: { ...localStorage } };
}

// Renders the recovery view on its own, presses its button and returns the file it saves.
async function downloadFromRecoveryView(): Promise<{ name: string; data: Record<string, unknown> }> {
  const saved: { name: string; blob: Blob | null } = { name: '', blob: null };
  // jsdom has no object URLs; record the blob instead.
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      saved.blob = blob;
      return 'blob:recovery';
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.name = this.download;
  });
  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');
  const { RecoveryView } = await import('../src/components/RecoveryScreen');
  document.body.innerHTML = '<div id="root"></div>';
  const reactRoot = createRoot(document.getElementById('root')!);
  reactRoot.render(createElement(RecoveryView));
  await waitFor(() => document.querySelector('button') !== null);
  document.querySelector('button')!.click();
  await waitFor(() => saved.name !== '');
  reactRoot.unmount();
  // jsdom's Blob has no text(); FileReader reads it.
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(saved.blob!);
  });
  return { name: saved.name, data: JSON.parse(text) };
}

describe('the recovery download', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('holds every stored record and value as stored, and changes nothing', async () => {
    const tab = await openTab();
    await tab.state().createCard('kept', 'todo');
    localStorage.setItem('kanban-branches', '{');
    const before = await storageNow();

    const file = await downloadFromRecoveryView();
    expect(file.name).toMatch(/^kanbanlight-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(file.data.indexedDB).toEqual(before.indexedDB);
    expect(file.data.localStorage).toEqual(before.localStorage);
    expect(JSON.stringify(file.data)).toContain('kept');
    expect(await storageNow()).toEqual(before);
  });

  it('works when there is no database, and creates none', async () => {
    localStorage.setItem('kanban-branches', '{');
    localStorage.setItem('unrelated', 'x');

    const file = await downloadFromRecoveryView();
    expect(file.data.localStorage).toEqual({ 'kanban-branches': '{' });
    expect(await indexedDB.databases()).toEqual([]);
    expect(localStorage.getItem('kanban-branches')).toBe('{');
  });
});
