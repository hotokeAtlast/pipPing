/**
 * Price fetchers.
 *  - Crypto:       Binance /ticker/24hr (spot price + 24h change in one call, no key).
 *  - Forex / gold: Twelve Data /quote (close + percent_change in one credit/call).
 *
 * Twelve Data free-tier note: 800 credits/day, 8 calls/min. We use 1 credit
 * per /quote call. For 4 fx/gold symbols at 5-min fallback = ~1,152 credits/day
 * (over budget). Mitigation: the WebSocket covers most symbols on the free
 * plan, so /quote only runs for the WS-gated ones. To stay safe, we also fall
 * back to /price (no change%) if the call fails or the user is on a tight
 * plan.
 */

export type Quote = {
  assetId: string;
  price: number;
  source: string;
  change24h?: number;
};

// Normalized OHLCV candle shape used by the chart history endpoint.
export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// Internal asset id -> Binance symbol
const BINANCE_MAP: Record<string, string> = {
  BTCUSDT: 'BTCUSDT',
  ETHUSDT: 'ETHUSDT',
  SOLUSDT: 'SOLUSDT',
  BNBUSDT: 'BNBUSDT',
  XRPUSDT: 'XRPUSDT',
  ADAUSDT: 'ADAUSDT',
  DOGEUSDT: 'DOGEUSDT',
  AVAXUSDT: 'AVAXUSDT',
};

// Internal asset id -> Twelve Data symbol (BASE/QUOTE format).
// Exported so the WebSocket client can reuse the mapping.
export const TD_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD',
  USDJPY: 'USD/JPY',
  AUDJPY: 'AUD/JPY',
  XAUUSD: 'XAU/USD',
};

// Reverse lookup: TD symbol -> internal asset id (for WebSocket ticks).
export const TD_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TD_MAP).map(([k, v]) => [v, k]),
);

// ---- Interval mapping ----
// Single source of truth for the chart's interval switcher.
// Keys = the user-facing label. Values = provider-specific interval codes.
export const INTERVALS = [
  { key: '1m', label: '1m', binance: '1m', twelvedata: '1min' },
  { key: '5m', label: '5m', binance: '5m', twelvedata: '5min' },
  { key: '15m', label: '15m', binance: '15m', twelvedata: '15min' },
  { key: '1h', label: '1h', binance: '1h', twelvedata: '1h' },
  { key: '4h', label: '4h', binance: '4h', twelvedata: '4h' },
  { key: '1d', label: '1D', binance: '1d', twelvedata: '1day' },
] as const;

export type IntervalKey = (typeof INTERVALS)[number]['key'];

export function categoryFor(assetId: string): 'crypto' | 'forex' | 'gold' | null {
  if (BINANCE_MAP[assetId]) return 'crypto';
  if (assetId === 'XAUUSD') return 'gold';
  if (TD_MAP[assetId]) return 'forex';
  return null;
}

