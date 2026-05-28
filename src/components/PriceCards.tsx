/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Live market tickers. Each card is split into two click zones:
 *   - Top half (icon, symbol, name, price): click → prefill the create-alert
 *     form (preserved legacy behavior).
 *   - Bottom half (24h change, source, sparkline): click → open the
 *     full-screen price chart for this asset.
 *
 * The card itself is no longer one big click target — only the two zones
 * are. The card border / background / padding stays non-interactive.
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  Landmark,
  Coins,
  Award,
  BarChart3,
  Gem,
  LineChart,
} from 'lucide-react';
import { AssetPrice, AssetCategory } from '../types';

interface PriceCardsProps {
  prices: AssetPrice[];
  tickHistory: Record<string, number[]>;
  onSelectAsset?: (asset: AssetPrice) => void;
  onOpenChart?: (asset: AssetPrice) => void;
  isRefreshing: boolean;
  onManualRefresh: () => void;
}

export default function PriceCards({
  prices,
  tickHistory,
  onSelectAsset,
  onOpenChart,
  isRefreshing,
  onManualRefresh,
}: PriceCardsProps) {
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {};
    let hasChanges = false;

    prices.forEach((asset) => {
      const prev = prevPrices[asset.id];
      if (prev !== undefined && prev !== asset.price && asset.price !== 0) {
        newFlashes[asset.id] = asset.price > prev ? 'up' : 'down';
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setFlashStates((prev) => ({ ...prev, ...newFlashes }));
      const priceMap: Record<string, number> = {};
      prices.forEach((a) => {
        priceMap[a.id] = a.price;
      });
      setPrevPrices(priceMap);

      const timer = setTimeout(() => {
        setFlashStates({});
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      const priceMap: Record<string, number> = {};
      prices.forEach((a) => {
        priceMap[a.id] = a.price;
      });
      setPrevPrices(priceMap);
    }
  }, [prices]);

  const formatPrice = (price: number, category: AssetCategory) => {
    if (!price || !isFinite(price)) return '—';

    if (category === 'forex') {
      return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 5 });
    }
    if (category === 'crypto') {
      if (price >= 1000) {
        return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const drawSparkline = (historyValues: number[] | undefined, isUp: boolean) => {
    if (!historyValues || historyValues.length < 2) {
      return (
        <svg className="w-16 h-8 opacity-40" viewBox="0 0 100 50">
          <path d="M 0 25 L 100 25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    }
    const min = Math.min(...historyValues);
    const max = Math.max(...historyValues);
    const spread = max - min === 0 ? 1 : max - min;
    const width = 80;
    const height = 30;
    const padding = 2;

    const points = historyValues.map((val, index) => {
      const x = (index / (historyValues.length - 1)) * width;
      const y = height - ((val - min) / spread) * (height - 2 * padding) - padding;
      return `${x},${y}`;
    });

    const colorClass = isUp ? 'text-emerald-500' : 'text-rose-500';

    return (
      <svg className={`w-20 h-10 ${colorClass}`} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.join(' ')}
        />
      </svg>
    );
  };

  const getCategoryIcon = (category: AssetCategory) => {
    switch (category) {
      case 'crypto':
        return <Coins className="w-4 h-4 text-amber-500" />;
      case 'forex':
        return <Landmark className="w-4 h-4 text-sky-500" />;
      case 'gold':
        return <Award className="w-4 h-4 text-yellow-500" />;
      case 'commodity':
        return <Gem className="w-4 h-4 text-slate-400" />;
      case 'index':
        return <BarChart3 className="w-4 h-4 text-violet-500" />;
      default:
        return <Coins className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div id="price-cards-panel" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="price-cards-title" className="text-sm font-semibold tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
            Live Market Tickers
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 hidden sm:block">
            Click the top of a card to load the pair into the form · click the bottom for the chart.
          </p>
        </div>
        <button
          id="btn-refresh-ticker"
          onClick={onManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-all border touch-target shrink-0
            dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100
            bg-white border-zinc-200 text-zinc-600 cursor-pointer disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Updating…' : 'Sync'}
        </button>
      </div>

      <div id="price-cards-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {prices.map((asset) => {
          const changeVal = asset.change24h;
          const isUp = changeVal >= 0;
          const ticks = tickHistory[asset.id] || [];
          const currentFlash = flashStates[asset.id];
          const hasPrice = asset.price > 0 && isFinite(asset.price);

          let cardFlashBorder = 'dark:border-zinc-800 border-zinc-200';
          let bgFlashGlow = '';

          if (currentFlash === 'up') {
            cardFlashBorder = 'border-emerald-500 dark:border-emerald-500';
            bgFlashGlow = 'bg-emerald-500/5 dark:bg-emerald-500/10 scale-[1.01]';
          } else if (currentFlash === 'down') {
            cardFlashBorder = 'border-rose-500 dark:border-rose-500';
            bgFlashGlow = 'bg-rose-500/5 dark:bg-rose-500/10 scale-[1.01]';
          }

          return (
            <div
              id={`ticker-card-${asset.id}`}
              key={asset.id}
              className={`rounded-xl border transition-all duration-300 flex flex-col justify-between
                ${cardFlashBorder} ${bgFlashGlow}
                dark:bg-zinc-900/40 bg-white relative overflow-hidden`}
            >
              {/* Zone A — top: prefill form */}
              <button
                type="button"
                onClick={() => onSelectAsset?.(asset)}
                aria-label={`Use ${asset.symbol} in the create-alert form`}
                className="text-left p-4 pb-3 cursor-pointer transition-colors w-full
                  hover:bg-emerald-500/5 dark:hover:bg-emerald-500/5
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <div className="absolute top-3.5 right-3.5 opacity-90 pointer-events-none">
                  {getCategoryIcon(asset.category)}
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium tracking-wide text-zinc-400 dark:text-zinc-500 uppercase">
                  {asset.symbol}
                </span>

                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-1 truncate">
                  {asset.name}
                </h3>

                <div className="flex items-baseline gap-2 mt-2">
                  <span
                    className={`text-xl font-bold tracking-tight font-mono transition-colors duration-150 ${
                      currentFlash === 'up'
                        ? 'text-emerald-500'
                        : currentFlash === 'down'
                          ? 'text-rose-500'
                          : hasPrice
                            ? 'text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-400 dark:text-zinc-600'
                    }`}
                  >
                    {formatPrice(asset.price, asset.category)}
                  </span>
                  {hasPrice && <span className="text-[10px] text-zinc-400 font-mono">USD</span>}
                </div>
              </button>

              {/* Zone B — bottom: open chart */}
              <button
                type="button"
                onClick={() => onOpenChart?.(asset)}
                aria-label={`Open ${asset.symbol} price chart`}
                title="Open chart"
                className="group flex items-center justify-between gap-2 px-4 py-3 border-t cursor-pointer transition-colors w-full text-left touch-target
                  border-zinc-100 dark:border-zinc-800/80
                  hover:bg-sky-500/5 dark:hover:bg-sky-500/5
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
              >
                <div className="flex flex-col">
                  <span
                    className={`inline-flex items-center text-xs font-semibold ${
                      hasChange(changeVal) ? (isUp ? 'text-emerald-500' : 'text-rose-500') : 'text-zinc-400'
                    }`}
                  >
                    {hasChange(changeVal) ? (
                      isUp ? (
                        <TrendingUp className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                      )
                    ) : null}
                    {hasChange(changeVal) ? `${isUp ? '+' : ''}${changeVal.toFixed(2)}%` : '—'}
                  </span>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                    {hasPrice ? asset.source : 'awaiting first poll'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="opacity-85">{drawSparkline(ticks, isUp)}</div>
                  <LineChart
                    className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-sky-500 transition-colors"
                    aria-hidden
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hasChange(c: number): boolean {
  return typeof c === 'number' && isFinite(c) && c !== 0;
}
