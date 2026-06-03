/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetPrice } from './types';

/**
 * Order matters: this is the order assets show up in the live ticker grid
 * and the alert-form dropdown.
 *   - 4 forex/gold pairs via Twelve Data (2 WS real-time, 2 REST batch /quote)
 *   - 8 crypto pairs via Binance (free, polled fast)
 */
export const SUPPORTED_ASSETS: AssetPrice[] = [
  // ---- Twelve Data (in user's order) ----
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
    id: 'XAUUSD',
    name: 'Gold Spot',
    symbol: 'XAU/USD',
    price: 0,
    change24h: 0,
    category: 'gold',
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
    id: 'AUDJPY',
    name: 'AUD / JPY',
    symbol: 'AUD/JPY',
    price: 0,
    change24h: 0,
    category: 'forex',
    source: 'Twelve Data',
  },

  // ---- Binance (free, polled fast) ----
  // Internal id is the Binance symbol (BTCUSDT). Display label is BTC/USD.
  {
    id: 'BTCUSDT',
    name: 'Bitcoin',
    symbol: 'BTC/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
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
  {
    id: 'BNBUSDT',
    name: 'BNB',
    symbol: 'BNB/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'XRPUSDT',
    name: 'XRP',
    symbol: 'XRP/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'ADAUSDT',
    name: 'Cardano',
    symbol: 'ADA/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'DOGEUSDT',
    name: 'Dogecoin',
    symbol: 'DOG/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
  {
    id: 'AVAXUSDT',
    name: 'Avalanche',
    symbol: 'AVAX/USD',
    price: 0,
    change24h: 0,
    category: 'crypto',
    source: 'Binance API',
  },
];
