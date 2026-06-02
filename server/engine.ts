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
import { store } from './db.js';
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

export function startEngine(): void {
  console.log(
    `[engine] crypto=${POLL_CRYPTO_MS}ms; td=WebSocket+${POLL_TD_FALLBACK_MS}ms-fallback`,
  );

  // ---- Crypto polling ----
  tickCrypto().catch((err) => console.error('[engine] initial crypto tick error', err));
  setInterval(() => {
    tickCrypto().catch((err) => console.error('[engine] crypto tick error', err));
  }, POLL_CRYPTO_MS);

  // ---- Twelve Data WebSocket ----
  tdWs = new TwelveDataWS(
    process.env.TWELVE_DATA_API_KEY || '',
    async (assetId, price) => {
      // WS ticks don't include 24h change; leave it undefined to keep prior value.
      await handleAssetPriceUpdate(assetId, price, 'TwelveData WS');
    },
    (success: string[], failed: string[]) => {
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
  setInterval(() => {
    tickTwelveDataFallback().catch((err) =>
      console.error('[engine] td fallback tick error', err),
    );
  }, POLL_TD_FALLBACK_MS);
  setTimeout(() => {
    tickTwelveDataFallback().catch(() => {});
  }, 5_000);
}

export function stopEngine(): void {
  if (tdWs) {
    tdWs.stop();
    tdWs = null;
  }
}

async function tickCrypto(): Promise<void> {
  const ids = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) === 'crypto');
  const quotes = await fetchCryptoPrices(ids);
  for (const q of quotes) {
    await handleAssetPriceUpdate(q.assetId, q.price, q.source);
  }
}

async function tickTwelveDataFallback(): Promise<void> {
  const candidates = Object.keys(TD_MAP).filter(
    (id) => !wsLiveSymbols.has(id),
  );
  if (!candidates.length) return;
  const quotes = await fetchForexPrices(candidates, process.env.TWELVE_DATA_API_KEY);
  for (const q of quotes) {
    await handleAssetPriceUpdate(q.assetId, q.price, 'TwelveData REST');
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
  assetId: string,
  price: number,
  source: string,
  change24h?: number,
): Promise<void> {
  if (!isFinite(price)) return;

  // Read the previous cached price (if any) BEFORE we overwrite it.
  const prevRow = await store.getPrice(assetId);
  const prevPrice = prevRow?.price;

  // Cache the latest price + (optional) 24h change
  await store.upsertPrice(assetId, price, source, change24h);

  // No previous price -> nothing to compare against, skip evaluation.
  if (prevPrice == null) return;

  // Find active alerts for this asset
  const alerts = await store.listActiveAlertsForAsset(assetId);
  if (!alerts.length) return;

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const fallbackChatId = process.env.TELEGRAM_CHAT_ID || '';

  for (const a of alerts) {
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

    const now = new Date().toISOString();
    await store.createLog({
      alertId: a.id,
      assetName: a.assetName,
      symbol: a.symbol,
      category: a.category,
      condition: direction,
      triggerPrice,
      targetPrice: a.targetPrice,
      timestamp: now,
      sentToTelegram: sent,
      label: a.label,
    });
    await store.deactivateAlert(a.id, now);

    console.log(
      `[engine] FIRED ${a.symbol} crossed ${direction} ${a.targetPrice} ` +
        `(prev=${prevPrice} now=${triggerPrice} src=${source}) -> sent=${sent}`,
    );
  }
}
