/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Trash2, Radio, ToggleLeft, ToggleRight, Sparkles, SlidersHorizontal, ArrowUpRight, ArrowDownRight, Edit2 } from 'lucide-react';
import { Alert } from '../types';

interface AlertListProps {
  alerts: Alert[];
  onToggleActive: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onTriggerTest: (alert: Alert) => void;
  onEditAlert?: (alert: Alert) => void;
}

type FilterType = 'all' | 'crypto' | 'forex' | 'gold' | 'active' | 'inactive';

export default function AlertList({
  alerts,
  onToggleActive,
  onDeleteAlert,
  onTriggerTest,
  onEditAlert
}: AlertListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState<string>('');

  // Filtering elements
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

  const getFilterBtnClass = (currentFilter: FilterType) => {
    return `px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer
      ${filter === currentFilter
        ? 'bg-emerald-500 dark:bg-emerald-600 text-white shadow-sm'
        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 dark:border-zinc-800 border border-zinc-200/50 text-zinc-500 dark:text-zinc-400'}`;
  };

  return (
    <div
      id="alerts-list-card"
      className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 id="list-heading" className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            Configured Alerts
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-850 dark:text-zinc-400 text-zinc-600">
              {filteredAlerts.length} total
            </span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Active conditions continuously scanned on the 60 sec cron loop.
          </p>
        </div>

        {/* Real-time search bar */}
        <div className="relative max-w-xs w-full">
          <input
            id="search-alerts"
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

      {/* Filter Buttons */}
      <div id="filter-tabs" className="flex flex-wrap gap-1.5 mb-5 pb-1 select-none">
        <button id="filter-all" onClick={() => setFilter('all')} className={getFilterBtnClass('all')}>All</button>
        <button id="filter-crypto" onClick={() => setFilter('crypto')} className={getFilterBtnClass('crypto')}>Crypto</button>
        <button id="filter-forex" onClick={() => setFilter('forex')} className={getFilterBtnClass('forex')}>Forex</button>
        <button id="filter-gold" onClick={() => setFilter('gold')} className={getFilterBtnClass('gold')}>Gold Spots</button>
        <button id="filter-active" onClick={() => setFilter('active')} className={getFilterBtnClass('active')}>Active</button>
        <button id="filter-inactive" onClick={() => setFilter('inactive')} className={getFilterBtnClass('inactive')}>Paused</button>
      </div>

      {/* Grid Alert Items */}
      <div id="alerts-grid-view" className="space-y-3.5">
        {filteredAlerts.length === 0 ? (
          <div id="alerts-empty-state" className="text-center py-12 border border-dashed rounded-xl dark:border-zinc-800 dark:bg-zinc-950/20 border-zinc-200 bg-zinc-50/50">
            <Radio id="no-alerts-radio" className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2 animate-pulse" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No alert thresholds found</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Select a live ticker above or enter thresholds manually.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isAbove = alert.condition === 'above';
            return (
              <div
                id={`alert-row-${alert.id}`}
                key={alert.id}
                className={`p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4
                  ${alert.isActive
                    ? 'dark:bg-zinc-900/30 bg-white dark:border-zinc-800 border-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700'
                    : 'bg-zinc-50/60 dark:bg-zinc-950/40 border-zinc-200/50 dark:border-zinc-900/60 opacity-60'}`}
              >
                {/* Left: General symbol info & user friendly label */}
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg shrink-0 mt-0.5
                    ${alert.isActive
                      ? isAbove
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-rose-500/10 text-rose-500'
                      : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-400'}`}
                  >
                    {isAbove ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5" />
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold dark:text-zinc-200 text-zinc-800 uppercase">
                        {alert.symbol}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold
                        ${alert.category === 'crypto'
                          ? 'bg-amber-500/10 text-amber-500'
                          : alert.category === 'forex'
                            ? 'bg-sky-500/10 text-sky-500'
                            : 'bg-yellow-500/10 text-yellow-500'}`}
                      >
                        {alert.category}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">
                      {alert.label}
                    </h3>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                      Target: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{isAbove ? '≥' : '≤'} {alert.targetPrice}</span> • Tg: <code className="bg-zinc-100 dark:bg-zinc-850 px-1 rounded text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">{alert.chatId}</code>
                    </p>
                  </div>
                </div>

                {/* Right Actions: active-toggle, force test trigger, delete */}
                <div className="flex items-center justify-end gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                  {/* Push Trigger Simulation Test button */}
                  {alert.isActive && (
                    <button
                      id={`btn-simulation-trigger-${alert.id}`}
                      onClick={() => onTriggerTest(alert)}
                      className="px-2.5 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-lg border flex items-center gap-1.5 transition-all
                        dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-400 dark:hover:bg-emerald-500/10
                        border-emerald-200 bg-emerald-50/50 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                      title="Force a simulation trigger with a current price match"
                    >
                      <Sparkles className="w-3 h-3" /> Force Ping
                    </button>
                  )}

                  {/* Inline Toggle Activation switch */}
                  <button
                    id={`btn-toggle-active-${alert.id}`}
                    onClick={() => onToggleActive(alert.id)}
                    className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                    title={alert.isActive ? 'Pause Alert' : 'Resume Alert'}
                  >
                    {alert.isActive ? (
                      <ToggleRight className="w-7 h-7 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-zinc-400" />
                    )}
                  </button>

                  {/* Optional Inline Edit */}
                  {onEditAlert && (
                    <button
                      id={`btn-edit-alert-${alert.id}`}
                      onClick={() => onEditAlert(alert)}
                      className="p-2 rounded-lg border dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 text-zinc-500 cursor-pointer"
                      title="Edit Alert parameters"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete Item */}
                  <button
                    id={`btn-delete-alert-${alert.id}`}
                    onClick={() => onDeleteAlert(alert.id)}
                    className="p-2 rounded-lg border border-rose-500/12 dark:bg-rose-500/5 dark:text-rose-400 dark:hover:bg-rose-500/10 bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer"
                    title="Remove Alert Threshold"
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
