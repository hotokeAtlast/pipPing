/**
 * Alert engine: polls prices, evaluates active alerts, fires Telegram messages.
 */

import { fetchCryptoPrices, fetchForexPrices, SUPPORTED_ASSET_IDS, categoryFor } from './prices.js';
import { sendTelegram } from './telegram.js';
import { rowToAlert } from './db.js';

const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 120_000;

export function startEngine(db: any) {
  console.log(`[engine] poll loop every ${POLL_MS}ms`);
  // Run immediately, then on interval
  tick(db).catch((err) => console.error('[engine] initial tick error', err));
  setInterval(() => {
    tick(db).catch((err) => console.error('[engine] tick error', err));
  }, POLL_MS);
}

export async function tick(db: any) {
  // Fetch prices for ALL supported assets (so the UI ticker has data even
  // when no alerts exist for that asset). Twelve Data batches into 1 call.
  const cryptoIds = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) === 'crypto');
  const fxIds = SUPPORTED_ASSET_IDS.filter((id) => categoryFor(id) !== 'crypto');

  const [cryptoQuotes, fxQuotes] = await Promise.all([
    fetchCryptoPrices(cryptoIds),
    fetchForexPrices(fxIds, process.env.TWELVE_DATA_API_KEY),
  ]);
  const quotes = [...cryptoQuotes, ...fxQuotes];

  // Cache prices
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

  // Evaluate active alerts
  const priceMap: Record<string, number> = {};
  for (const q of quotes) priceMap[q.assetId] = q.price;

  const activeAlerts = db
    .prepare('SELECT * FROM alerts WHERE is_active = 1')
    .all()
    .map(rowToAlert);

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
    if (!a) continue;
    const price = priceMap[a.assetId];
    if (price == null) continue; // no fresh price -> skip this round

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
