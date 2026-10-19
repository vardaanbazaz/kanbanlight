import WebSocket from 'ws';

export interface BridgeMessage {
  type: string;
  payload: unknown;
}

export function sendToBridge(message: BridgeMessage, port: number = 8080): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve(false);
    }, 1200);

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.send(JSON.stringify(message));
      setTimeout(() => {
        ws.close();
        resolve(true);
      }, 100);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      // Quietly fail if server is not active
      resolve(false);
    });
  });
}
