/**
 * SQLite-first data layer for pipPing.
 *
 * Why SQLite-first?
 *   Firestore on the Spark (free) plan caps you at 50K reads / 20K writes
 *   per day. The price-poll engine pushes ~1 tick per second per active
 *   forex/gold symbol on the Twelve Data WebSocket, so a Firestore-only
 *   design burns through the entire daily write quota in under 2 hours.
 *   SQLite has no such cap — it's local-disk, free, and fast.
 *
 * Read path:
 *   Always SQLite. Zero Firestore reads at runtime.
 *
 * Write path:
 *   - alerts, logs:   SQLite synchronously, then Firestore mirror in the
 *                     background (best-effort, fire-and-forget). Firestore
 *                     is the *durable* backup that survives Render
 *                     free-tier cold starts (which wipe the SQLite file
 *                     because there's no persistent disk on free plan).
 *   - prices:         SQLite ONLY. Prices refresh every ~60s anyway, so
 *                     mirroring them to Firestore has zero recovery value
 *                     and would defeat the whole point of this refactor.
 *
 * Cold-start hydration:
 *   On boot, `hydrateFromFirestore()` checks whether SQLite has any
 *   alerts/logs. If empty (= fresh container after a Render cold start),
 *   it pulls the canonical state from Firestore exactly once and bulk-
 *   loads it. Idempotent: subsequent boots within the same container
 *   no-op because SQLite already has rows.
 *
 * Threading note: `node:sqlite` is synchronous (DatabaseSync). All store
 *   methods are still declared `async` to preserve the existing call-site
 *   contract; they just resolve immediately. Firestore mirrors run on
 *   their own microtask so they never block a write.
 */

import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { db as firestore } from './firebase.js';

/** Shorthand for the named-parameter object shape that `stmt.run({...})`
 *  accepts. Our schemas only use null / string / number, which is a strict
 *  subset of SQLInputValue. */
type SqlParams = Record<string, SQLInputValue>;

export interface Alert {
  id: string;
  assetId: string;
  assetName: string;
  symbol: string;
  category: string;
  condition: 'above' | 'below';
  targetPrice: number;
  isActive: boolean;
  label: string;
  chatId: string;
  createdAt: string;
  lastTriggeredAt?: string;
}

export interface NotificationLog {
  id: string;
  alertId: string;
  assetName: string;
  symbol: string;
  category: string;
  condition: 'above' | 'below';
  triggerPrice: number;
  targetPrice: number;
  timestamp: string;
  sentToTelegram: boolean;
  label: string;
}

export interface CachedPrice {
  assetId: string;
  price: number;
  updatedAt: string;
  source: string;
  change24h?: number;
}

export interface AlertInput {
  assetId: string;
  assetName: string;
  symbol: string;
  category: string;
  condition: 'above' | 'below';
  targetPrice: number;
  label: string;
  chatId?: string;
}

export interface AlertPatch {
  isActive?: boolean;
  targetPrice?: number;
  label?: string;
  condition?: 'above' | 'below';
  chatId?: string;
}

export interface LogInput {
  alertId: string;
  assetName: string;
  symbol: string;
  category: string;
  condition: 'above' | 'below';
  triggerPrice: number;
  targetPrice: number;
  timestamp: string;
  sentToTelegram: boolean;
  label: string;
}

// ---------- SQLite handle (lazy-init, single connection) ----------

let sqlite: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (sqlite) return sqlite;
  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'server/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'pipping.db');
  const handle = new DatabaseSync(file);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_alerts_asset_active
      ON alerts(asset_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_alerts_created
      ON alerts(created_at);

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
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp
      ON notification_logs(timestamp DESC);

    CREATE TABLE IF NOT EXISTS price_cache (
      asset_id TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      change_24h REAL
    );
  `);
  sqlite = handle;
  return sqlite;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fire-and-forget Firestore mirror. Schedules the write on the microtask
 * queue and swallows errors with a single warning. Callers don't await
 * it, so a Firestore outage / quota exhaustion never blocks the local
 * write path.
 */
function mirror(label: string, op: () => Promise<unknown>): void {
  Promise.resolve()
    .then(op)
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[db] firestore mirror failed (${label}): ${msg}`);
    });
}

// ---------- Store ----------

