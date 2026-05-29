/**
 * SQLite setup for pipPing.
 * Stores alerts, notification logs, and a small price cache.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type Db = ReturnType<typeof initDb>;

export function initDb() {
  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'server/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'alerts.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      target_price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      label TEXT NOT NULL,
      chat_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_triggered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      trigger_price REAL NOT NULL,
      target_price REAL NOT NULL,
      timestamp TEXT NOT NULL,
      sent_to_telegram INTEGER NOT NULL DEFAULT 1,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      asset_id TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT
    );
  `);

  return db;
}

export function rowToAlert(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    assetId: r.asset_id,
    assetName: r.asset_name,
    symbol: r.symbol,
    category: r.category,
    condition: r.condition,
    targetPrice: r.target_price,
    isActive: !!r.is_active,
    label: r.label,
    chatId: r.chat_id,
    createdAt: r.created_at,
    lastTriggeredAt: r.last_triggered_at || undefined,
  };
}

export function rowToLog(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    alertId: r.alert_id,
    assetName: r.asset_name,
    symbol: r.symbol,
    category: r.category,
    condition: r.condition,
    triggerPrice: r.trigger_price,
    targetPrice: r.target_price,
    timestamp: r.timestamp,
    sentToTelegram: !!r.sent_to_telegram,
    label: r.label,
  };
}
