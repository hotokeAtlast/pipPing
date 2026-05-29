/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { Bell, HelpCircle, Sparkles, Send } from 'lucide-react';
import { AssetPrice, Alert } from '../types';

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
    chatId: string;
  }) => void;
}

export default function AlertForm({
  prices,
  selectedAssetId,
  setSelectedAssetId,
  onAddAlert
}: AlertFormProps) {
  const currentAsset = prices.find((p) => p.id === selectedAssetId) || prices[0];

  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [showHelperTooltip, setShowHelperTooltip] = useState<boolean>(false);
  const [presetAlertText, setPresetAlertText] = useState<string>('');

  // Automatically pre-fill price input when selected asset changes or is loaded
  useEffect(() => {
    if (currentAsset) {
      setTargetPrice(currentAsset.price.toString());
      // Suggest a nice label
      setLabel(`Alert for ${currentAsset.name}`);
    }
  }, [selectedAssetId]);

  // Load standard parameters from persistent local storage for developer convenience
  useEffect(() => {
    const savedTelegramChatId = localStorage.getItem('pip_telegram_chat_id');
    if (savedTelegramChatId) {
      setChatId(savedTelegramChatId);
    }
  }, []);

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
      chatId: chatId.trim() || '@pip_alerts_group'
    });

    // Save Telegram group/chat ID settings to local storage as default preference
    if (chatId.trim()) {
      localStorage.setItem('pip_telegram_chat_id', chatId.trim());
    }

    // Give visual confirmation flash feedback or reset
    setPresetAlertText('Alert registered! Tickers are checking thresholds...');
    setTimeout(() => setPresetAlertText(''), 3000);
  };

  // Quick threshold target calculations
  const applyPriceDeviation = (percentage: number) => {
    if (!currentAsset) return;
    const factor = 1 + percentage / 100;
    const newPrice = currentAsset.price * factor;

    // Use precise representation based on asset category
    const decimals = currentAsset.category === 'forex' ? 4 : 2;
    setTargetPrice(newPrice.toFixed(decimals));
    setCondition(percentage > 0 ? 'above' : 'below');
    setLabel(`Auto Alert ${percentage > 0 ? '+' : ''}${percentage}% (${currentAsset.symbol})`);
  };

  return (
    <div
      id="alert-creation-form-card"
      className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm relative"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 id="form-heading" className="text-base font-bold text-zinc-900 dark:text-zinc-50">
            Setup Threshold Alert
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Establish pricing thresholds for the Cloudflare execution worker.
          </p>
        </div>
      </div>

      <form id="alert-setup-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Asset Selection Dropdown */}
        <div>
          <label htmlFor="asset-select" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Target Instrument/Asset
          </label>
          <select
            id="asset-select"
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

        {/* Condition Toggle Above or Below */}
        <div>
          <span className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Trigger Condition
          </span>
          <div id="condition-toggle-container" className="grid grid-cols-2 gap-2 bg-zinc-50 dark:bg-zinc-950 p-1.5 rounded-xl border border-zinc-200/60 dark:border-zinc-900">
            <button
              id="condition-above-btn"
              type="button"
              onClick={() => setCondition('above')}
              className={`py-2 text-xs font-medium rounded-lg transition-all cursor-pointer text-center
                ${condition === 'above'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-500 shadow-sm border border-zinc-100 dark:border-zinc-800'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              📈 Price goes Above (≥)
            </button>
            <button
              id="condition-below-btn"
              type="button"
              onClick={() => setCondition('below')}
              className={`py-2 text-xs font-medium rounded-lg transition-all cursor-pointer text-center
                ${condition === 'below'
                  ? 'bg-white dark:bg-zinc-900 text-rose-500 shadow-sm border border-zinc-100 dark:border-zinc-800'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              📉 Price goes Below (≤)
            </button>
          </div>
        </div>

        {/* Target Trigger Price Input */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="target-price" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Trigger Target Price (USD)
            </label>
            <span className="text-[10px] font-mono text-zinc-400">
              Current: {currentAsset ? currentAsset.price : '0'}
            </span>
          </div>
          <div className="relative">
            <input
              id="target-price"
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

          {/* Quick Deviations Selector */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-zinc-400 mr-1">Deviation:</span>
            <button
              id="btn-dev-minus-2"
              type="button"
              onClick={() => applyPriceDeviation(-2.0)}
              className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[10px] text-rose-500 font-mono font-medium"
            >
              -2.0%
            </button>
            <button
              id="btn-dev-minus-05"
              type="button"
              onClick={() => applyPriceDeviation(-0.5)}
              className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[10px] text-rose-500 font-mono font-medium"
            >
              -0.5%
            </button>
            <button
              id="btn-dev-plus-05"
              type="button"
              onClick={() => applyPriceDeviation(0.5)}
              className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[10px] text-emerald-500 font-mono font-medium"
            >
              +0.5%
            </button>
            <button
              id="btn-dev-plus-2"
              type="button"
              onClick={() => applyPriceDeviation(2.0)}
              className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-[10px] text-emerald-500 font-mono font-medium"
            >
              +2.0%
            </button>
          </div>
        </div>

        {/* Custom Alarm/Alert Name label */}
        <div>
          <label htmlFor="label-input" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
            Alert Friendly Label
          </label>
          <input
            id="label-input"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Take Profit BTC level 1"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-1
              dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
              bg-zinc-50 border-zinc-200 text-zinc-900"
          />
        </div>

        {/* Telegram Chat ID/Channel Parameter */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="chatId-input" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              Telegram Chat ID / Channel
              <button
                id="btn-tooltip-toggle"
                type="button"
                onClick={() => setShowHelperTooltip(!showHelperTooltip)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                aria-label="Telegram help info"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </label>
            <span className="text-[10px] text-zinc-400 font-mono">Push Target</span>
          </div>

          <div className="relative">
            <input
              id="chatId-input"
              type="text"
              required
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. 542981358 or @my_pips_group"
              className="w-full pl-3.5 pr-24 py-2.5 rounded-xl text-sm font-mono border focus:outline-none focus:ring-1
                dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:focus:ring-emerald-500/30
                bg-zinc-50 border-zinc-200 text-zinc-900"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-emerald-500 px-1.5 py-0.5 rounded bg-emerald-500/10 font-mono flex items-center gap-1">
              <Send className="w-2.5 h-2.5" /> Bot Push
            </span>
          </div>

          {showHelperTooltip && (
            <div id="telegram-tooltip" className="mt-2 p-3 text-xs rounded-xl border dark:bg-zinc-950 dark:border-zinc-800 bg-zinc-50 border-zinc-200 text-zinc-500 dark:text-zinc-400 space-y-1 leading-relaxed">
              <p>
                <strong>Setting up Push Alerts:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 font-sans">
                <li>Create a Telegram Bot using <code>@BotFather</code> on Telegram.</li>
                <li>Add your Bot in a group, or message it privately.</li>
                <li>Message <code>@userinfobot</code> to instantly grab your numerical individual chat ID (e.g., <code>542981358</code>).</li>
                <li>Or specify public channels using handles (e.g., <code>@my_channel</code>).</li>
              </ol>
            </div>
          )}
        </div>

        {/* Register Action Button */}
        <button
          id="btn-alert-register"
          type="submit"
          className="w-full mt-2 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer text-center
            bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Save Alert Threshold
        </button>

        {presetAlertText && (
          <div id="notification-toast" className="p-2.5 text-center text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
            {presetAlertText}
          </div>
        )}
      </form>
    </div>
  );
}
