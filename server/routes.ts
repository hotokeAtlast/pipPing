/**
 * REST API routes.
 *  GET    /api/health
 *  GET    /api/prices                   - all cached prices
 *  GET    /api/alerts                   - list alerts
 *  POST   /api/alerts                   - create alert
 *  PATCH  /api/alerts/:id               - update alert (toggle, edit threshold)
 *  DELETE /api/alerts/:id               - delete alert
 *  POST   /api/alerts/:id/test          - send a test telegram message right now
 *  GET    /api/logs                     - notification history
 *  DELETE /api/logs                     - clear notification history
 */

import express, { Router } from 'express';
import { rowToAlert, rowToLog } from './db.js';
import { buildAlertMessage, sendTelegram } from './telegram.js';
import { getEngineStatus } from './engine.js';

export function registerRoutes(app: express.Express, db: any) {
  const r = Router();

  r.get('/health', (_req, res) => {
    const { cryptoMs, tdWsConnected, tdWsLiveSymbols, tdPolledSymbols, tdFallbackMs } =
      getEngineStatus();
    res.json({
      ok: true,
      hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasDefaultChatId: !!process.env.TELEGRAM_CHAT_ID,
      hasTwelveDataKey: !!process.env.TWELVE_DATA_API_KEY,
      pollIntervalCryptoMs: cryptoMs,
      tdMode: 'hybrid',
      tdWsConnected,
      tdWsLiveSymbols,
      tdPolledSymbols,
      tdFallbackMs,
    });
  });

  /**
   * Lightweight keep-alive ping for free hosts that spin down idle services
   * (e.g. Render free tier idles after 15 min of inactivity).
   *
   * Hit this every ~10 min from a free cron service like cron-job.org:
   *   https://<your-render-host>.onrender.com/api/ping
   *
   * Intentionally does NO DB work, NO disk IO, no JSON encoding work.
   */
  r.get('/ping', (_req, res) => {
    res.type('text/plain').send('pong');
  });

  r.get('/prices', (_req, res) => {
    const rows = db.prepare('SELECT * FROM price_cache').all();
    res.json(
      rows.map((row: any) => ({
        assetId: row.asset_id,
        price: row.price,
        updatedAt: row.updated_at,
        source: row.source,
      })),
    );
  });

  r.get('/alerts', (_req, res) => {
    const rows = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC').all();
    res.json(rows.map(rowToAlert));
  });

  r.post('/alerts', (req, res) => {
    const a = req.body || {};
    const required = ['assetId', 'assetName', 'symbol', 'category', 'condition', 'targetPrice', 'label'];
    for (const k of required) {
      if (a[k] === undefined || a[k] === null || a[k] === '') {
        return res.status(400).json({ error: `missing field: ${k}` });
      }
    }
    if (!['above', 'below'].includes(a.condition)) {
      return res.status(400).json({ error: 'condition must be "above" or "below"' });
    }
    if (typeof a.targetPrice !== 'number' || !isFinite(a.targetPrice)) {
      return res.status(400).json({ error: 'targetPrice must be a number' });
    }

    const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Date().toISOString();
    const chatId = (a.chatId || '').toString();
    db.prepare(
      `INSERT INTO alerts
        (id, asset_id, asset_name, symbol, category, condition, target_price, is_active, label, chat_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      a.assetId,
      a.assetName,
      a.symbol,
      a.category,
      a.condition,
      a.targetPrice,
      a.label,
      chatId,
      createdAt,
    );
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    res.status(201).json(rowToAlert(row));
  });

  r.patch('/alerts/:id', (req, res) => {
    const map: Record<string, string> = {
      isActive: 'is_active',
      targetPrice: 'target_price',
      label: 'label',
      condition: 'condition',
      chatId: 'chat_id',
    };
    const fields: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in map) {
        fields.push(`${map[k]} = ?`);
        vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'no valid fields to update' });
    vals.push(req.params.id);
    db.prepare(`UPDATE alerts SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(rowToAlert(row));
  });

  r.delete('/alerts/:id', (req, res) => {
    db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Force a real Telegram send for an existing alert (good for verifying setup)
  r.post('/alerts/:id/test', async (req, res) => {
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const a = rowToAlert(row)!;
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = a.chatId || process.env.TELEGRAM_CHAT_ID || '';
    const cached = db.prepare('SELECT price FROM price_cache WHERE asset_id = ?').get(a.assetId) as any;
    const price = cached?.price ?? a.targetPrice;
    const decimals = a.category === 'forex' ? 5 : 2;
    const triggerPrice = Number(price.toFixed(decimals));
    const direction: 'above' | 'below' = triggerPrice >= a.targetPrice ? 'above' : 'below';
    const text = buildAlertMessage({
      symbol: a.symbol,
      category: a.category,
      label: a.label,
      targetPrice: a.targetPrice,
      triggerPrice,
      direction,
      isTest: true,
      source: cached?.source ?? 'cache',
    });
    const sent = await sendTelegram(token, chatId, text);
    db.prepare(
      `INSERT INTO notification_logs
        (id, alert_id, asset_name, symbol, category, condition, trigger_price, target_price, timestamp, sent_to_telegram, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
      `[TEST] ${a.label}`,
    );
    res.json({ ok: true, sent, triggerPrice });
  });

  r.get('/logs', (_req, res) => {
    const rows = db.prepare('SELECT * FROM notification_logs ORDER BY timestamp DESC LIMIT 200').all();
    res.json(rows.map(rowToLog));
  });

  r.delete('/logs', (_req, res) => {
    db.prepare('DELETE FROM notification_logs').run();
    res.json({ ok: true });
  });

  app.use('/api', r);
}
