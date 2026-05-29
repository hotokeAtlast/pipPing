/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Alert {
  id: string;
  assetId: string;
  assetName: string;
  symbol: string;
  category: 'crypto' | 'forex' | 'gold';
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
  category: 'crypto' | 'forex' | 'gold';
  condition: 'above' | 'below';
  triggerPrice: number;
  targetPrice: number;
  timestamp: string;
  sentToTelegram: boolean;
  label: string;
}

export interface AssetPrice {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  category: 'crypto' | 'forex' | 'gold';
  source: string;
  isSimulated?: boolean;
}
