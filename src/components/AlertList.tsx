/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Trash2,
  Radio,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { Alert } from '../types';

interface AlertListProps {
  alerts: Alert[];
  onToggleActive: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onTriggerTest: (alert: Alert) => void;
}

type FilterType = 'all' | 'crypto' | 'forex' | 'gold' | 'commodity' | 'index' | 'active' | 'inactive';

function categoryBadgeClass(category: string): string {
  switch (category) {
    case 'crypto':
      return 'bg-amber-500/10 text-amber-500';
    case 'forex':
      return 'bg-sky-500/10 text-sky-500';
    case 'gold':
      return 'bg-yellow-500/10 text-yellow-500';
    case 'commodity':
      return 'bg-slate-500/10 text-slate-400';
    case 'index':
      return 'bg-violet-500/10 text-violet-500';
    default:
      return 'bg-zinc-500/10 text-zinc-500';
  }
}

export default function AlertList({
  alerts,
  onToggleActive,
  onDeleteAlert,
  onTriggerTest,
}: AlertListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState<string>('');

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.symbol.toLowerCase().includes(search.toLowerCase()) ||
      alert.label.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'all') return true;
    if (filter === 'active') return alert.isActive;
    if (filter === 'inactive') return !alert.isActive;
    return alert.category === filter;
  });

  const filterBtnClass = (f: FilterType) =>
    `px-3 py-2 rounded-lg text-[11px] sm:text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap
      ${
        filter === f
          ? 'bg-emerald-500 dark:bg-emerald-600 text-white shadow-sm'
          : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 dark:border-zinc-800 border border-zinc-200/50 text-zinc-500 dark:text-zinc-400'
      }`;

  return (
    <div className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            Configured Alerts
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-850 dark:text-zinc-400 text-zinc-600">
              {filteredAlerts.length} total
            </span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Active conditions are scanned every poll cycle by the backend.
          </p>
        </div>
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            placeholder="Filter by asset or label..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3.5 py-1.5 pl-9 rounded-xl text-xs border focus:outline-none font-sans
              dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 bg-zinc-50 border-zinc-200 text-zinc-950"
          />
          <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
        </div>
      </div>

      <div className="flex gap-1.5 mb-5 pb-2 select-none overflow-x-auto scrollbar-hide -mx-1 px-1">
        <button onClick={() => setFilter('all')} className={filterBtnClass('all')}>All</button>
        <button onClick={() => setFilter('crypto')} className={filterBtnClass('crypto')}>Crypto</button>
        <button onClick={() => setFilter('forex')} className={filterBtnClass('forex')}>Forex</button>
        <button onClick={() => setFilter('gold')} className={filterBtnClass('gold')}>Gold</button>
        <button onClick={() => setFilter('commodity')} className={filterBtnClass('commodity')}>Commodity</button>
        <button onClick={() => setFilter('index')} className={filterBtnClass('index')}>Index</button>
        <button onClick={() => setFilter('active')} className={filterBtnClass('active')}>Active</button>
        <button onClick={() => setFilter('inactive')} className={filterBtnClass('inactive')}>Paused</button>
      </div>

      <div className="space-y-3.5">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl dark:border-zinc-800 dark:bg-zinc-950/20 border-zinc-200 bg-zinc-50/50">
            <Radio className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2 animate-pulse" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              No alert thresholds yet
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Pick an asset and create your first alert in the form on the left.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4
                  ${
                    alert.isActive
                      ? 'dark:bg-zinc-900/30 bg-white dark:border-zinc-800 border-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700'
                      : 'bg-zinc-50/60 dark:bg-zinc-950/40 border-zinc-200/50 dark:border-zinc-900/60 opacity-60'
                  }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`p-2.5 rounded-lg shrink-0 mt-0.5
                    ${
                      alert.isActive
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-400'
                    }`}
                  >
                    <Target className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold dark:text-zinc-200 text-zinc-800 uppercase">
                        {alert.symbol}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold
                        ${categoryBadgeClass(alert.category)}`}
                      >
                        {alert.category}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">
                      {alert.label}
                    </h3>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                      Crosses{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {alert.targetPrice}
                      </span>
                      {alert.lastTriggeredAt && (
                        <>
                          {' '}
                          • Last fired:{' '}
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {new Date(alert.lastTriggeredAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800 shrink-0">
                  <button
                    onClick={() => onTriggerTest(alert)}
                    className="min-h-[36px] px-2.5 py-2 text-[10px] uppercase font-bold tracking-wider rounded-lg border flex items-center gap-1.5 transition-all
                        dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-400 dark:hover:bg-emerald-500/10
                        border-emerald-200 bg-emerald-50/50 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                    title="Send a real test Telegram message right now"
                  >
                    <Sparkles className="w-3 h-3" /> Test Push
                  </button>

                  <button
                    onClick={() => onToggleActive(alert.id)}
                    className="p-2.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer touch-target"
                    title={alert.isActive ? 'Pause alert' : 'Resume alert'}
                  >
                    {alert.isActive ? (
                      <ToggleRight className="w-7 h-7 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-zinc-400" />
                    )}
                  </button>

                  <button
                    onClick={() => onDeleteAlert(alert.id)}
                    className="p-2.5 rounded-lg border border-rose-500/12 dark:bg-rose-500/5 dark:text-rose-400 dark:hover:bg-rose-500/10 bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer touch-target"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
