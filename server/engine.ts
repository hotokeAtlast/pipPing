/**
 * Alert engine.
 *
 * Two price sources, two latency profiles:
 *   - Crypto via Binance: REST polling on POLL_INTERVAL_CRYPTO_MS (default 60s).
 *   - Forex / gold via Twelve Data: real-time WebSocket push (sub-second).
 *
 * Both call into the shared evaluator `handleAssetPriceUpdate` which caches
 * the price, finds matching active alerts, fires Telegram, logs, and
 * deactivates the alert.
 */

import { fetchCryptoPrices, SUPPORTED_ASSET_IDS, categoryFor } from './prices.js';
import { sendTelegram } from './telegram.js';
import { rowToAlert } from './db.js';
import { TwelveDataWS } from './ws-twelvedata.js';

const LEGACY = Number(process.env.POLL_INTERVAL_MS) || 0;
const POLL_CRYPTO_MS = Number(process.env.POLL_INTERVAL_CRYPTO_MS) || LEGACY || 60_000;

let tdWs: TwelveDataWS | null = null;

export function getEngineStatus() {
  return {
    cryptoMs: POLL_CRYPTO_MS,
    tdWsConnected: tdWs?.isConnected() ?? false,
  };
}

export function startEngine(db: any): void {
  console.log(`[engine] crypto poll = ${POLL_CRYPTO_MS}ms; twelve-data = WebSocket`);

  // ---- Crypto polling ----
  tickCrypto(db).catch((err) => console.error('[engine] initial crypto tick error', err));
  setInterval(() => {
    tickCrypto(db).catch((err) => console.error('[engine] crypto tick error', err));
  }, POLL_CRYPTO_MS);

  // ---- Twelve Data WebSocket ----
  tdWs = new TwelveDataWS(process.env.TWELVE_DATA_API_KEY || '', async (assetId, price) => {
    await handleAssetPriceUpdate(db, assetId, price, 'TwelveData WS');
  });
  tdWs.start();
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

/**
 * Update the cache and evaluate all active alerts for one asset.
 * Called from both the crypto polling loop and the TD WebSocket.
 */
export async function handleAssetPriceUpdate(
  db: any,
  assetId: string,
  price: number,
  source: string,
): Promise<void> {
  if (!isFinite(price)) return;

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
    const triggered =
      a.condition === 'above' ? price >= a.targetPrice : price <= a.targetPrice;
    if (!triggered) continue;

    const decimals = a.category === 'forex' ? 4 : 2;
    const triggerPrice = Number(price.toFixed(decimals));
    const chatId = a.chatId || fallbackChatId;

    const text =
      `*pipPing alert*\n\n` +
      `*${a.label}*\n` +
      `${a.symbol} went ${a.condition} ${a.targetPrice}\n` +
      `Current: ${triggerPrice}`;

    const sent = await sendTelegram(token, chatId, text);

    insertLog.run(
      `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      a.id,
      a.assetName,
      a.symbol,
      a.category,
      a.condition,
      triggerPrice,
      a.targetPrice,
      new Date().toISOString(),
      sent ? 1 : 0,
      a.label,
    );
    deactivate.run(new Date().toISOString(), a.id);

    console.log(
      `[engine] FIRED ${a.symbol} ${a.condition} ${a.targetPrice} ` +
        `(label=${JSON.stringify(a.label)}, source=${source}) -> sent=${sent}`,
    );
  }
}
