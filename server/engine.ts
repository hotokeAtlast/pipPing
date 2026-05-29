/**
 * Alert engine.
 *
 * Three price sources, three latency profiles:
 *   - Crypto via Binance:                REST polling, default 60s
 *   - Forex / gold via Twelve Data WS:   real-time push (~1s)
 *   - Forex / gold not allowed on WS:    REST polling fallback,
 *                                        default 5 min (TD free tier
 *                                        Basic plan only allows a
 *                                        subset of symbols on WS)
 *
 * All paths funnel into `handleAssetPriceUpdate` which caches the price,
 * finds matching active alerts, fires Telegram, logs, deactivates.
 *
 * Cross direction is detected automatically from the cached previous
 * price — the user no longer picks above/below.
 */

import {
  fetchCryptoPrices,
  fetchForexPrices,
  SUPPORTED_ASSET_IDS,
  categoryFor,
  TD_MAP,
  TD_REVERSE_MAP,
} from './prices.js';
import { buildAlertMessage, sendTelegram } from './telegram.js';
import { rowToAlert } from './db.js';
import { TwelveDataWS } from './ws-twelvedata.js';

const LEGACY = Number(process.env.POLL_INTERVAL_MS) || 0;
const POLL_CRYPTO_MS = Number(process.env.POLL_INTERVAL_CRYPTO_MS) || LEGACY || 60_000;
const POLL_TD_FALLBACK_MS = Number(process.env.POLL_INTERVAL_TD_FALLBACK_MS) || 300_000; // 5 min

let tdWs: TwelveDataWS | null = null;
// Symbols whose WS subscribe failed (gated behind paid plan) — fall back to polling.
const wsFailedSymbols = new Set<string>();
// Symbols accepted on the WS — never poll these.
const wsLiveSymbols = new Set<string>();

export function getEngineStatus() {
  return {
    cryptoMs: POLL_CRYPTO_MS,
    tdWsConnected: tdWs?.isConnected() ?? false,
    tdWsLiveSymbols: Array.from(wsLiveSymbols),
    tdPolledSymbols: Array.from(wsFailedSymbols),
    tdFallbackMs: POLL_TD_FALLBACK_MS,
  };
}

export function startEngine(db: any): void {
  console.log(
    `[engine] crypto=${POLL_CRYPTO_MS}ms; td=WebSocket+${POLL_TD_FALLBACK_MS}ms-fallback`,
  );

  // ---- Crypto polling ----
  tickCrypto(db).catch((err) => console.error('[engine] initial crypto tick error', err));
  setInterval(() => {
    tickCrypto(db).catch((err) => console.error('[engine] crypto tick error', err));
  }, POLL_CRYPTO_MS);

  // ---- Twelve Data WebSocket ----
  tdWs = new TwelveDataWS(
    process.env.TWELVE_DATA_API_KEY || '',
    async (assetId, price) => {
      await handleAssetPriceUpdate(db, assetId, price, 'TwelveData WS');
    },
    (success: string[], failed: string[]) => {
      // Track which TD symbols got accepted vs gated, so the polling fallback
      // covers only the gated ones.
      wsLiveSymbols.clear();
      wsFailedSymbols.clear();
      for (const sym of success) {
        const id = TD_REVERSE_MAP[sym];
        if (id) wsLiveSymbols.add(id);
      }
      for (const sym of failed) {
        const id = TD_REVERSE_MAP[sym];
        if (id) wsFailedSymbols.add(id);
      }
      console.log(
        `[engine] TD WS live=${[...wsLiveSymbols].join(',') || '(none)'} ` +
          `polled=${[...wsFailedSymbols].join(',') || '(none)'}`,
      );
    },
  );
  tdWs.start();

  // ---- TD polling fallback ----
  // Default: 5 min interval, but skips symbols already streaming over WS.
  // For the free plan with 2 gated symbols this is 2*288 = 576 credits/day,
  // safely under the 800 credits/day Twelve Data free limit.
  setInterval(() => {
    tickTwelveDataFallback(db).catch((err) =>
      console.error('[engine] td fallback tick error', err),
    );
  }, POLL_TD_FALLBACK_MS);
  // Also run once at startup so gated symbols populate immediately
  setTimeout(() => {
    tickTwelveDataFallback(db).catch(() => {});
  }, 5_000);
}

