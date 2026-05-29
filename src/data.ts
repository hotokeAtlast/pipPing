/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetPrice, Alert, NotificationLog } from './types';

export const SUPPORTED_ASSETS: AssetPrice[] = [
  {
    id: 'BTCUSDT',
    name: 'Bitcoin',
    symbol: 'BTC/USDT',
    price: 68420.50,
    change24h: 3.42,
    category: 'crypto',
    source: 'Binance API'
  },
  {
    id: 'ETHUSDT',
    name: 'Ethereum',
    symbol: 'ETH/USDT',
    price: 3415.75,
    change24h: -1.24,
    category: 'crypto',
    source: 'Binance API'
  },
  {
    id: 'SOLUSDT',
    name: 'Solana',
    symbol: 'SOL/USDT',
    price: 165.40,
    change24h: 7.89,
    category: 'crypto',
    source: 'Binance API'
  },
  {
    id: 'EURUSD',
    name: 'EUR / USD',
    symbol: 'EUR/USD',
    price: 1.0842,
    change24h: 0.15,
    category: 'forex',
    source: 'Twelve Data'
  },
  {
    id: 'GBPUSD',
    name: 'GBP / USD',
    symbol: 'GBP/USD',
    price: 1.2655,
    change24h: -0.08,
    category: 'forex',
    source: 'Twelve Data'
  },
  {
    id: 'USDJPY',
    name: 'USD / JPY',
    symbol: 'USD/JPY',
    price: 156.78,
    change24h: 0.45,
    category: 'forex',
    source: 'Twelve Data'
  },
  {
    id: 'XAUUSD',
    name: 'Gold Spot',
    symbol: 'XAU/USD',
    price: 2342.80,
    change24h: 1.12,
    category: 'gold',
    source: 'Twelve Data'
  }
];

export const INITIAL_ALERTS: Alert[] = [
  {
    id: 'alert-1',
    assetId: 'BTCUSDT',
    assetName: 'Bitcoin',
    symbol: 'BTC/USDT',
    category: 'crypto',
    condition: 'above',
    targetPrice: 70000.00,
    isActive: true,
    label: 'Sell Target BTC',
    chatId: '@pip_alerts_group',
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-2',
    assetId: 'EURUSD',
    assetName: 'EUR / USD',
    symbol: 'EUR/USD',
    category: 'forex',
    condition: 'below',
    targetPrice: 1.0800,
    isActive: true,
    label: 'EUR Buying Opportunity',
    chatId: '542981358',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-3',
    assetId: 'XAUUSD',
    assetName: 'Gold Spot',
    symbol: 'XAU/USD',
    category: 'gold',
    condition: 'above',
    targetPrice: 2350.00,
    isActive: false,
    label: 'Gold resistance level alert',
    chatId: '542981358',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  }
];

export const INITIAL_LOGS: NotificationLog[] = [
  {
    id: 'log-1',
    alertId: 'alert-1',
    assetName: 'Bitcoin',
    symbol: 'BTC/USDT',
    category: 'crypto',
    condition: 'above',
    triggerPrice: 70054.20,
    targetPrice: 70000.00,
    timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    sentToTelegram: true,
    label: 'Sell Target BTC'
  },
  {
    id: 'log-2',
    alertId: 'alert-3',
    assetName: 'Gold Spot',
    symbol: 'XAU/USD',
    category: 'gold',
    condition: 'above',
    triggerPrice: 2351.40,
    targetPrice: 2350.00,
    timestamp: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    sentToTelegram: true,
    label: 'Gold resistance level alert'
  }
];

export const CLOUDFLARE_WORKER_CODE = `/**
 * pipPing - Cloudflare Cron Worker
 * Runs every 60 seconds (*/1 * * * *)
 * Fetches prices from Binance and Twelve Data and checks alert thresholds.
 * Sends push alerts to Telegram.
 */

export default {
  async scheduled(event, env, ctx) {
    // 1. Fetch live prices from APIs (Binance for Crypto, Twelve Data for Forex/Gold)
    const cryptoPrice = await fetchCryptoPrice('BTCUSDT');
    const eurUsdPrice = await fetchForexPrice('EUR/USD', env.TWELVE_DATA_API_KEY);
    const goldPrice = await fetchForexPrice('XAU/USD', env.TWELVE_DATA_API_KEY);

    // 2. Load alerts from your store (Cloudflare KV, D1 Database, or hardcoded)
    const alerts = await getAlertsFromStore(env);

    const priceMap = {
      'BTCUSDT': cryptoPrice,
      'EURUSD': eurUsdPrice,
      'XAUUSD': goldPrice
    };

    // 3. Process alert checks
    for (const alert of alerts) {
      if (!alert.isActive) continue;

      const currentPrice = priceMap[alert.assetId];
      if (!currentPrice) continue;

      let triggered = false;
      if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
        triggered = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
        triggered = true;
      }

      if (triggered) {
        // 4. Dispatch Telegram Notification
        const message = \`🚨 **pipPing ALERT** 🚨\\n\\n🏷️ **Label**: \${alert.label}\\n📈 **Asset**: \${alert.symbol}\\n🔄 **Condition**: Went \${alert.condition} \${alert.targetPrice}\\n💵 **Current Price**: \${currentPrice}\\n🕒 **Trigger Time**: \${new Date().toISOString()}\`;
        
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, alert.chatId, message);
        
        // 5. Update alert in DB (e.g. set to inactive to avoid spamming, or log trigger time)
        await deactivateOrLogAlert(env, alert.id);
      }
    }
  }
};

// Helper fetchers
async function fetchCryptoPrice(symbol) {
  try {
    const res = await fetch(\`https://api.binance.com/api/v3/ticker/price?symbol=\${symbol}\`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch (err) {
    console.error("Crypto fetch error: ", err);
    return null;
  }
}

async function fetchForexPrice(symbol, apiKey) {
  try {
    const res = await fetch(\`https://api.twelvedata.com/price?symbol=\${symbol}&apikey=\${apiKey}\`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch (err) {
    console.error("Forex fetch error for " + symbol, err);
    return null;
  }
}

async function sendTelegramMessage(botToken, chatId, text) {
  const url = \`https://api.telegram.org/bot\${botToken}/sendMessage\`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
}
`;
