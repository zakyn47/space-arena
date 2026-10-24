import type { ClientMessage, ServerMessage } from '@arena/shared';

const SERVER_MESSAGE_TYPES: ReadonlySet<string> = new Set(['welcome', 'snapshot', 'died', 'buyResult', 'kicked']);

export function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    SERVER_MESSAGE_TYPES.has(value.type)
  );
}

export interface ConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onClose(): void;
}

export class Connection {
  private constructor(private readonly socket: WebSocket) {}

  static open(token: string, handlers: ConnectionHandlers): Connection {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    const connection = new Connection(socket);
    socket.addEventListener('open', () => connection.send({ type: 'hello', token }));
    socket.addEventListener('message', (event) => {
      const data: unknown = JSON.parse(String(event.data));
      if (isServerMessage(data)) handlers.onMessage(data);
    });
    socket.addEventListener('close', () => handlers.onClose());
    return connection;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }
}
