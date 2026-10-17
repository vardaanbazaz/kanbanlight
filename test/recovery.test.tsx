import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPage, openTab, waitFor } from './harness';

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

  it.fails('an unreadable branch list shows the recovery screen and is kept', async () => {
    localStorage.setItem('kanban-branches', '{');
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    const { root } = await mountPage();
    await waitFor(() => root.textContent?.includes('Download data') ?? false);
    expect(root.textContent).toContain('Download data');
    expect(localStorage.getItem('kanban-branches')).toBe('{');
  });

  it.fails('a card that cannot be displayed shows the recovery screen', async () => {
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
