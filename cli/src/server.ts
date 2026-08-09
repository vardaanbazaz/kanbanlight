import { WebSocketServer, WebSocket } from 'ws';
import chalk from 'chalk';

export class CliBridgeServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
  }

  public start(): void {
    try {
      this.wss = new WebSocketServer({ port: this.port });

      console.log(chalk.bold.green(`\n🚀 KanbanLight CLI Bridge Server listening on ws://localhost:${this.port}`));
      console.log(chalk.gray('Ready to synchronize CLI commands with live React UI...\n'));

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);
        console.log(chalk.cyan(`[Bridge] Client connected (${this.clients.size} active connections)`));

        // Send welcome handshake
        ws.send(JSON.stringify({ type: 'HANDSHAKE_ACK', payload: { connectedClients: this.clients.size } }));

        ws.on('message', (message: string | Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            console.log(chalk.yellow(`[Bridge Command] ${data.type}`), data.payload || '');

            // Broadcast message to all connected clients
            for (const client of this.clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
              }
            }
          } catch (err) {
            console.error(chalk.red('[Bridge Error] Invalid JSON message received:'), err);
          }
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
      console.error(chalk.red(`Failed to start CLI Bridge Server on port ${this.port}:`), error);
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
