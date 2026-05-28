/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Simplified alert form — no above/below toggle.
 * The backend detects which side the price crossed from automatically.
 */

import { useState, useEffect, FormEvent } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { AssetPrice, AssetCategory } from '../types';

interface AlertFormProps {
  prices: AssetPrice[];
  selectedAssetId: string;
  setSelectedAssetId: (id: string) => void;
  onAddAlert: (newAlert: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: AssetCategory;
    condition: 'above' | 'below';
    targetPrice: number;
    label: string;
    chatId?: string;
  }) => void;
}

export default function AlertForm({
  prices,
  selectedAssetId,
  setSelectedAssetId,
  onAddAlert,
}: AlertFormProps) {
  const currentAsset = prices.find((p) => p.id === selectedAssetId) || prices[0];

  const [targetPrice, setTargetPrice] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');

  useEffect(() => {
    if (currentAsset) {
      const decimals = currentAsset.category === 'forex' ? 5 : 2;
      setTargetPrice(currentAsset.price ? currentAsset.price.toFixed(decimals) : '');
      setLabel('');
    }
  }, [selectedAssetId, currentAsset?.price]);

  // Listen for prefill events from the chart modal's "Alert at current" button.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const ce = e as CustomEvent<{ targetPrice: number }>;
      const tp = ce.detail?.targetPrice;
      if (typeof tp === 'number' && isFinite(tp) && currentAsset) {
        const decimals = currentAsset.category === 'forex' ? 5 : 2;
        setTargetPrice(tp.toFixed(decimals));
        setLabel(`${currentAsset.symbol} @ ${tp.toFixed(decimals)}`);
      }
    };
    window.addEventListener('pipping:prefill-alert', onPrefill);
    return () => window.removeEventListener('pipping:prefill-alert', onPrefill);
  }, [currentAsset]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentAsset || !targetPrice || isNaN(parseFloat(targetPrice))) return;

    const target = parseFloat(targetPrice);
    // Auto-derive condition for backwards compatibility with the API:
    //   target > current  -> alert when price crosses above
    //   target <= current -> alert when price crosses below
    // (The backend will fire on cross in either direction regardless.)
    const condition: 'above' | 'below' =
      currentAsset.price && target > currentAsset.price ? 'above' : 'below';

    onAddAlert({
      assetId: currentAsset.id,
      assetName: currentAsset.name,
      symbol: currentAsset.symbol,
      category: currentAsset.category,
      condition,
      targetPrice: target,
      label: label.trim() || `${currentAsset.symbol} ${target}`,
    });

    setConfirmText(
      `Saved. You'll get a Telegram message when ${currentAsset.symbol} crosses ${target}.`,
    );
    setTimeout(() => setConfirmText(''), 4000);
  };

  // Friendly validation message for the cross-price field.
  const targetError = (() => {
    if (!targetPrice) return null;
    const n = parseFloat(targetPrice);
    if (!isFinite(n) || n <= 0) return 'Price must be a positive number.';
    return null;
  })();

  const applyPriceDeviation = (percentage: number) => {
    if (!currentAsset || !currentAsset.price) return;
    const factor = 1 + percentage / 100;
    const newPrice = currentAsset.price * factor;
    const decimals = currentAsset.category === 'forex' ? 5 : 2;
    setTargetPrice(newPrice.toFixed(decimals));
    if (!label) {
      setLabel(`${percentage > 0 ? '+' : ''}${percentage}% on ${currentAsset.symbol}`);
    }
  };

  // Helpful preview line: "EUR/USD crosses 1.08500"
  const target = parseFloat(targetPrice);
  const previewText =
    currentAsset && targetPrice && !isNaN(target)
      ? `${currentAsset.symbol} crosses ${target}`
      : '';

  return (
    <div className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm relative">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Create alert</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Notifies you when the pair crosses your price — in either direction.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Pair
          </label>
          <select
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-1
              dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
              bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-emerald-500/20"
          >
            {prices.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.symbol} — {asset.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Cross price
            </label>
            <span className="text-[10px] font-mono text-zinc-400">
              Now: {currentAsset && currentAsset.price ? currentAsset.price : '—'}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 1.08500"
              aria-invalid={targetError ? 'true' : 'false'}
              className={`w-full pl-3.5 pr-12 py-2.5 rounded-xl text-sm font-mono border focus:outline-none focus:ring-1
                dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
                bg-zinc-50 text-zinc-900 focus:ring-emerald-500/20 ${
                  targetError
                    ? 'border-rose-500/60 focus:ring-rose-500/30'
                    : 'border-zinc-200'
                }`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
              {currentAsset?.category === 'forex' ? '' : 'USD'}
            </span>
          </div>

          {targetError && (
            <p className="mt-1.5 text-[11px] text-rose-500">{targetError}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-zinc-400 mr-1">Quick set:</span>
            {[-2, -0.5, 0.5, 2].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPriceDeviation(pct)}
                className={`min-h-[36px] px-3 py-1.5 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[11px] font-mono font-semibold ${
                  pct > 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {pct > 0 ? '+' : ''}
                {pct}%
              </button>
            ))}
          </div>

          {previewText && (
            <p className="mt-2.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              <span className="text-zinc-400">Will notify when:</span>{' '}
              <span className="text-zinc-700 dark:text-zinc-200 font-semibold">{previewText}</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Label <span className="text-zinc-400 normal-case font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Take profit"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-1
              dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
              bg-zinc-50 border-zinc-200 text-zinc-900"
          />
        </div>

        <button
          type="submit"
          className="w-full mt-2 py-3.5 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer text-center touch-target
            bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Save alert
        </button>

        {confirmText && (
          <div className="p-2.5 text-center text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
            {confirmText}
          </div>
        )}
      </form>
    </div>
  );
}
