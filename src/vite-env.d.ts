/// <reference types="vite/client" />
declare module 'ws' {
  import { EventEmitter } from 'events';

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    static CONNECTING: number;
    static CLOSING: number;
    static CLOSED: number;
    readyState: number;
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string): void;
    terminate(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: any);
    clients: Set<WebSocket>;
    close(cb?: (err?: Error) => void): void;
    on(event: 'connection', listener: (socket: WebSocket, request: any) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export default WebSocket;
}