export const store = {
  // ===== Alerts =====

  async listAlerts(): Promise<Alert[]> {
    const rows = getDb()
      .prepare('SELECT * FROM alerts ORDER BY created_at DESC')
      .all() as unknown as AlertRow[];
    return rows.map(rowToAlert);
  },

  async getAlert(id: string): Promise<Alert | null> {
    const row = getDb()
      .prepare('SELECT * FROM alerts WHERE id = ?')
      .get(id) as unknown as AlertRow | undefined;
    return row ? rowToAlert(row) : null;
  },

  async createAlert(input: AlertInput): Promise<Alert> {
    const id = newId('alert');
    const createdAt = new Date().toISOString();
    const row: AlertRow = {
      id,
      asset_id: input.assetId,
      asset_name: input.assetName,
      symbol: input.symbol,
      category: input.category,
      condition: input.condition,
      target_price: input.targetPrice,
      is_active: 1,
      label: input.label,
      chat_id: input.chatId || '',
      created_at: createdAt,
      last_triggered_at: null,
    };
    getDb()
      .prepare(
        `INSERT INTO alerts (id, asset_id, asset_name, symbol, category, condition,
         target_price, is_active, label, chat_id, created_at, last_triggered_at)
         VALUES (@id, @asset_id, @asset_name, @symbol, @category, @condition,
         @target_price, @is_active, @label, @chat_id, @created_at, @last_triggered_at)`,
      )
      .run(row as unknown as SqlParams);
    const alert = rowToAlert(row);
    mirror(`createAlert ${id}`, () =>
      firestore.collection('alerts').doc(id).set({
        assetId: alert.assetId,
        assetName: alert.assetName,
        symbol: alert.symbol,
        category: alert.category,
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        isActive: alert.isActive,
        label: alert.label,
        chatId: alert.chatId,
        createdAt: alert.createdAt,
        lastTriggeredAt: null,
      }),
    );
    return alert;
  },

  async updateAlert(id: string, patch: AlertPatch): Promise<Alert | null> {
    const sets: string[] = [];
    const params: SqlParams = { id };
    if (patch.isActive !== undefined) {
      sets.push('is_active = @is_active');
      params.is_active = patch.isActive ? 1 : 0;
    }
    if (patch.targetPrice !== undefined) {
      sets.push('target_price = @target_price');
      params.target_price = patch.targetPrice;
    }
    if (patch.label !== undefined) {
      sets.push('label = @label');
      params.label = patch.label;
    }
    if (patch.condition !== undefined) {
      sets.push('condition = @condition');
      params.condition = patch.condition;
    }
    if (patch.chatId !== undefined) {
      sets.push('chat_id = @chat_id');
      params.chat_id = patch.chatId;
    }
    if (!sets.length) {
      return store.getAlert(id);
    }
    const res = getDb()
      .prepare(`UPDATE alerts SET ${sets.join(', ')} WHERE id = @id`)
      .run(params);
    if (res.changes === 0) return null;
    const alert = await store.getAlert(id);
    if (!alert) return null;
    const fsPatch: Record<string, unknown> = {};
    if (patch.isActive !== undefined) fsPatch.isActive = !!patch.isActive;
    if (patch.targetPrice !== undefined) fsPatch.targetPrice = patch.targetPrice;
    if (patch.label !== undefined) fsPatch.label = patch.label;
    if (patch.condition !== undefined) fsPatch.condition = patch.condition;
    if (patch.chatId !== undefined) fsPatch.chatId = patch.chatId;
    mirror(`updateAlert ${id}`, () =>
      firestore.collection('alerts').doc(id).update(fsPatch),
    );
    return alert;
  },

  async deleteAlert(id: string): Promise<void> {
    getDb().prepare('DELETE FROM alerts WHERE id = ?').run(id);
    mirror(`deleteAlert ${id}`, () => firestore.collection('alerts').doc(id).delete());
  },

  async listActiveAlertsForAsset(assetId: string): Promise<Alert[]> {
    const rows = getDb()
      .prepare('SELECT * FROM alerts WHERE asset_id = ? AND is_active = 1')
      .all(assetId) as unknown as AlertRow[];
    return rows.map(rowToAlert);
  },

  async deactivateAlert(id: string, lastTriggeredAt: string): Promise<void> {
    getDb()
      .prepare('UPDATE alerts SET is_active = 0, last_triggered_at = ? WHERE id = ?')
      .run(lastTriggeredAt, id);
    mirror(`deactivateAlert ${id}`, () =>
      firestore
        .collection('alerts')
        .doc(id)
        .update({ isActive: false, lastTriggeredAt }),
    );
  },

  // ===== Logs =====

  async listLogs(limit = 200): Promise<NotificationLog[]> {
    const rows = getDb()
      .prepare('SELECT * FROM notification_logs ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as unknown as LogRow[];
    return rows.map(rowToLog);
  },

  async createLog(input: LogInput): Promise<NotificationLog> {
    const id = newId('log');
    const row: LogRow = {
      id,
      alert_id: input.alertId,
      asset_name: input.assetName,
      symbol: input.symbol,
      category: input.category,
      condition: input.condition,
      trigger_price: input.triggerPrice,
      target_price: input.targetPrice,
      timestamp: input.timestamp,
      sent_to_telegram: input.sentToTelegram ? 1 : 0,
      label: input.label,
    };
    getDb()
      .prepare(
        `INSERT INTO notification_logs (id, alert_id, asset_name, symbol, category,
         condition, trigger_price, target_price, timestamp, sent_to_telegram, label)
         VALUES (@id, @alert_id, @asset_name, @symbol, @category, @condition,
         @trigger_price, @target_price, @timestamp, @sent_to_telegram, @label)`,
      )
      .run(row as unknown as SqlParams);
    const log = rowToLog(row);
    mirror(`createLog ${id}`, () =>
      firestore.collection('logs').doc(id).set({
        alertId: log.alertId,
        assetName: log.assetName,
        symbol: log.symbol,
        category: log.category,
        condition: log.condition,
        triggerPrice: log.triggerPrice,
        targetPrice: log.targetPrice,
        timestamp: log.timestamp,
        sentToTelegram: log.sentToTelegram,
        label: log.label,
      }),
    );
    return log;
  },

  async clearLogs(): Promise<void> {
    getDb().prepare('DELETE FROM notification_logs').run();
    mirror('clearLogs', async () => {
      const snap = await firestore.collection('logs').get();
      if (snap.empty) return;
      const batch = firestore.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    });
  },

  // ===== Price cache (SQLite ONLY — no Firestore mirror) =====

  async listPrices(): Promise<CachedPrice[]> {
    const rows = getDb().prepare('SELECT * FROM price_cache').all() as unknown as PriceRow[];
    return rows.map((r) => ({
      assetId: r.asset_id,
      price: r.price,
      updatedAt: r.updated_at,
      source: r.source || '',
      change24h: typeof r.change_24h === 'number' ? r.change_24h : undefined,
    }));
  },

  async getPrice(assetId: string): Promise<{ price: number } | null> {
    const row = getDb()
      .prepare('SELECT price FROM price_cache WHERE asset_id = ?')
      .get(assetId) as { price: number } | undefined;
    return row ? { price: row.price } : null;
  },

  async upsertPrice(
    assetId: string,
    price: number,
    source: string,
    change24h?: number,
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    const db = getDb();
    if (change24h !== undefined && isFinite(change24h)) {
      db.prepare(
        `INSERT INTO price_cache (asset_id, price, updated_at, source, change_24h)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(asset_id) DO UPDATE SET
           price = excluded.price,
           updated_at = excluded.updated_at,
           source = excluded.source,
           change_24h = excluded.change_24h`,
      ).run(assetId, price, updatedAt, source, change24h);
    } else {
      // Preserve the previous change_24h when none supplied (WS ticks
      // don't carry it; only the REST quote does).
      db.prepare(
        `INSERT INTO price_cache (asset_id, price, updated_at, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(asset_id) DO UPDATE SET
           price = excluded.price,
           updated_at = excluded.updated_at,
           source = excluded.source`,
      ).run(assetId, price, updatedAt, source);
    }
  },

  // ===== Users (kept on Firestore — sign-in events, negligible volume) =====

  async touchUser(uid: string, email: string | undefined): Promise<void> {
    const update: Record<string, unknown> = { lastSignIn: new Date().toISOString() };
    if (email) update.email = email;
    await firestore.collection('users').doc(uid).set(update, { merge: true });
  },
};

// ---------- Cold-start hydration ----------

/**
 * Pulls alerts and the most recent 200 logs from Firestore into SQLite,
 * but ONLY if the corresponding SQLite table is empty. Designed to be
 * called once at boot, before the engine starts.
 *
 * On a Render free-tier cold start the SQLite file is wiped, so this is
 * how active alerts get re-armed without manual intervention. On a warm
 * restart (or local dev) SQLite already has data and this is a no-op.
 */
export async function hydrateFromFirestore(): Promise<void> {
  const sql = getDb();

  // --- Alerts ---
  const alertCount =
    (sql.prepare('SELECT COUNT(*) AS c FROM alerts').get() as { c: number }).c;
  if (alertCount > 0) {
    console.log(`[db] SQLite has ${alertCount} alert(s); skipping alert hydration`);
  } else {
    try {
      const snap = await firestore.collection('alerts').get();
      if (snap.empty) {
        console.log('[db] no alerts in Firestore; starting empty');
      } else {
        const insert = sql.prepare(
          `INSERT INTO alerts (id, asset_id, asset_name, symbol, category, condition,
           target_price, is_active, label, chat_id, created_at, last_triggered_at)
           VALUES (@id, @asset_id, @asset_name, @symbol, @category, @condition,
           @target_price, @is_active, @label, @chat_id, @created_at, @last_triggered_at)`,
        );
        runBatched(sql, insert, snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            asset_id: data.assetId,
            asset_name: data.assetName,
            symbol: data.symbol,
            category: data.category,
            condition: data.condition,
            target_price: data.targetPrice,
            is_active: data.isActive ? 1 : 0,
            label: data.label,
            chat_id: data.chatId || '',
            created_at: data.createdAt,
            last_triggered_at: data.lastTriggeredAt || null,
          };
        }));
        console.log(`[db] hydrated ${snap.size} alert(s) from Firestore`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] alert hydration failed (will start empty): ${msg}`);
    }
  }

  // --- Logs (cap at 200 — last 200 is plenty for the UI list) ---
  const logCount =
    (sql.prepare('SELECT COUNT(*) AS c FROM notification_logs').get() as { c: number }).c;
  if (logCount > 0) {
    console.log(`[db] SQLite has ${logCount} log(s); skipping log hydration`);
  } else {
    try {
      const snap = await firestore
        .collection('logs')
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
      if (snap.empty) {
        console.log('[db] no logs in Firestore; starting empty');
      } else {
        const insert = sql.prepare(
          `INSERT INTO notification_logs (id, alert_id, asset_name, symbol, category,
           condition, trigger_price, target_price, timestamp, sent_to_telegram, label)
           VALUES (@id, @alert_id, @asset_name, @symbol, @category, @condition,
           @trigger_price, @target_price, @timestamp, @sent_to_telegram, @label)`,
        );
        runBatched(sql, insert, snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            alert_id: data.alertId,
            asset_name: data.assetName,
            symbol: data.symbol,
            category: data.category,
            condition: data.condition,
            trigger_price: data.triggerPrice,
            target_price: data.targetPrice,
            timestamp: data.timestamp,
            sent_to_telegram: data.sentToTelegram ? 1 : 0,
            label: data.label,
          };
        }));
        console.log(`[db] hydrated ${snap.size} log(s) from Firestore`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] log hydration failed (will start empty): ${msg}`);
    }
  }
}

