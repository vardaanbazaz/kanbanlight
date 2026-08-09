import WebSocket from 'ws';
import chalk from 'chalk';

export interface BridgeMessage {
  type: string;
  payload: any;
}

export function sendToBridge(message: BridgeMessage, port: number = 8080): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
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
