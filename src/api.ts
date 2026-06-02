/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tiny fetch wrapper around the pipPing backend.
 * Automatically attaches the user's Firebase ID token to every request.
 *
 * If the server returns 403 (the account isn't the allowed owner), we
 * sign the user out so they land on the AuthGate with a clear message.
 */

import { Alert, NotificationLog, AssetCategory } from './types';
import { getValidIdToken, signOut } from './firebase';

export interface CachedPrice {
  assetId: string;
  price: number;
  updatedAt: string;
  source: string;
  change24h?: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type IntervalKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidIdToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The server rejected this account — kick them back to the sign-in
    // screen so they see the proper error.
    if (res.status === 403) {
      signOut().catch(() => {});
    }
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listAlerts(): Promise<Alert[]> {
    return jsonOrThrow(await authedFetch('/api/alerts'));
  },

  async createAlert(input: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: AssetCategory;
    condition: 'above' | 'below';
    targetPrice: number;
    label: string;
    chatId?: string;
  }): Promise<Alert> {
    return jsonOrThrow(
      await authedFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async updateAlert(id: string, patch: Partial<Alert>): Promise<Alert> {
    return jsonOrThrow(
      await authedFetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    );
  },

  async deleteAlert(id: string): Promise<void> {
    await jsonOrThrow(
      await authedFetch(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    );
  },

  async testAlert(id: string): Promise<{ ok: boolean; sent: boolean; triggerPrice: number }> {
    return jsonOrThrow(
      await authedFetch(`/api/alerts/${encodeURIComponent(id)}/test`, { method: 'POST' }),
    );
  },

  async listLogs(): Promise<NotificationLog[]> {
    return jsonOrThrow(await authedFetch('/api/logs'));
  },

  async clearLogs(): Promise<void> {
    await jsonOrThrow(await authedFetch('/api/logs', { method: 'DELETE' }));
  },

  async listPrices(): Promise<CachedPrice[]> {
    return jsonOrThrow(await authedFetch('/api/prices'));
  },

  async getHistory(assetId: string, interval: IntervalKey, outputsize = 200): Promise<Candle[]> {
    const qs = `interval=${encodeURIComponent(interval)}&outputsize=${outputsize}`;
    const data = await jsonOrThrow<{ assetId: string; interval: string; candles: Candle[] }>(
      await authedFetch(`/api/history/${encodeURIComponent(assetId)}?${qs}`),
    );
    return data.candles;
  },

  async health(): Promise<{
    ok: boolean;
    hasTelegramToken: boolean;
    hasDefaultChatId: boolean;
    hasTwelveDataKey: boolean;
    pollIntervalCryptoMs: number;
    tdMode: 'websocket' | 'polling' | 'hybrid';
    tdWsConnected: boolean;
    tdWsLiveSymbols: string[];
    tdPolledSymbols: string[];
    tdFallbackMs: number;
  }> {
    return jsonOrThrow(await fetch('/api/health'));
  },
};
