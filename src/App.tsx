/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Send, Clock, ShieldCheck, Cpu, AlertTriangle } from 'lucide-react';
import { Alert, NotificationLog, AssetPrice, AssetCategory } from './types';
import { SUPPORTED_ASSETS } from './data';
import { api } from './api';
import ThemeToggle from './components/ThemeToggle';
import PriceCards from './components/PriceCards';
import AlertForm from './components/AlertForm';
import AlertList from './components/AlertList';
import NotificationLogList from './components/NotificationLogList';
import DeveloperDocs from './components/DeveloperDocs';

export default function App() {
  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Server-backed state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);

  // Live prices for the ticker UI (crypto from Binance direct, fx/gold from backend)
  const [prices, setPrices] = useState<AssetPrice[]>(SUPPORTED_ASSETS);
  const [tickHistory, setTickHistory] = useState<Record<string, number[]>>({});
  const [, setLastRefreshed] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Form selection
  const [selectedAssetId, setSelectedAssetId] = useState<string>('EURUSD');

  // Backend health (warn the user if env vars are missing)
  const [health, setHealth] = useState<{
    hasTelegramToken: boolean;
    hasDefaultChatId: boolean;
    hasTwelveDataKey: boolean;
    pollIntervalCryptoMs: number;
    tdMode: 'websocket' | 'polling' | 'hybrid';
    tdWsConnected: boolean;
    tdWsLiveSymbols: string[];
    tdPolledSymbols: string[];
    tdFallbackMs: number;
  } | null>(null);

  // Toast queue (driven by new entries appearing in /api/logs)
  const [telegramToasts, setTelegramToasts] = useState<
    Array<{ id: string; title: string; message: string; timestamp: string }>
  >([]);
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const initialLogLoadRef = useRef(true);

  // Live clock
  const [clockTime, setClockTime] = useState<string>('');
  useEffect(() => {
    const update = () => {
      setClockTime(
        new Date().toLocaleString(undefined, {
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: true,
        }),
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // Theme initialization
  useEffect(() => {
    const saved = localStorage.getItem('pip_theme') as 'dark' | 'light' | null;
    const initial = saved || 'dark';
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pip_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // Initial load: alerts, logs, prices, health
  useEffect(() => {
    refreshAlerts().catch(console.error);
    refreshLogs().catch(console.error);
    refreshBackendPrices().catch(console.error);
    api.health().then(setHealth).catch(console.error);
  }, []);

  // Poll alerts every 30s (catch backend-driven deactivations)
  useEffect(() => {
    const id = setInterval(() => {
      refreshAlerts().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll logs every 6s and surface new ones as toasts
  useEffect(() => {
    const id = setInterval(() => {
      refreshLogs().catch(() => {});
    }, 6_000);
    return () => clearInterval(id);
  }, []);

  // Poll backend prices (forex/gold) every 30s. Backend updates every 2 min.
  useEffect(() => {
    const id = setInterval(() => {
      refreshBackendPrices().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch crypto live from Binance every 4s for snappy tickers
  useEffect(() => {
    fetchLiveCrypto();
    const id = setInterval(fetchLiveCrypto, 4200);
    return () => clearInterval(id);
  }, []);

  // -----------------------------------------------------------------
  // Loaders
  // -----------------------------------------------------------------
  const refreshAlerts = async () => {
    const data = await api.listAlerts();
    setAlerts(data);
  };

  const refreshLogs = async () => {
    const data = await api.listLogs();
    setLogs(data);

    // Detect new logs since last poll and surface as toasts.
    if (initialLogLoadRef.current) {
      data.forEach((l) => seenLogIdsRef.current.add(l.id));
      initialLogLoadRef.current = false;
      return;
    }
    for (const log of data) {
      if (!seenLogIdsRef.current.has(log.id)) {
        seenLogIdsRef.current.add(log.id);
        triggerTelegramToast(log);
      }
    }
  };

  const refreshBackendPrices = async () => {
    try {
      const cached = await api.listPrices();
      if (!cached.length) return;
      setPrices((prev) =>
        prev.map((p) => {
          const hit = cached.find((c) => c.assetId === p.id);
          if (!hit) return p;
          // Only override fx/gold here; crypto is updated by Binance fetch
          if (p.category === 'crypto') return p;
          return { ...p, price: hit.price, source: hit.source || p.source };
        }),
      );
      // Push fx/gold price points into sparkline history
      setTickHistory((prev) => {
        const next = { ...prev };
        for (const c of cached) {
          const asset = SUPPORTED_ASSETS.find((a) => a.id === c.assetId);
          if (!asset || asset.category === 'crypto') continue;
          const q = [...(next[c.assetId] || []), c.price];
          if (q.length > 20) q.shift();
          next[c.assetId] = q;
        }
        return next;
      });
    } catch (err) {
      console.warn('refreshBackendPrices', err);
    }
  };

  const fetchLiveCrypto = async () => {
    setIsRefreshing(true);
    try {
      const symbols = SUPPORTED_ASSETS.filter((a) => a.category === 'crypto').map((a) => a.id);
      const results = await Promise.all(
        symbols.map(async (sym) => {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
          if (!res.ok) throw new Error(`Binance ${sym} ${res.status}`);
          const data = await res.json();
          return { id: sym, price: parseFloat(data.price) };
        }),
      );
      const map: Record<string, number> = {};
      results.forEach((r) => (map[r.id] = r.price));

      setPrices((prev) =>
        prev.map((p) => (p.category === 'crypto' && map[p.id] ? { ...p, price: map[p.id] } : p)),
      );
      setTickHistory((prev) => {
        const next = { ...prev };
        for (const r of results) {
          const q = [...(next[r.id] || []), r.price];
          if (q.length > 20) q.shift();
          next[r.id] = q;
        }
        return next;
      });
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('fetchLiveCrypto', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // -----------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------
  const handleAddAlert = async (newAlert: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: AssetCategory;
    condition: 'above' | 'below';
    targetPrice: number;
    label: string;
    chatId?: string;
  }) => {
    try {
      await api.createAlert(newAlert);
      await refreshAlerts();
    } catch (err) {
      console.error('createAlert', err);
      alert('Failed to create alert: ' + (err as Error).message);
    }
  };

  const handleToggleActiveAlert = async (id: string) => {
    const a = alerts.find((x) => x.id === id);
    if (!a) return;
    try {
      await api.updateAlert(id, { isActive: !a.isActive });
      await refreshAlerts();
    } catch (err) {
      console.error('toggleAlert', err);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await api.deleteAlert(id);
      await refreshAlerts();
    } catch (err) {
      console.error('deleteAlert', err);
    }
  };

  const handleClearHistoryLogs = async () => {
    try {
      await api.clearLogs();
      await refreshLogs();
    } catch (err) {
      console.error('clearLogs', err);
    }
  };

  const handleForceTriggerTest = async (a: Alert) => {
    try {
      const result = await api.testAlert(a.id);
      await refreshLogs();
      if (!result.sent) {
        alert(
          'Test attempted but Telegram message was not sent. Check the server logs and verify TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.',
        );
      }
    } catch (err) {
      console.error('testAlert', err);
      alert('Failed to test alert: ' + (err as Error).message);
    }
  };

  // Build a toast from a server log entry
  const triggerTelegramToast = (log: NotificationLog) => {
    const toast = {
      id: `toast-${log.id}`,
      title: 'pipPing Bot Notification',
      message: `🔔 "${log.label}" triggered. ${log.symbol} went ${log.condition} ${log.targetPrice}. Current: ${log.triggerPrice}`,
      timestamp: new Date(log.timestamp).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };
    setTelegramToasts((prev) => [toast, ...prev]);
    setTimeout(() => {
      setTelegramToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 8000);
  };

  const removeTelegramToast = (id: string) => {
    setTelegramToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSelectAssetFromTickers = (asset: AssetPrice) => {
    setSelectedAssetId(asset.id);
  };

  // Health warning banner
  const missingEnv: string[] = [];
  if (health) {
    if (!health.hasTelegramToken) missingEnv.push('TELEGRAM_BOT_TOKEN');
    if (!health.hasDefaultChatId) missingEnv.push('TELEGRAM_CHAT_ID');
    if (!health.hasTwelveDataKey) missingEnv.push('TWELVE_DATA_API_KEY');
  }

  return (
    <div className="min-h-screen transition-colors duration-300 font-sans bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <div className="absolute top-0 left-1/4 w-[400px] h-[300px] rounded-full blur-[160px] bg-emerald-500/5 pointer-events-none hidden dark:block" />
      <div className="absolute top-[400px] right-1/4 w-[500px] h-[400px] rounded-full blur-[180px] bg-emerald-600/5 pointer-events-none hidden dark:block" />

      <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8 relative z-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-zinc-200/80 dark:border-zinc-900">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <h1 className="text-2xl font-bold font-sans tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-650 dark:from-zinc-50 dark:to-zinc-300 bg-clip-text text-transparent">
                pipPing
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 text-zinc-500 font-medium">
                v0.1
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed">
              Self-hosted price alerts for forex, gold and crypto. Backend pushes Telegram messages on threshold hits.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {clockTime && (
              <div className="hidden lg:flex flex-col text-right font-mono text-[11px] text-zinc-455">
                <span className="text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-[9px] font-semibold">
                  Local Time
                </span>
                <span className="font-bold text-zinc-800 dark:text-zinc-350 tracking-wider flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3 text-emerald-500 animate-pulse" /> {clockTime}
                </span>
              </div>
            )}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </header>

        {missingEnv.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Server is missing environment variables:</strong>{' '}
              <code className="font-mono">{missingEnv.join(', ')}</code>. Copy{' '}
              <code>.env.example</code> to <code>.env</code> and fill them in. See{' '}
              <code>DEPLOY.md</code> for setup steps.
            </div>
          </div>
        )}

        <section>
          <PriceCards
            prices={prices}
            tickHistory={tickHistory}
            onSelectAsset={handleSelectAssetFromTickers}
            isRefreshing={isRefreshing}
            onManualRefresh={() => {
              fetchLiveCrypto();
              refreshBackendPrices();
            }}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <AlertForm
              prices={prices}
              selectedAssetId={selectedAssetId}
              setSelectedAssetId={setSelectedAssetId}
              onAddAlert={handleAddAlert}
            />

            <div className="p-4 rounded-xl border dark:bg-zinc-900/30 dark:border-zinc-850 bg-zinc-100/40 border-zinc-200/60 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-[10px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                How it works
              </h4>
              <p className="leading-relaxed text-[11px]">
                Crypto polls every{' '}
                {health ? Math.round(health.pollIntervalCryptoMs / 1000) : 60}s (Binance).
                Forex / gold streams over Twelve Data WebSocket (~1s) where allowed; gated symbols
                fall back to polling every{' '}
                {health ? Math.round(health.tdFallbackMs / 60_000) : 5} min.
              </p>
              {health && health.hasTwelveDataKey && (
                <div className="text-[10px] font-mono pt-0.5 space-y-0.5">
                  <div>
                    <span className="text-zinc-400">WS: </span>
                    <span
                      className={
                        health.tdWsConnected
                          ? 'text-emerald-500 font-semibold'
                          : 'text-rose-500 font-semibold'
                      }
                    >
                      {health.tdWsConnected ? 'connected' : 'disconnected'}
                    </span>
                    {health.tdWsLiveSymbols.length > 0 && (
                      <span className="text-zinc-500">
                        {' · '}live: {health.tdWsLiveSymbols.join(', ')}
                      </span>
                    )}
                  </div>
                  {health.tdPolledSymbols.length > 0 && (
                    <div className="text-zinc-500">
                      polled: {health.tdPolledSymbols.join(', ')}
                    </div>
                  )}
                </div>
              )}
              <p className="leading-relaxed text-[11px] pt-1">
                Triggered alerts auto-disable to prevent spam — toggle them back on to re-arm.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <AlertList
              alerts={alerts}
              onToggleActive={handleToggleActiveAlert}
              onDeleteAlert={handleDeleteAlert}
              onTriggerTest={handleForceTriggerTest}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-12">
          <NotificationLogList logs={logs} onClearLogs={handleClearHistoryLogs} />
          <DeveloperDocs />
        </section>

        <footer className="pt-10 border-t border-zinc-250 dark:border-zinc-900 text-center text-xs text-zinc-440 dark:text-zinc-500 space-y-1">
          <p className="font-mono text-[10px] flex items-center justify-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-500" /> pipPing • Self-hosted Telegram alerts
          </p>
          <p>React 19 • Vite • Tailwind v4 • Node + SQLite</p>
        </footer>

        <div className="fixed bottom-5 right-5 z-50 space-y-3.5 max-w-sm w-full font-sans select-none pointer-events-none">
          {telegramToasts.map((toast) => (
            <div
              key={toast.id}
              className="p-4 rounded-xl border pointer-events-auto shadow-2xl transition-all duration-300 bg-white/95 dark:bg-zinc-950/95 border-zinc-200 dark:border-sky-500/30 flex gap-3.5 relative overflow-hidden"
              style={{ animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500" />
              <div className="p-2.5 rounded-full bg-sky-500/10 text-sky-500 shrink-0 h-10 w-10 flex items-center justify-center leading-none">
                <Send className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-sky-500 uppercase tracking-wide">
                    {toast.title}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">{toast.timestamp}</span>
                </div>
                <p className="text-xs text-zinc-650 dark:text-zinc-200 font-medium leading-relaxed">
                  {toast.message}
                </p>
                <div className="pt-1.5 flex items-center justify-between text-[9px] font-mono text-zinc-400">
                  <span>Telegram push</span>
                  <span>Click × to dismiss</span>
                </div>
              </div>
              <button
                onClick={() => removeTelegramToast(toast.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 absolute top-2.5 right-2.5 cursor-pointer leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes slideIn {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `,
          }}
        />
      </div>
    </div>
  );
}
