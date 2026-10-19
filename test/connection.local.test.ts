// @vitest-environment-options {"url": "http://localhost:5173/"}
import { expect, it } from 'vitest';
import { openTab } from './harness';
import { FakeWebSocket } from './setup';

it('a page served from localhost connects to the bridge on 127.0.0.1', async () => {
  await openTab();
  expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual(['ws://127.0.0.1:8080']);
});

it('a bridge that stays down does not update the board on every retry', async () => {
  const tab = await openTab();
  const { useKanbanStore } = await import('../src/store/useKanbanStore');
  let updates = 0;
  const unsubscribe = useKanbanStore.subscribe(() => updates++);
  tab.socket.onerror?.(new Event('error'));
  tab.socket.onclose?.(new CloseEvent('close'));
  unsubscribe();
  expect(updates).toBe(0);
});
