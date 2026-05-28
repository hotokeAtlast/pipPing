/**
 * Firestore-backed data layer for pipPing.
 *
 * Schema:
 *   alerts/{alertId}            - shared alert list
 *   logs/{logId}                - shared notification history
 *   prices/{assetId}            - global last-known price cache
 *   users/{uid}                 - user profile (email, last sign-in)
 *
 * The price cache is keyed by assetId and shared across all users, since
 * it's the same market data for everyone. Alerts and logs are also shared
 * (any signed-in user can view/edit all of them per the chosen design).
 */

import { db } from './firebase.js';

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

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const store = {
  // ---------- Alerts ----------

  async listAlerts(): Promise<Alert[]> {
    const snap = await db.collection('alerts').orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => docToAlert(d.id, d.data()));
  },

  async getAlert(id: string): Promise<Alert | null> {
    const doc = await db.collection('alerts').doc(id).get();
    if (!doc.exists) return null;
    return docToAlert(doc.id, doc.data()!);
  },

  async createAlert(input: AlertInput): Promise<Alert> {
    const id = newId('alert');
    const data = {
      assetId: input.assetId,
      assetName: input.assetName,
      symbol: input.symbol,
      category: input.category,
      condition: input.condition,
      targetPrice: input.targetPrice,
      isActive: true,
      label: input.label,
      chatId: input.chatId || '',
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
    };
    await db.collection('alerts').doc(id).set(data);
    return docToAlert(id, data);
  },

  async updateAlert(id: string, patch: AlertPatch): Promise<Alert | null> {
    const ref = db.collection('alerts').doc(id);
    const update: Record<string, unknown> = {};
    if (patch.isActive !== undefined) update.isActive = !!patch.isActive;
    if (patch.targetPrice !== undefined) update.targetPrice = patch.targetPrice;
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.condition !== undefined) update.condition = patch.condition;
    if (patch.chatId !== undefined) update.chatId = patch.chatId;
    if (Object.keys(update).length === 0) {
      const doc = await ref.get();
      return doc.exists ? docToAlert(doc.id, doc.data()!) : null;
    }
    await ref.update(update);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return docToAlert(doc.id, doc.data()!);
  },

  async deleteAlert(id: string): Promise<void> {
    await db.collection('alerts').doc(id).delete();
  },

  async listActiveAlertsForAsset(assetId: string): Promise<Alert[]> {
    const snap = await db
      .collection('alerts')
      .where('assetId', '==', assetId)
      .where('isActive', '==', true)
      .get();
    return snap.docs.map((d) => docToAlert(d.id, d.data()));
  },

  async deactivateAlert(id: string, lastTriggeredAt: string): Promise<void> {
    await db.collection('alerts').doc(id).update({
      isActive: false,
      lastTriggeredAt,
    });
  },

  // ---------- Logs ----------

  async listLogs(limit = 200): Promise<NotificationLog[]> {
    const snap = await db
      .collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => docToLog(d.id, d.data()));
  },

  async createLog(input: LogInput): Promise<NotificationLog> {
    const id = newId('log');
    const data = {
      alertId: input.alertId,
      assetName: input.assetName,
      symbol: input.symbol,
      category: input.category,
      condition: input.condition,
      triggerPrice: input.triggerPrice,
      targetPrice: input.targetPrice,
      timestamp: input.timestamp,
      sentToTelegram: input.sentToTelegram,
      label: input.label,
    };
    await db.collection('logs').doc(id).set(data);
    return docToLog(id, data);
  },

  async clearLogs(): Promise<void> {
    const snap = await db.collection('logs').get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },

  // ---------- Price cache ----------

  async listPrices(): Promise<CachedPrice[]> {
    const snap = await db.collection('prices').get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        assetId: d.id,
        price: data.price as number,
        updatedAt: data.updatedAt as string,
        source: (data.source as string) || '',
        change24h: typeof data.change24h === 'number' ? (data.change24h as number) : undefined,
      };
    });
  },

  async getPrice(assetId: string): Promise<{ price: number } | null> {
    const doc = await db.collection('prices').doc(assetId).get();
    if (!doc.exists) return null;
    const price = doc.data()!.price as number;
    return { price };
  },

  async upsertPrice(
    assetId: string,
    price: number,
    source: string,
    change24h?: number,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      price,
      updatedAt: new Date().toISOString(),
      source,
    };
    // Only overwrite change24h if a fresh value was supplied.
    if (change24h !== undefined && isFinite(change24h)) {
      update.change24h = change24h;
    }
    await db.collection('prices').doc(assetId).set(update, { merge: true });
  },

  // ---------- Users (profile bookkeeping) ----------

  async touchUser(uid: string, email: string | undefined): Promise<void> {
    const ref = db.collection('users').doc(uid);
    const update: Record<string, unknown> = { lastSignIn: new Date().toISOString() };
    if (email) update.email = email;
    await ref.set(update, { merge: true });
  },
};

function docToAlert(id: string, data: FirebaseFirestore.DocumentData): Alert {
  return {
    id,
    assetId: data.assetId,
    assetName: data.assetName,
    symbol: data.symbol,
    category: data.category,
    condition: data.condition,
    targetPrice: data.targetPrice,
    isActive: !!data.isActive,
    label: data.label,
    chatId: data.chatId || '',
    createdAt: data.createdAt,
    lastTriggeredAt: data.lastTriggeredAt || undefined,
  };
}

function docToLog(id: string, data: FirebaseFirestore.DocumentData): NotificationLog {
  return {
    id,
    alertId: data.alertId,
    assetName: data.assetName,
    symbol: data.symbol,
    category: data.category,
    condition: data.condition,
    triggerPrice: data.triggerPrice,
    targetPrice: data.targetPrice,
    timestamp: data.timestamp,
    sentToTelegram: !!data.sentToTelegram,
    label: data.label,
  };
}

/**
 * Backwards-compatible shim. The old SQLite export was a function that
 * returned a `db` handle. New code should import `store` from this file
 * directly; this export exists only so older import lines don't fail.
 */
export function initDb() {
  return store;
}

/**
 * Backwards-compatible helpers. Old code imported `rowToAlert` / `rowToLog`
 * to convert SQLite rows; new Firestore data goes through `docToAlert` /
 * `docToLog` internally. Re-exported here for any leftover callers.
 */
export function rowToAlert(r: any) {
  if (!r) return null;
  return r as Alert;
}
export function rowToLog(r: any) {
  if (!r) return null;
  return r as NotificationLog;
}
