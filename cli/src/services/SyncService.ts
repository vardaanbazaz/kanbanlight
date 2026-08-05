import WebSocket from 'ws';
import { BoardService, BoardEvent } from './BoardService';
import chalk from 'chalk';

export interface RemoteConfig {
  name: string;
  url: string;
  token?: string;
}

export class SyncService {
  private boardService: BoardService;
  private remotes: Map<string, RemoteConfig> = new Map();

  constructor(boardService: BoardService) {
    this.boardService = boardService;
    this.loadRemoteConfig();
  }

  private async loadRemoteConfig(): Promise<void> {
    // Load remote configurations from local storage
    // This would typically read from .kanban/config or similar
  }

  async addRemote(name: string, url: string, token?: string): Promise<void> {
    this.remotes.set(name, { name, url, token });
    console.log(chalk.green(`✅ Added remote "${name}": ${url}`));
  }

  async removeRemote(name: string): Promise<void> {
    if (this.remotes.delete(name)) {
      console.log(chalk.green(`✅ Removed remote "${name}"`));
    } else {
      console.log(chalk.yellow(`⚠️  Remote "${name}" not found`));
    }
  }

  async listRemotes(): Promise<void> {
    if (this.remotes.size === 0) {
      console.log(chalk.gray('No remotes configured'));
      return;
    }

    console.log(chalk.blue('📡 Configured remotes:'));
    for (const [name, config] of this.remotes) {
      console.log(chalk.gray(`  ${name}: ${config.url}`));
    }
  }

  async syncWithRemote(remoteName: string = 'origin', force: boolean = false): Promise<void> {
    const remote = this.remotes.get(remoteName);
    if (!remote) {
      throw new Error(`Remote "${remoteName}" not found`);
    }

    console.log(chalk.blue(`🔄 Syncing with ${remoteName}...`));

    try {
      // Get current board
      const activeBoard = await this.boardService.getActiveBoard();
      if (!activeBoard) {
        throw new Error('No active board found');
      }

      // Connect to remote WebSocket
      const ws = new WebSocket(remote.url, {
        headers: remote.token ? { 'Authorization': `Bearer ${remote.token}` } : {}
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          console.log(chalk.green('✅ Connected to remote'));
          
          // Send local events
          this.sendLocalEvents(ws, activeBoard.id);
          resolve();
        });

        ws.on('message', (data) => {
          this.handleRemoteEvent(JSON.parse(data.toString()));
        });

        ws.on('error', (error) => {
          console.error(chalk.red('❌ Sync error:'), error.message);
          reject(error);
        });

        ws.on('close', () => {
          console.log(chalk.gray('🔌 Connection closed'));
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          ws.close();
          reject(new Error('Sync timeout'));
        }, 30000);
      });

    } catch (error) {
      console.error(chalk.red('❌ Sync failed:'), (error as Error).message);
      throw error;
    }
  }

  private async sendLocalEvents(ws: WebSocket, boardId: string): Promise<void> {
    const events = await this.boardService.getEvents(boardId, 100);
    
    ws.send(JSON.stringify({
      type: 'sync_request',
      boardId,
      events: events.map(e => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        timestamp: e.timestamp.toISOString(),
        userId: e.userId
      }))
    }));
  }

  private async handleRemoteEvent(message: any): Promise<void> {
    switch (message.type) {
      case 'sync_response':
        await this.processRemoteEvents(message.events);
        break;
      case 'conflict':
        await this.handleConflict(message.conflict);
        break;
      default:
        console.log(chalk.gray(`Received: ${message.type}`));
    }
  }

  private async processRemoteEvents(events: any[]): Promise<void> {
    console.log(chalk.blue(`📥 Processing ${events.length} remote events...`));
    
    for (const event of events) {
      // Apply remote events to local board
      // This would implement CRDT-style conflict resolution
      await this.boardService.logEvent(
        event.boardId,
        event.type,
        event.payload,
        event.userId
      );
    }

    console.log(chalk.green('✅ Remote events applied'));
  }

  private async handleConflict(conflict: any): Promise<void> {
    console.log(chalk.yellow('⚠️  Conflict detected:'), conflict.description);
    console.log(chalk.gray('Use "kb resolve" to handle conflicts'));
  }

  async pushChanges(remoteName: string = 'origin'): Promise<void> {
    console.log(chalk.blue(`📤 Pushing changes to ${remoteName}...`));
    await this.syncWithRemote(remoteName);
  }

  async pullChanges(remoteName: string = 'origin'): Promise<void> {
    console.log(chalk.blue(`📥 Pulling changes from ${remoteName}...`));
    await this.syncWithRemote(remoteName);
  }

  async getStatus(): Promise<{
    ahead: number;
    behind: number;
    conflicts: number;
  }> {
    // This would compare local vs remote state
    return {
      ahead: 0,
      behind: 0,
      conflicts: 0
    };
  }
}