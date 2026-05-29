/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AssetCategory = 'crypto' | 'forex' | 'gold' | 'commodity' | 'index';

export interface Alert {
  id: string;
  assetId: string;
  assetName: string;
  symbol: string;
  category: AssetCategory;
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
  category: AssetCategory;
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
  category: AssetCategory;
  source: string;
  isSimulated?: boolean;
}