/**
 * Wrap a batch of prepared-statement runs in a single BEGIN/COMMIT.
 * node:sqlite has no .transaction() helper, but bulk inserts are ~100x
 * faster (and atomic) when wrapped manually.
 */
function runBatched(
  sql: DatabaseSync,
  stmt: StatementSync,
  rows: SqlParams[],
): void {
  sql.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(r);
    sql.exec('COMMIT');
  } catch (err) {
    sql.exec('ROLLBACK');
    throw err;
  }
}

// ---------- Row shapes + converters ----------

interface AlertRow {
  id: string;
  asset_id: string;
  asset_name: string;
  symbol: string;
  category: string;
  condition: string;
  target_price: number;
  is_active: number;
  label: string;
  chat_id: string;
  created_at: string;
  last_triggered_at: string | null;
}

interface LogRow {
  id: string;
  alert_id: string;
  asset_name: string;
  symbol: string;
  category: string;
  condition: string;
  trigger_price: number;
  target_price: number;
  timestamp: string;
  sent_to_telegram: number;
  label: string;
}

interface PriceRow {
  asset_id: string;
  price: number;
  updated_at: string;
  source: string | null;
  change_24h: number | null;
}

function rowToAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    assetId: r.asset_id,
    assetName: r.asset_name,
    symbol: r.symbol,
    category: r.category,
    condition: r.condition as 'above' | 'below',
    targetPrice: r.target_price,
    isActive: !!r.is_active,
    label: r.label,
    chatId: r.chat_id || '',
    createdAt: r.created_at,
    lastTriggeredAt: r.last_triggered_at || undefined,
  };
}

function rowToLog(r: LogRow): NotificationLog {
  return {
    id: r.id,
    alertId: r.alert_id,
    assetName: r.asset_name,
    symbol: r.symbol,
    category: r.category,
    condition: r.condition as 'above' | 'below',
    triggerPrice: r.trigger_price,
    targetPrice: r.target_price,
    timestamp: r.timestamp,
    sentToTelegram: !!r.sent_to_telegram,
    label: r.label,
  };
}

// ---------- Back-compat shims (preserve existing imports) ----------

/** Old call-sites did `const db = initDb()` — they really wanted `store`. */
export function initDb() {
  getDb();
  return store;
}

/** Old call-sites converted raw rows manually — kept for safety. */
export { rowToAlert as _rowToAlert, rowToLog as _rowToLog };
