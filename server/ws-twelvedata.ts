/**
 * Twelve Data WebSocket client.
 *
 * Uses Node's native global WebSocket (Node 22+).
 *
 *   wss://ws.twelvedata.com/v1/quotes/price?apikey=YOUR_KEY
 *
 * Free tier allows 8 simultaneous symbol subscriptions and unlimited ticks
 * (no credit cost). Heartbeat every 10s keeps the connection alive.
 *
 * On disconnect we reconnect with exponential backoff capped at 30s.
 */

import { TD_MAP, TD_REVERSE_MAP } from './prices.js';

export type TickHandler = (assetId: string, price: number) => void | Promise<void>;

const HEARTBEAT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export class TwelveDataWS {
  private ws: WebSocket | null = null;
  private connected = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  constructor(
    private apiKey: string,
    private onTick: TickHandler,
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    if (!this.apiKey) {
      console.warn('[ws-td] TWELVE_DATA_API_KEY not set, websocket disabled');
      return;
    }
    if (Object.keys(TD_MAP).length === 0) {
      console.log('[ws-td] no TD symbols configured, skipping websocket');
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.connected = false;
  }

  private connect(): void {
    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(this.apiKey)}`;
    console.log('[ws-td] connecting...');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn('[ws-td] failed to construct WebSocket', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      console.log('[ws-td] connected');
      this.connected = true;
      this.reconnectAttempt = 0;
      this.subscribe();
      this.startHeartbeat();
    };

    ws.onmessage = (ev: MessageEvent) => {
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
      this.handleMessage(text);
    };

    ws.onerror = (ev: Event) => {
      // Node's WebSocket errors are sparse; close handler will run after.
      console.warn('[ws-td] error', (ev as any)?.message || ev);
    };

    ws.onclose = (ev: CloseEvent) => {
      console.warn(`[ws-td] closed code=${ev.code} reason=${ev.reason || '(empty)'}`);
      this.connected = false;
      this.clearTimers();
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private subscribe(): void {
    const symbols = Object.values(TD_MAP).join(',');
    if (!symbols) return;
    const payload = JSON.stringify({ action: 'subscribe', params: { symbols } });
    try {
      this.ws?.send(payload);
      console.log(`[ws-td] subscribed: ${symbols}`);
    } catch (err) {
      console.warn('[ws-td] subscribe send failed', err);
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ action: 'heartbeat' }));
        } catch {
          /* ignore */
        }
      }
    }, HEARTBEAT_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.reconnectAttempt);
    console.log(`[ws-td] reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private async handleMessage(text: string): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      console.warn('[ws-td] malformed message', text.slice(0, 200));
      return;
    }

    if (msg.event === 'price' && typeof msg.symbol === 'string' && typeof msg.price === 'number') {
      const assetId = TD_REVERSE_MAP[msg.symbol];
      if (!assetId) return;
      try {
        await this.onTick(assetId, msg.price);
      } catch (err) {
        console.warn('[ws-td] onTick error', err);
      }
      return;
    }

    if (msg.event === 'subscribe-status') {
      const succ = Array.isArray(msg.success) ? msg.success.length : 0;
      const fail = Array.isArray(msg.fails) ? msg.fails.length : 0;
      console.log(`[ws-td] subscribe-status ok=${succ} fail=${fail}`);
      if (fail) console.warn('[ws-td] failed symbols', msg.fails);
      return;
    }

    if (msg.event === 'heartbeat') {
      // ack from server, ignore
      return;
    }

    // Unknown event — log briefly
    if (msg.event) console.log('[ws-td] event', msg.event);
  }
}
