/**
 * Twelve Data WebSocket client.
 *
 * Uses Node's native global WebSocket (Node 22+).
 *   wss://ws.twelvedata.com/v1/quotes/price?apikey=YOUR_KEY
 *
 * Twelve Data Basic (free) plan accepts WebSocket subscriptions for only
 * a subset of symbols. Rejected ones are reported to the engine via
 * `onSubscribeStatus` so they can be polled over REST instead.
 *
 * Heartbeat protocol (per TD docs):
 *   - The server sends `{ event: "heartbeat" }` every ~10s.
 *   - The client MUST reply with the same payload, otherwise the
 *     connection is dropped abruptly with code 1006.
 * We do NOT send unsolicited heartbeats — only respond to server pings.
 *
 * On disconnect we reconnect with exponential backoff capped at 30s.
 * Symbols TD has already rejected on this connection are remembered
 * across reconnects within the process lifetime to avoid noisy retries.
 */

import { TD_MAP, TD_REVERSE_MAP } from './prices.js';

export type TickHandler = (assetId: string, price: number) => void | Promise<void>;
export type SubscribeStatusHandler = (success: string[], failed: string[]) => void;

const MAX_BACKOFF_MS = 30_000;
// Hard sanity cap: if we don't see ANY message from the server (tick or
// heartbeat) for this long, force a reconnect.
const STALL_TIMEOUT_MS = 45_000;

export class TwelveDataWS {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  // Symbols TD has already rejected during this process lifetime.
  // Avoiding resubscribes keeps logs clean and dodges any potential
  // rate-limiting on the rejected list.
  private knownRejected = new Set<string>();

  // Stall watchdog (resets on every server message)
  private stallTimer: NodeJS.Timeout | null = null;

  constructor(
    private apiKey: string,
    private onTick: TickHandler,
    private onSubscribeStatus?: SubscribeStatusHandler,
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    if (!this.apiKey) {
      console.warn('[ws-td] TWELVE_DATA_API_KEY not set, websocket disabled');
      this.onSubscribeStatus?.([], Object.values(TD_MAP));
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
        this.ws.close(1000, 'client stop');
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
      this.armStallWatchdog();
      this.subscribe();
    };

    ws.onmessage = (ev: MessageEvent) => {
      this.armStallWatchdog(); // any message resets the watchdog
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
      this.handleMessage(text);
    };

    ws.onerror = (ev: Event) => {
      // Browser-style WebSocket errors are sparse — surface what we can.
      const anyEv = ev as any;
      const detail =
        anyEv?.message ||
        anyEv?.error?.message ||
        anyEv?.reason ||
        '(no detail)';
      console.warn(`[ws-td] error: ${detail}`);
    };

    ws.onclose = (ev: CloseEvent) => {
      console.warn(`[ws-td] closed code=${ev.code} reason=${ev.reason || '(empty)'}`);
      this.connected = false;
      this.clearTimers();
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private subscribe(): void {
    // Skip symbols TD has already told us are not allowed on this plan.
    const allSymbols = Object.values(TD_MAP);
    const toSubscribe = allSymbols.filter((s) => !this.knownRejected.has(s));

    if (toSubscribe.length === 0) {
      console.log('[ws-td] all symbols already known-rejected, not subscribing');
      this.onSubscribeStatus?.([], allSymbols);
      return;
    }

    const payload = JSON.stringify({
      action: 'subscribe',
      params: { symbols: toSubscribe.join(',') },
    });
    try {
      this.ws?.send(payload);
      console.log(`[ws-td] subscribing: ${toSubscribe.join(',')}`);
    } catch (err) {
      console.warn('[ws-td] subscribe send failed', err);
    }
  }

  private armStallWatchdog(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      console.warn(`[ws-td] no messages for ${STALL_TIMEOUT_MS}ms, forcing reconnect`);
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
    }, STALL_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
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

    // ---- Server heartbeat: MUST be echoed back ----
    if (msg.event === 'heartbeat') {
      try {
        this.ws?.send(JSON.stringify({ event: 'heartbeat' }));
      } catch {
        /* ignore */
      }
      return;
    }

    // ---- Price tick ----
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

    // ---- Subscribe status ----
    if (msg.event === 'subscribe-status') {
      const okSymbols: string[] = [];
      const failSymbols: string[] = [];

      // Defensive: TD sends success/fails as arrays of strings OR objects with .symbol
      if (Array.isArray(msg.success)) {
        for (const item of msg.success) {
          const s = typeof item === 'string' ? item : item?.symbol;
          if (s) okSymbols.push(s);
        }
      }
      if (Array.isArray(msg.fails)) {
        for (const item of msg.fails) {
          const s = typeof item === 'string' ? item : item?.symbol;
          if (s) failSymbols.push(s);
        }
      }

      // Remember rejections so we don't keep retrying them on reconnect
      for (const s of failSymbols) this.knownRejected.add(s);

      console.log(
        `[ws-td] subscribe-status ok=${okSymbols.length} (${okSymbols.join(',') || '-'}) ` +
          `fail=${failSymbols.length} (${failSymbols.join(',') || '-'})`,
      );
      if (failSymbols.length) {
        console.warn(
          '[ws-td] some symbols not allowed on this Twelve Data plan — engine will poll them via REST instead',
        );
      }

      // Report ALL known-rejected (not just this round's) so the engine
      // keeps polling them on subsequent reconnects.
      const allRejected = Array.from(this.knownRejected);
      this.onSubscribeStatus?.(okSymbols, allRejected);
      return;
    }

    // ---- Anything else: log briefly ----
    if (msg.event) console.log('[ws-td] event', msg.event);
  }
}
