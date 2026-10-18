import { useKanbanStore } from '../store/useKanbanStore';
import { branchingService } from './BranchingService';
import { parseBridgeFrame, type BridgeCommand } from './bridgeProtocol';

export class CliSyncService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
  }

  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.socket = new WebSocket(`ws://localhost:${this.port}`);

      this.socket.onopen = () => {
        console.log(`[CliSyncService] Connected to local CLI Bridge Server on port ${this.port}`);
        useKanbanStore.setState({ isCliConnected: true });
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = async (event: MessageEvent) => {
        const result = parseBridgeFrame(typeof event.data === 'string' ? event.data : '');
        if (!result.ok) {
          console.warn(`[CliSyncService] Ignored a bridge message: ${result.reason}`);
          return;
        }
        try {
          await this.handleCommand(result.command);
        } catch (err) {
          console.error('[CliSyncService] Error applying a bridge command:', err);
        }
      };

      this.socket.onclose = () => {
        useKanbanStore.setState({ isCliConnected: false });
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        useKanbanStore.setState({ isCliConnected: false });
        this.socket?.close();
      };
    } catch {
      useKanbanStore.setState({ isCliConnected: false });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 3000);
    }
  }

  private async handleCommand(data: BridgeCommand): Promise<void> {
    const store = useKanbanStore.getState();

    switch (data.type) {
      case 'SWITCH_BRANCH':
        await store.switchBranch(data.payload);
        break;

      case 'CREATE_BRANCH': {
        const newBranch = await branchingService.createBranch(data.payload.name, store.activeBranchId || 'main');
        if (data.payload.checkout) {
          await store.switchBranch(newBranch.id);
        }
        break;
      }

      case 'COMPARE_BRANCH':
        await store.startBranchDiff(data.payload);
        break;

      case 'EXIT_DIFF':
        store.exitDiffMode();
        break;

      case 'CREATE_CARD':
        await store.createCard(
          data.payload.title,
          data.payload.columnId || 'backlog',
          {
            description: data.payload.description || '',
            priority: data.payload.priority || 'medium',
            assignee: data.payload.assignee || 'You',
          }
        );
        break;

      case 'HANDSHAKE_ACK':
        break;
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    useKanbanStore.setState({ isCliConnected: false });
  }
}

export const cliSyncService = new CliSyncService();
