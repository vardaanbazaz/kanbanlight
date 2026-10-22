// Tells other tabs that the board changed, on BroadcastChannel (which never delivers to the sender).

import type { ChangeFeed, ChangeMessage } from '../../commands/ports';

const isChangeMessage = (value: unknown): value is ChangeMessage =>
  typeof value === 'object' && value !== null && typeof (value as ChangeMessage).boardId === 'string';

export function broadcastFeed(name: string): ChangeFeed {
  const channel = new BroadcastChannel(name);
  return {
    publish(message) {
      channel.postMessage(message);
    },
    subscribe(listener) {
      const handler = (event: MessageEvent) => {
        if (isChangeMessage(event.data)) listener({ boardId: event.data.boardId });
      };
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
    close() {
      channel.close();
    },
  };
}
