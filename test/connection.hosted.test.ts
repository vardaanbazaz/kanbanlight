// @vitest-environment-options {"url": "https://kanbanlight.vercel.app/"}
import { expect, it } from 'vitest';
import { openTab } from './harness';
import { FakeWebSocket } from './setup';

it('the hosted page never opens a bridge connection', async () => {
  await openTab();
  expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([]);
});
