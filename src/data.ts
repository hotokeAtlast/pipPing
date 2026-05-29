/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetPrice } from './types';

export const SUPPORTED_ASSETS: AssetPrice[] = [
  {
    id: 'BTCUSDT',
    name: 'Bitcoin',
    symbol: 'BTC/USDT',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'ETHUSDT',
    name: 'Ethereum',
    symbol: 'ETH/USDT',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'SOLUSDT',
    name: 'Solana',
    symbol: 'SOL/USDT',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
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
    id: 'GBPUSD',
    name: 'GBP / USD',
    symbol: 'GBP/USD',
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
    id: 'XAUUSD',
    name: 'Gold Spot',
    symbol: 'XAU/USD',
    price: 0,
    change24h: 0,
    category: 'gold',
    source: 'Twelve Data',
  },
];
