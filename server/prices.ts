/**
 * Price fetchers.
 *  - Crypto: Binance public ticker (no key, effectively unlimited).
 *  - Forex/gold: Twelve Data batched call (free tier 800/day, 8/min).
 */

export type Quote = { assetId: string; price: number; source: string };

// Internal asset id -> Binance symbol
const BINANCE_MAP: Record<string, string> = {
  BTCUSDT: 'BTCUSDT',
  ETHUSDT: 'ETHUSDT',
  SOLUSDT: 'SOLUSDT',
};

// Internal asset id -> Twelve Data "BASE/QUOTE" symbol
const TD_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  XAUUSD: 'XAU/USD',
};

export async function fetchCryptoPrices(assetIds: string[]): Promise<Quote[]> {
  const targets = assetIds.filter((id) => BINANCE_MAP[id]);
  if (!targets.length) return [];

  const out: Quote[] = [];
  await Promise.all(
    targets.map(async (id) => {
      const sym = BINANCE_MAP[id];
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
        if (!res.ok) {
          console.warn(`[prices] Binance ${sym} status=${res.status}`);
          return;
        }
        const data = (await res.json()) as { price?: string };
        if (!data.price) return;
        out.push({ assetId: id, price: parseFloat(data.price), source: 'Binance' });
      } catch (err) {
        console.warn(`[prices] Binance ${sym} error`, err);
      }
    }),
  );
  return out;
}

export async function fetchForexPrices(
  assetIds: string[],
  apiKey: string | undefined,
): Promise<Quote[]> {
  if (!apiKey) {
    if (assetIds.some((id) => TD_MAP[id])) {
      console.warn('[prices] TWELVE_DATA_API_KEY not set, forex/gold prices will be skipped');
    }
    return [];
  }

  const symbolPairs = assetIds
    .map((id) => ({ id, sym: TD_MAP[id] }))
    .filter((x): x is { id: string; sym: string } => Boolean(x.sym));
  if (!symbolPairs.length) return [];

  const symbolsCsv = symbolPairs.map((p) => p.sym).join(',');
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbolsCsv)}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[prices] TwelveData status=${res.status}`);
      return [];
    }
    const data: any = await res.json();

    // Single symbol response shape: { price: "1.0842" }
    // Multi-symbol response shape: { "EUR/USD": { price: "1.0842" }, ... }
    const out: Quote[] = [];
    if (symbolPairs.length === 1 && typeof data?.price === 'string') {
      out.push({ assetId: symbolPairs[0].id, price: parseFloat(data.price), source: 'TwelveData' });
    } else {
      for (const { id, sym } of symbolPairs) {
        const entry = data?.[sym];
        if (entry && typeof entry.price === 'string') {
          out.push({ assetId: id, price: parseFloat(entry.price), source: 'TwelveData' });
        } else if (entry && entry.code) {
          console.warn(`[prices] TwelveData ${sym} error: ${entry.message || entry.code}`);
        }
      }
    }
    return out;
  } catch (err) {
    console.warn('[prices] TwelveData fetch error', err);
    return [];
  }
}

export const SUPPORTED_ASSET_IDS = Object.freeze([
  ...Object.keys(BINANCE_MAP),
  ...Object.keys(TD_MAP),
]);

export function categoryFor(assetId: string): 'crypto' | 'forex' | 'gold' | null {
  if (BINANCE_MAP[assetId]) return 'crypto';
  if (assetId === 'XAUUSD') return 'gold';
  if (TD_MAP[assetId]) return 'forex';
  return null;
}