export async function fetchCryptoPrices(assetIds: string[]): Promise<Quote[]> {
  const targets = assetIds.filter((id) => BINANCE_MAP[id]);
  if (!targets.length) return [];

  // /ticker/24hr returns price + 24h change in one shot (no key, free).
  const out: Quote[] = [];
  await Promise.all(
    targets.map(async (id) => {
      const sym = BINANCE_MAP[id];
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
        if (!res.ok) {
          console.warn(`[prices] Binance ${sym} status=${res.status}`);
          return;
        }
        const data = (await res.json()) as {
          lastPrice?: string;
          priceChangePercent?: string;
        };
        if (!data.lastPrice) return;
        const price = parseFloat(data.lastPrice);
        if (!isFinite(price)) return;
        out.push({
          assetId: id,
          price,
          source: 'Binance',
          change24h:
            data.priceChangePercent !== undefined
              ? parseFloat(data.priceChangePercent)
              : undefined,
        });
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
      console.warn(
        '[prices] TWELVE_DATA_API_KEY not set, forex/commodity/index prices will be skipped',
      );
    }
    return [];
  }

  const symbolPairs = assetIds
    .map((id) => ({ id, sym: TD_MAP[id] }))
    .filter((x): x is { id: string; sym: string } => Boolean(x.sym));
  if (!symbolPairs.length) return [];

  const symbolsCsv = symbolPairs.map((p) => p.sym).join(',');
  // /quote returns close + percent_change in one call (same credit cost as /price).
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolsCsv)}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[prices] TwelveData status=${res.status}`);
      return [];
    }
    const data: any = await res.json();

    // Single symbol response: { close, percent_change, ... }
    // Multi-symbol response: { "EUR/USD": { close, percent_change, ... }, ... }
    const out: Quote[] = [];
    if (symbolPairs.length === 1 && (data?.close || data?.price)) {
      const price = parseFloat(data.close ?? data.price);
      if (isFinite(price)) {
        out.push({
          assetId: symbolPairs[0].id,
          price,
          source: 'TwelveData',
          change24h:
            data.percent_change !== undefined ? parseFloat(data.percent_change) : undefined,
        });
      }
    } else {
      for (const { id, sym } of symbolPairs) {
        const entry = data?.[sym];
        if (entry && (entry.close || entry.price)) {
          const price = parseFloat(entry.close ?? entry.price);
          if (!isFinite(price)) continue;
          out.push({
            assetId: id,
            price,
            source: 'TwelveData',
            change24h:
              entry.percent_change !== undefined
                ? parseFloat(entry.percent_change)
                : undefined,
          });
        } else if (entry && (entry.code || entry.status === 'error')) {
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

/**
 * Fetch OHLC candles for the chart.
 * - Crypto: Binance /klines (no key).
 * - Forex / gold: Twelve Data /time_series (uses server's key).
 * Returns ascending (oldest first), which is what lightweight-charts wants.
 */
export async function fetchHistory(
  assetId: string,
  interval: IntervalKey,
  outputsize: number,
): Promise<Candle[]> {
  const binanceSym = BINANCE_MAP[assetId];
  const tdSym = TD_MAP[assetId];
  const def = INTERVALS.find((i) => i.key === interval);
  if (!def) return [];

  try {
    if (binanceSym) {
      const url =
        `https://api.binance.com/api/v3/klines?symbol=${binanceSym}` +
        `&interval=${def.binance}&limit=${outputsize}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[history] Binance ${binanceSym} status=${res.status}`);
        return [];
      }
      const rows = (await res.json()) as Array<
        [number, string, string, string, string, ...unknown[]]
      >;
      return rows.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
      }));
    }

    if (tdSym) {
      const apiKey = process.env.TWELVE_DATA_API_KEY;
      if (!apiKey) {
        console.warn('[history] TWELVE_DATA_API_KEY not set, skipping TD history');
        return [];
      }
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}` +
        `&interval=${def.twelvedata}&outputsize=${outputsize}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[history] TwelveData ${tdSym} status=${res.status}`);
        return [];
      }
      const data: any = await res.json();
      if (data?.code || data?.status === 'error') {
        console.warn(`[history] TwelveData ${tdSym} error: ${data.message || data.code}`);
        return [];
      }
      const rows: any[] = data?.values || [];
      // TD returns newest-first; flip to ascending for lightweight-charts.
      return rows
        .map((r) => ({
          time: Math.floor(new Date(r.datetime).getTime() / 1000),
          open: parseFloat(r.open),
          high: parseFloat(r.high),
          low: parseFloat(r.low),
          close: parseFloat(r.close),
        }))
        .filter(
          (c) =>
            isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close) && c.time > 0,
        )
        .sort((a, b) => a.time - b.time);
    }

    return [];
  } catch (err) {
    console.warn(`[history] fetchHistory ${assetId} error`, err);
    return [];
  }
}

export const SUPPORTED_ASSET_IDS = Object.freeze([
  ...Object.keys(BINANCE_MAP),
  ...Object.keys(TD_MAP),
]);
