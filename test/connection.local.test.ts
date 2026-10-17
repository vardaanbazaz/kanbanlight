// @vitest-environment-options {"url": "http://localhost:5173/"}
import { expect, it } from 'vitest';
import { openTab } from './harness';
import { FakeWebSocket } from './setup';

it.fails('a page served from localhost connects to the bridge on 127.0.0.1', async () => {
  await openTab();
  expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual(['ws://127.0.0.1:8080']);
});
