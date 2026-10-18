import { WebSocketServer, WebSocket } from 'ws';
import chalk from 'chalk';

const HOST = '127.0.0.1';

// The web app from `npm run dev` (5173) or `npm run preview` (4173). The CLI's own client sends no Origin.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function failToStart(message: string): void {
  console.error(chalk.red(`Couldn't start the bridge: ${message}`));
  process.exit(1);
}

export class CliBridgeServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
  }

  public start(): void {
    try {
      this.wss = new WebSocketServer({
        host: HOST,
        port: this.port,
        maxPayload: 64 * 1024,
        verifyClient: ({ origin }: { origin: string | undefined }) =>
          origin === undefined || ALLOWED_ORIGINS.includes(origin),
      });

      this.wss.on('listening', () => {
        console.log(
          chalk.bold.green(
            `Bridge listening on ${HOST}:${this.port}. Open KanbanLight from npm run dev; it connects to port 8080. Press Ctrl+C to stop.`
          )
        );
      });

      this.wss.on('error', (err: NodeJS.ErrnoException) => {
        failToStart(err.code === 'EADDRINUSE' ? `port ${this.port} is already in use.` : err.message);
      });

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);
        console.log(chalk.cyan(`[Bridge] Client connected (${this.clients.size} active connections)`));

        // Send welcome handshake
        ws.send(JSON.stringify({ type: 'HANDSHAKE_ACK', payload: { connectedClients: this.clients.size } }));

        ws.on('message', (message: Buffer) => {
          let data: unknown;
          try {
            data = JSON.parse(message.toString());
          } catch {
            data = null;
          }
          if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            console.error(chalk.red('Dropped a message that is not a JSON object.'));
            return;
          }

          // Broadcast message to all connected clients; log the type only, never the payload
          let relayed = 0;
          for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
              relayed++;
            }
          }
          console.log(chalk.yellow(`Relayed ${String((data as { type?: unknown }).type)} to ${relayed} clients`));
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          console.log(chalk.gray(`[Bridge] Client disconnected (${this.clients.size} active connections)`));
        });

        ws.on('error', (err: Error) => {
          console.error(chalk.red('[Bridge Socket Error]:'), err.message);
        });
      });

      // Handle termination
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
    } catch (error) {
      failToStart((error as Error).message);
    }
  }

  public stop(): void {
    console.log(chalk.yellow('\nShutting down CLI Bridge Server...'));
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close(() => {
        console.log(chalk.green('CLI Bridge Server stopped successfully.'));
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

export function startCliServer(port: number = 8080): CliBridgeServer {
  const server = new CliBridgeServer(port);
  server.start();
  return server;
}
