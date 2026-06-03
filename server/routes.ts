/**
 * REST API routes.
 *  GET    /api/health                 (public — no auth)
 *  GET    /api/ping                   (public — no auth, used by keep-alive)
 *  GET    /api/prices                 (auth)
 *  GET    /api/history/:assetId       (auth) - OHLC candles for the chart
 *  GET    /api/alerts                 (auth)
 *  POST   /api/alerts                 (auth)
 *  PATCH  /api/alerts/:id             (auth)
 *  DELETE /api/alerts/:id             (auth)
 *  POST   /api/alerts/:id/test        (auth)
 *  GET    /api/logs                   (auth)
 *  DELETE /api/logs                   (auth)
 */

import express, { Router } from 'express';
import { store } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';
import { buildAlertMessage, sendTelegram } from './telegram.js';
import { getEngineStatus } from './engine.js';
import { fetchHistory, INTERVALS, type IntervalKey, SUPPORTED_ASSET_IDS } from './prices.js';

export function registerRoutes(app: express.Express) {
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
      tdWsConnected,
      tdWsLiveSymbols,
      tdPolledSymbols,
      tdFallbackMs,
    });
  });

  /**
   * Lightweight keep-alive ping for free hosts that spin down idle services
   * (e.g. Render free tier idles after 15 min of inactivity).
   */
  r.get('/ping', (_req, res) => {
    res.type('text/plain').send('pong');
  });

  // Everything below this point requires a valid Firebase Auth ID token.
  r.use(requireAuth);

  // Track that this user just hit the API (best-effort, fire-and-forget).
  r.use((req: AuthedRequest, _res, next) => {
    if (req.user) {
      store.touchUser(req.user.uid, req.user.email).catch(() => {});
    }
    next();
  });

  r.get('/prices', async (_req, res) => {
    const prices = await store.listPrices();
    res.json(prices);
  });

  // OHLC candle history for the chart modal.
  //   GET /api/history/:assetId?interval=1h&outputsize=200
  r.get('/history/:assetId', async (req, res) => {
    const assetId = req.params.assetId;
    if (!SUPPORTED_ASSET_IDS.includes(assetId)) {
      return res.status(400).json({ error: `unknown asset: ${assetId}` });
    }
    const intervalRaw = (req.query.interval as string) || '1h';
    const allowed = INTERVALS.map((i) => i.key);
    const interval: IntervalKey = allowed.includes(intervalRaw as IntervalKey)
      ? (intervalRaw as IntervalKey)
      : '1h';
    const outputsize = Math.min(
      1000,
      Math.max(50, parseInt((req.query.outputsize as string) || '200', 10) || 200),
    );
    const candles = await fetchHistory(assetId, interval, outputsize);
    res.json({ assetId, interval, candles });
  });

  r.get('/alerts', async (_req, res) => {
    const alerts = await store.listAlerts();
    res.json(alerts);
  });

  r.post('/alerts', async (req, res) => {
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

    const created = await store.createAlert({
      assetId: a.assetId,
      assetName: a.assetName,
      symbol: a.symbol,
      category: a.category,
      condition: a.condition,
      targetPrice: a.targetPrice,
      label: a.label,
      chatId: (a.chatId || '').toString(),
    });
    res.status(201).json(created);
  });

  r.patch('/alerts/:id', async (req, res) => {
    const map: Record<string, string> = {
      isActive: 'isActive',
      targetPrice: 'targetPrice',
      label: 'label',
      condition: 'condition',
      chatId: 'chatId',
    };
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k in map) patch[k] = v;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'no valid fields to update' });
    }
    const updated = await store.updateAlert(req.params.id, patch as any);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  r.delete('/alerts/:id', async (req, res) => {
    await store.deleteAlert(req.params.id);
    res.json({ ok: true });
  });

  // Force a real Telegram send for an existing alert (good for verifying setup)
  r.post('/alerts/:id/test', async (req, res) => {
    const a = await store.getAlert(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = a.chatId || process.env.TELEGRAM_CHAT_ID || '';
    const cached = await store.getPrice(a.assetId);
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
      source: 'cache',
    });
    const sent = await sendTelegram(token, chatId, text);
    await store.createLog({
      alertId: a.id,
      assetName: a.assetName,
      symbol: a.symbol,
      category: a.category,
      condition: a.condition,
      triggerPrice,
      targetPrice: a.targetPrice,
      timestamp: new Date().toISOString(),
      sentToTelegram: sent,
      label: `[TEST] ${a.label}`,
    });
    res.json({ ok: true, sent, triggerPrice });
  });

  r.get('/logs', async (_req, res) => {
    const logs = await store.listLogs(200);
    res.json(logs);
  });

  r.delete('/logs', async (_req, res) => {
    await store.clearLogs();
    res.json({ ok: true });
  });

  app.use('/api', r);
}
