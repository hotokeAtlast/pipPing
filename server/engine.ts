/**
 * Alert engine: polls prices, evaluates active alerts, fires Telegram messages.
 *
 * Two separate intervals so we don't burn Twelve Data credits on crypto:
 *   - POLL_INTERVAL_CRYPTO_MS (default 120s) -> Binance, free, fast
 *   - POLL_INTERVAL_TD_MS     (default 900s = 15 min) -> Twelve Data, credit-limited
 *
 * Legacy POLL_INTERVAL_MS is honoured for back-compat (sets both intervals).
 */

import { fetchCryptoPrices, fetchForexPrices, SUPPORTED_ASSET_IDS, categoryFor } from './prices.js';
import { sendTelegram } from './telegram.js';
import { rowToAlert } from './db.js';

const LEGACY = Number(process.env.POLL_INTERVAL_MS) || 0;
const POLL_CRYPTO_MS = Number(process.env.POLL_INTERVAL_CRYPTO_MS) || LEGACY || 120_000;
const POLL_TD_MS = Number(process.env.POLL_INTERVAL_TD_MS) || LEGACY || 900_000;

export function getPollIntervals() {
  return { cryptoMs: POLL_CRYPTO_MS, tdMs: POLL_TD_MS };
}

export function startEngine(db: any) {
  console.log(
    `[engine] crypto poll = ${POLL_CRYPTO_MS}ms, twelve-data poll = ${POLL_TD_MS}ms`,
  );

  // Run both immediately at startup
  tickCrypto(db).catch((err) => console.error('[engine] initial crypto tick error', err));
  tickTwelveData(db).catch((err) => console.error('[engine] initial TD tick error', err));

  setInterval(() => {
    tickCrypto(db).catch((err) => console.error('[engine] crypto tick error', err));
  }, POLL_CRYPTO_MS);

  setInterval(() => {
    tickTwelveData(db).catch((err) => console.error('[engine] TD tick error', err));
  }, POLL_TD_MS);
}

async function tickCrypto(db: any) {
  const ids = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) === 'crypto');
  const quotes = await fetchCryptoPrices(ids);
  cacheQuotes(db, quotes);
  await evaluateAlertsFor(db, quotes, 'crypto');
}

async function tickTwelveData(db: any) {
  const ids = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) !== 'crypto');
  const quotes = await fetchForexPrices(ids, process.env.TWELVE_DATA_API_KEY);
  cacheQuotes(db, quotes);
  await evaluateAlertsFor(db, quotes, 'non-crypto');
}

function cacheQuotes(db: any, quotes: { assetId: string; price: number; source: string }[]) {
  if (!quotes.length) return;
  const upsert = db.prepare(`
    INSERT INTO price_cache (asset_id, price, updated_at, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      price = excluded.price,
      updated_at = excluded.updated_at,
      source = excluded.source
  `);
  const now = new Date().toISOString();
  for (const q of quotes) upsert.run(q.assetId, q.price, now, q.source);
}

async function evaluateAlertsFor(
  db: any,
  quotes: { assetId: string; price: number; source: string }[],
  scope: 'crypto' | 'non-crypto',
) {
  if (!quotes.length) return;

  const priceMap: Record<string, number> = {};
  for (const q of quotes) priceMap[q.assetId] = q.price;

  // Only consider alerts whose asset matches the scope of this tick
  const matchScope = (cat: string) =>
    scope === 'crypto' ? cat === 'crypto' : cat !== 'crypto';

  const activeAlerts = db
    .prepare('SELECT * FROM alerts WHERE is_active = 1')
    .all()
    .map(rowToAlert)
    .filter((a: any) => a && matchScope(a.category));

  if (!activeAlerts.length) return;

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const fallbackChatId = process.env.TELEGRAM_CHAT_ID || '';

  const insertLog = db.prepare(`
    INSERT INTO notification_logs
      (id, alert_id, asset_name, symbol, category, condition, trigger_price, target_price, timestamp, sent_to_telegram, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deactivate = db.prepare('UPDATE alerts SET is_active = 0, last_triggered_at = ? WHERE id = ?');

  for (const a of activeAlerts) {
    const price = priceMap[a.assetId];
    if (price == null) continue;

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
        `(label=${JSON.stringify(a.label)}) -> sent=${sent}`,
    );
  }
}
