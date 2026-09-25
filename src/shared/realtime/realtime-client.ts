import { logEvent, redactUrl } from '../devlog/devlog-store';
import type { WsState } from '../tab/types';

// One websocket per tab to websocket-gateway (/api/v1/ws/{driver|rider}). The gateway
// authenticates the upgrade with ?token=<jwt>&device_id=<id> because browsers can't set
// headers on a websocket handshake. Reconnects with exponential backoff; job offers are
// replayed by the gateway on reconnect, and trip state is re-read over HTTP by callers.

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

type MessageHandler = (message: RealtimeMessage) => void;

interface RealtimeClientOptions {
  path: string;
  token: string;
  deviceId: string;
  onStateChange?: (state: WsState) => void;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private handlers = new Set<MessageHandler>();
  private options: RealtimeClientOptions;
  state: WsState = 'idle';

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close(1000, 'client disconnect');
    this.socket = null;
    this.setState('closed');
  }

  send(message: RealtimeMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    logEvent('ws-out', message.type, message);
    return true;
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private url(): string {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ token: this.options.token, device_id: this.options.deviceId });
    return `${scheme}://${window.location.host}${this.options.path}?${params}`;
  }

  private open(): void {
    const url = this.url();
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    logEvent('ws-state', `connecting ${redactUrl(url)}`);

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setState('open');
      logEvent('ws-state', `open ${this.options.path}`);
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: RealtimeMessage;
      try {
        message = JSON.parse(event.data) as RealtimeMessage;
      } catch {
        logEvent('error', 'ws message was not JSON', event.data);
        return;
      }
      logEvent('ws-in', message.type ?? 'unknown', message);
      for (const handler of this.handlers) handler(message);
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      logEvent('ws-state', `closed code=${event.code}${event.reason ? ` reason=${event.reason}` : ''}`);
      if (this.stopped) return;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt += 1;
      this.setState('reconnecting');
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private setState(state: WsState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