export function stopEngine(): void {
  if (tdWs) {
    tdWs.stop();
    tdWs = null;
  }
}

async function tickCrypto(db: any): Promise<void> {
  const ids = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) === 'crypto');
  const quotes = await fetchCryptoPrices(ids);
  for (const q of quotes) {
    await handleAssetPriceUpdate(db, q.assetId, q.price, q.source);
  }
}

async function tickTwelveDataFallback(db: any): Promise<void> {
  // Only poll TD symbols that aren't already streaming on the WS.
  const candidates = Object.keys(TD_MAP).filter(
    (id) => !wsLiveSymbols.has(id),
  );
  if (!candidates.length) return;
  const quotes = await fetchForexPrices(candidates, process.env.TWELVE_DATA_API_KEY);
  for (const q of quotes) {
    await handleAssetPriceUpdate(db, q.assetId, q.price, 'TwelveData REST');
  }
}

/**
 * Update the cache and evaluate all active alerts for one asset.
 *
 * Cross detection: triggers when the price moves past targetPrice in
 * EITHER direction since the previously cached price. First-ever
 * observation is recorded but does not trigger (we don't know which
 * side the price was on before).
 */
export async function handleAssetPriceUpdate(
  db: any,
  assetId: string,
  price: number,
  source: string,
): Promise<void> {
  if (!isFinite(price)) return;

  // Read the previous cached price (if any) BEFORE we overwrite it.
  const prevRow = db
    .prepare('SELECT price FROM price_cache WHERE asset_id = ?')
    .get(assetId) as { price: number } | undefined;
  const prevPrice = prevRow?.price;

  // Cache the latest price
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO price_cache (asset_id, price, updated_at, source)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET
       price = excluded.price,
       updated_at = excluded.updated_at,
       source = excluded.source`,
  ).run(assetId, price, now, source);

  // No previous price -> nothing to compare against, skip evaluation.
  if (prevPrice == null) return;

  // Find active alerts for this asset
  const rows = db
    .prepare('SELECT * FROM alerts WHERE asset_id = ? AND is_active = 1')
    .all(assetId);
  if (!rows.length) return;

  const alerts = rows.map(rowToAlert);
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const fallbackChatId = process.env.TELEGRAM_CHAT_ID || '';

  const insertLog = db.prepare(
    `INSERT INTO notification_logs
       (id, alert_id, asset_name, symbol, category, condition, trigger_price, target_price, timestamp, sent_to_telegram, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const deactivate = db.prepare(
    'UPDATE alerts SET is_active = 0, last_triggered_at = ? WHERE id = ?',
  );

  for (const a of alerts) {
    if (!a) continue;

    // Cross detection: did `price` move past `targetPrice` since `prevPrice`?
    const crossedUp = prevPrice < a.targetPrice && price >= a.targetPrice;
    const crossedDown = prevPrice > a.targetPrice && price <= a.targetPrice;
    if (!crossedUp && !crossedDown) continue;

    const direction: 'above' | 'below' = crossedUp ? 'above' : 'below';
    const decimals = a.category === 'forex' ? 5 : 2;
    const triggerPrice = Number(price.toFixed(decimals));
    const chatId = a.chatId || fallbackChatId;

    const text = buildAlertMessage({
      symbol: a.symbol,
      category: a.category,
      label: a.label,
      targetPrice: a.targetPrice,
      triggerPrice,
      direction,
      source,
    });

    const sent = await sendTelegram(token, chatId, text);

    insertLog.run(
      `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      a.id,
      a.assetName,
      a.symbol,
      a.category,
      direction,
      triggerPrice,
      a.targetPrice,
      new Date().toISOString(),
      sent ? 1 : 0,
      a.label,
    );
    deactivate.run(new Date().toISOString(), a.id);

    console.log(
      `[engine] FIRED ${a.symbol} crossed ${direction} ${a.targetPrice} ` +
        `(prev=${prevPrice} now=${triggerPrice} src=${source}) -> sent=${sent}`,
    );
  }
}
