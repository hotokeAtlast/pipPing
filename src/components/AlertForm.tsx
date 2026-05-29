/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { AssetPrice } from '../types';

interface AlertFormProps {
  prices: AssetPrice[];
  selectedAssetId: string;
  setSelectedAssetId: (id: string) => void;
  onAddAlert: (newAlert: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: 'crypto' | 'forex' | 'gold';
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

  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');

  useEffect(() => {
    if (currentAsset) {
      const decimals = currentAsset.category === 'forex' ? 4 : 2;
      setTargetPrice(currentAsset.price ? currentAsset.price.toFixed(decimals) : '');
      setLabel(`Alert for ${currentAsset.name}`);
    }
  }, [selectedAssetId, currentAsset?.price]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentAsset || !targetPrice || isNaN(parseFloat(targetPrice))) return;

    onAddAlert({
      assetId: currentAsset.id,
      assetName: currentAsset.name,
      symbol: currentAsset.symbol,
      category: currentAsset.category,
      condition,
      targetPrice: parseFloat(targetPrice),
      label: label.trim() || `Alert for ${currentAsset.name}`,
    });

    setConfirmText('Alert saved. The server will check it on the next price tick.');
    setTimeout(() => setConfirmText(''), 3000);
  };

  const applyPriceDeviation = (percentage: number) => {
    if (!currentAsset || !currentAsset.price) return;
    const factor = 1 + percentage / 100;
    const newPrice = currentAsset.price * factor;
    const decimals = currentAsset.category === 'forex' ? 4 : 2;
    setTargetPrice(newPrice.toFixed(decimals));
    setCondition(percentage > 0 ? 'above' : 'below');
    setLabel(`${percentage > 0 ? '+' : ''}${percentage}% on ${currentAsset.symbol}`);
  };

  return (
    <div className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm relative">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Setup Threshold Alert
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Saved alerts are evaluated server-side every poll cycle.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Target Instrument / Asset
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
                {asset.symbol} - {asset.name} ({asset.category})
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Trigger Condition
          </span>
          <div className="grid grid-cols-2 gap-2 bg-zinc-50 dark:bg-zinc-950 p-1.5 rounded-xl border border-zinc-200/60 dark:border-zinc-900">
            <button
              type="button"
              onClick={() => setCondition('above')}
              className={`py-2 text-xs font-medium rounded-lg transition-all cursor-pointer text-center
                ${
                  condition === 'above'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-500 shadow-sm border border-zinc-100 dark:border-zinc-800'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
            >
              📈 Above (≥)
            </button>
            <button
              type="button"
              onClick={() => setCondition('below')}
              className={`py-2 text-xs font-medium rounded-lg transition-all cursor-pointer text-center
                ${
                  condition === 'below'
                    ? 'bg-white dark:bg-zinc-900 text-rose-500 shadow-sm border border-zinc-100 dark:border-zinc-800'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
            >
              📉 Below (≤)
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Trigger Target Price (USD)
            </label>
            <span className="text-[10px] font-mono text-zinc-400">
              Current: {currentAsset && currentAsset.price ? currentAsset.price : '—'}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              step="any"
              required
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 70000.00"
              className="w-full pl-3.5 pr-12 py-2.5 rounded-xl text-sm font-mono border focus:outline-none focus:ring-1
                dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
                bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-emerald-500/20"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
              USD
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-zinc-400 mr-1">Quick deviation:</span>
            {[-2, -0.5, 0.5, 2].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPriceDeviation(pct)}
                className={`px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[10px] font-mono font-medium ${
                  pct > 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {pct > 0 ? '+' : ''}
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Alert Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Take Profit BTC level 1"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-1
              dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
              bg-zinc-50 border-zinc-200 text-zinc-900"
          />
        </div>

        <button
          type="submit"
          className="w-full mt-2 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer text-center
            bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Save Alert Threshold
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
