/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetPrice } from './types';

/**
 * Order matters: this is the order assets show up in the live ticker grid
 * and the alert-form dropdown. The first 9 are the user's prioritised set.
 */
export const SUPPORTED_ASSETS: AssetPrice[] = [
  // ---- Top 9 (priority ticker order) ----
  {
    id: 'XAUUSD',
    name: 'Gold Spot',
    symbol: 'XAU/USD',
    price: 0,
    change24h: 0,
    category: 'gold',
    source: 'Twelve Data',
  },
  {
    id: 'US30',
    name: 'Dow Jones 30',
    symbol: 'US30',
    price: 0,
    change24h: 0,
    category: 'index',
    source: 'Twelve Data',
  },
  {
    id: 'XAGUSD',
    name: 'Silver Spot',
    symbol: 'XAG/USD',
    price: 0,
    change24h: 0,
    category: 'commodity',
    source: 'Twelve Data',
  },
  {
    id: 'EURUSD',
    name: 'EUR / USD',
    symbol: 'EUR/USD',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },
  {
    id: 'USDJPY',
    name: 'USD / JPY',
    symbol: 'USD/JPY',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },
  {
    id: 'GBPCAD',
    name: 'GBP / CAD',
    symbol: 'GBP/CAD',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },
  {
    id: 'AUDUSD',
    name: 'AUD / USD',
    symbol: 'AUD/USD',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },
  {
    // Internally we still query Binance BTCUSDT (Tether-pegged ~= USD).
    // Display label is BTC/USD as requested.
    id: 'BTCUSDT',
    name: 'Bitcoin',
    symbol: 'BTC/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'DXY',
    name: 'Dollar Index',
    symbol: 'DXY',
    price: 0,
    change24h: 0,
    category: 'index',
    source: 'Twelve Data',
  },

  // ---- Extras (still selectable in the alert form dropdown) ----
  {
    id: 'GBPUSD',
    name: 'GBP / USD',
    symbol: 'GBP/USD',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },
  {
    id: 'ETHUSDT',
    name: 'Ethereum',
    symbol: 'ETH/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'SOLUSDT',
    name: 'Solana',
    symbol: 'SOL/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
];
