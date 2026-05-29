/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCcw, Landmark, Coins, Award } from 'lucide-react';
import { AssetPrice } from '../types';

interface PriceCardsProps {
  prices: AssetPrice[];
  tickHistory: Record<string, number[]>;
  onSelectAsset?: (asset: AssetPrice) => void;
  isRefreshing: boolean;
  onManualRefresh: () => void;
}

export default function PriceCards({
  prices,
  tickHistory,
  onSelectAsset,
  isRefreshing,
  onManualRefresh
}: PriceCardsProps) {
  // Store the last prices to detect whether each asset went up or down during the last tick
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {};
    let hasChanges = false;

    prices.forEach((asset) => {
      const prev = prevPrices[asset.id];
      if (prev !== undefined && prev !== asset.price) {
        newFlashes[asset.id] = asset.price > prev ? 'up' : 'down';
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setFlashStates((prev) => ({ ...prev, ...newFlashes }));
      // Save current prices as previous for next tick
      const priceMap: Record<string, number> = {};
      prices.forEach((a) => {
        priceMap[a.id] = a.price;
      });
      setPrevPrices(priceMap);

      // Clear flash after 1 second
      const timer = setTimeout(() => {
        setFlashStates({});
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Initialize prevPrices
      const priceMap: Record<string, number> = {};
      prices.forEach((a) => {
        priceMap[a.id] = a.price;
      });
      setPrevPrices(priceMap);
    }
  }, [prices]);

  // Helper to format prices beautifully based on asset class
  const formatPrice = (price: number, category: string) => {
    if (category === 'crypto') {
      if (price > 1000) {
        return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else if (category === 'forex') {
      return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 5 });
    }
    // Gold spot
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to draw a tiny beautiful sparkline
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
      // invert Y since 0 is top
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'crypto':
        return <Coins className="w-4 h-4 text-amber-500" />;
      case 'forex':
        return <Landmark className="w-4 h-4 text-sky-500" />;
      case 'gold':
        return <Award className="w-4 h-4 text-yellow-500" />;
      default:
        return <Coins className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div id="price-cards-panel" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="price-cards-title" className="text-sm font-semibold tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
            Live Market Tickers
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Click card to load asset parameters immediately into the creation form.
          </p>
        </div>
        <button
          id="btn-refresh-ticker"
          onClick={onManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border
            dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100
            bg-white border-zinc-200 text-zinc-600 cursor-pointer disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Updating...' : 'Sync Tickers'}
        </button>
      </div>

      <div id="price-cards-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {prices.map((asset) => {
          const changeVal = asset.change24h;
          const isUp = changeVal >= 0;
          const ticks = tickHistory[asset.id] || [];
          const currentFlash = flashStates[asset.id];

          // Determine aesthetic border styling during a real-time tick alert pulse
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
              onClick={() => onSelectAsset?.(asset)}
              className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:shadow-lg
                ${cardFlashBorder} ${bgFlashGlow}
                dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80
                bg-white hover:bg-zinc-50/50 relative overflow-hidden`}
            >
              {/* Corner Asset Category Icon */}
              <div className="absolute top-3.5 right-3.5 opacity-90">
                {getCategoryIcon(asset.category)}
              </div>

              <div>
                {/* Symbol & Source indicator */}
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium tracking-wide text-zinc-400 dark:text-zinc-500 uppercase">
                  {asset.symbol}
                </span>

                {/* Main Asset name and Price display */}
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-1 truncate">
                  {asset.name}
                </h3>

                <div className="flex items-baseline gap-2 mt-2">
                  <span className={`text-xl font-bold tracking-tight font-mono transition-colors duration-150
                    ${currentFlash === 'up' ? 'text-emerald-500' : currentFlash === 'down' ? 'text-rose-500' : 'text-zinc-900 dark:text-zinc-100'}`}
                  >
                    {formatPrice(asset.price, asset.category)}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">USD</span>
                </div>
              </div>

              {/* Sparkline & Percentage Trend details */}
              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <div className="flex flex-col">
                  <span className={`inline-flex items-center text-xs font-semibold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isUp ? (
                      <TrendingUp className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                    )}
                    {isUp ? '+' : ''}
                    {changeVal.toFixed(2)}%
                  </span>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                    {asset.isSimulated ? 'Realtime ticks' : asset.source}
                  </span>
                </div>

                <div className="opacity-85">
                  {drawSparkline(ticks, isUp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
