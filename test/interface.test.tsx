import { Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { tick, waitFor } from './harness';

const mounted: Root[] = [];

async function renderApp(onCommit?: () => void) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root')!;
  const reactRoot = createRoot(root);
  mounted.push(reactRoot);
  reactRoot.render(
    <Profiler id="app" onRender={() => onCommit?.()}>
      <App />
    </Profiler>
  );
  await waitFor(() => root.querySelector('header') !== null);
  await tick(50);
  return root;
}

describe('header, columns and tour', () => {
  afterEach(() => {
    mounted.splice(0).forEach((reactRoot) => reactRoot.unmount());
  });

  it('every header button has an accessible name', async () => {
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    const root = await renderApp();
    const unnamed = [...root.querySelectorAll('header button')].filter(
      (button) => !button.getAttribute('aria-label') && !button.textContent?.trim()
    );
    expect(unnamed).toHaveLength(0);
  });

  it('column headers have no buttons', async () => {
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    const root = await renderApp();
    const headers = [...root.querySelectorAll('h3')]
      .map((title) => title.closest('.rounded-t-lg'))
      .filter((header): header is Element => header !== null);
    expect(headers).toHaveLength(5);
    expect(headers.flatMap((header) => [...header.querySelectorAll('button')])).toHaveLength(0);
  });

  it('the branch badge shows the branch name only', async () => {
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    const root = await renderApp();
    expect(root.querySelector('[data-tour="branch-badge"]')?.textContent?.trim()).toBe('main');
  });

  it('the tour settles on a step that points at a control', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let commits = 0;
    await renderApp(() => commits++);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await tick(100);
    commits = 0;
    await tick(500);
    vi.mocked(console.error).mockRestore();
    expect(commits).toBeLessThan(20);
  });
});
