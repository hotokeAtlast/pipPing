/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { NotificationLog } from '../types';

interface NotificationLogListProps {
  logs: NotificationLog[];
  onClearLogs: () => void;
}

export default function NotificationLogList({ logs, onClearLogs }: NotificationLogListProps) {
  // Format dates cleanly
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }) + ' ' + date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      id="notification-history-card"
      className="p-6 rounded-2xl border dark:bg-zinc-900/60 dark:border-zinc-800 bg-white border-zinc-200 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 id="log-heading" className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            Status & Trigger Logs
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-850 dark:text-zinc-400 text-zinc-600">
              {logs.length} triggered
            </span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Chronological audit log of Telegram pushes executed by the bot.
          </p>
        </div>

        {logs.length > 0 && (
          <button
            id="btn-clear-logs"
            onClick={onClearLogs}
            className="flex items-center gap-1 min-h-[36px] px-3 py-2 text-xs text-rose-500 hover:text-rose-600 font-semibold border border-rose-500/20 dark:bg-rose-500/5 dark:hover:bg-rose-500/10 hover:bg-rose-50 rounded-lg cursor-pointer transition-all self-start sm:self-center"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear History
          </button>
        )}
      </div>

      <div id="logs-container" className="space-y-2.5 max-h-[60vh] sm:max-h-[420px] overflow-y-auto pr-1 -mr-1 overscroll-contain">
        {logs.length === 0 ? (
          <div id="logs-empty-state" className="text-center py-10 border border-dashed rounded-xl dark:border-zinc-800 dark:bg-zinc-950/20 border-zinc-200 bg-zinc-50/50">
            <Clock id="clock-empty-icon" className="w-7 h-7 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">No recent alerts triggered</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              Force simulation pings on active alerts to verify Telegram messages.
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const isAbove = log.condition === 'above';
            return (
              <div
                id={`log-item-${log.id}`}
                key={log.id}
                className="p-3.5 rounded-xl border dark:bg-zinc-950 dark:border-zinc-900 bg-zinc-50/60 border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 p-1 rounded-full ${isAbove ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 uppercase text-[11px]">
                        {log.symbol}
                      </span>
                      <span className="text-zinc-400 text-[10px]">•</span>
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {log.label}
                      </span>
                    </div>

                    <p className="text-zinc-400 dark:text-zinc-500 text-[11px] mt-1 font-mono">
                      Trigger price: <strong className="text-zinc-700 dark:text-zinc-300">{log.triggerPrice}</strong> (Bound: {isAbove ? '≥' : '≤'} {log.targetPrice})
                    </p>

                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1 font-sans">
                      <Clock className="w-3 h-3" />
                      {formatDate(log.timestamp)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400 font-mono">
                    <CheckCircle className="w-3 h-3" strokeWidth={2.5} /> TELEGRAM SENT
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
