/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tiny fetch wrapper around the pipPing backend.
 */

import { Alert, NotificationLog, AssetCategory } from './types';

export interface CachedPrice {
  assetId: string;
  price: number;
  updatedAt: string;
  source: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listAlerts(): Promise<Alert[]> {
    return jsonOrThrow(await fetch('/api/alerts'));
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
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async updateAlert(id: string, patch: Partial<Alert>): Promise<Alert> {
    return jsonOrThrow(
      await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    );
  },

  async deleteAlert(id: string): Promise<void> {
    await jsonOrThrow(
      await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    );
  },

  async testAlert(id: string): Promise<{ ok: boolean; sent: boolean; triggerPrice: number }> {
    return jsonOrThrow(
      await fetch(`/api/alerts/${encodeURIComponent(id)}/test`, { method: 'POST' }),
    );
  },

  async listLogs(): Promise<NotificationLog[]> {
    return jsonOrThrow(await fetch('/api/logs'));
  },

  async clearLogs(): Promise<void> {
    await jsonOrThrow(await fetch('/api/logs', { method: 'DELETE' }));
  },

  async listPrices(): Promise<CachedPrice[]> {
    return jsonOrThrow(await fetch('/api/prices'));
  },

  async health(): Promise<{
    ok: boolean;
    hasTelegramToken: boolean;
    hasDefaultChatId: boolean;
    hasTwelveDataKey: boolean;
    pollIntervalCryptoMs: number;
    pollIntervalTdMs: number;
    pollIntervalMs: number;
  }> {
    return jsonOrThrow(await fetch('/api/health'));
  },
};
