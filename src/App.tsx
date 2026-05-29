/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, Info, Send, Radio, ToggleLeft, ToggleRight, Sparkles, Clock, ShieldCheck, Cpu } from 'lucide-react';
import { Alert, NotificationLog, AssetPrice } from './types';
import { SUPPORTED_ASSETS, INITIAL_ALERTS, INITIAL_LOGS } from './data';
import ThemeToggle from './components/ThemeToggle';
import PriceCards from './components/PriceCards';
import AlertForm from './components/AlertForm';
import AlertList from './components/AlertList';
import NotificationLogList from './components/NotificationLogList';
import DeveloperDocs from './components/DeveloperDocs';

export default function App() {
  // 1. Theme Configuration
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // 2. Alert & Logs state (with LocalStorage caching)
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);

  // 3. Current Live Ticker prices and pricing history sparklines
  const [prices, setPrices] = useState<AssetPrice[]>(SUPPORTED_ASSETS);
  const [tickHistory, setTickHistory] = useState<Record<string, number[]>>({});
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 4. Form integration parameters
  const [selectedAssetId, setSelectedAssetId] = useState<string>('BTCUSDT');

  // 5. Simulated Telegram Notification Popups Stack
  const [telegramToasts, setTelegramToasts] = useState<Array<{
    id: string;
    title: string;
    message: string;
    timestamp: string;
  }>>([]);

  // Ref to prevent out-of-order interval updates or stale closures
  const statePricesRef = useRef<AssetPrice[]>(prices);
  statePricesRef.current = prices;

  // 6. Live Clock display
  const [clockTime, setClockTime] = useState<string>('');

  // Setup visual clock interval
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockTime(now.toLocaleString(undefined, {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true,
      }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // 7. Initial loading and theme startup setups
  useEffect(() => {
    // Determine Theme persistence
    const savedTheme = localStorage.getItem('pip_theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Determine Alerts persistence
    const savedAlerts = localStorage.getItem('pip_alerts');
    if (savedAlerts) {
      try {
        setAlerts(JSON.parse(savedAlerts));
      } catch {
        setAlerts(INITIAL_ALERTS);
      }
    } else {
      setAlerts(INITIAL_ALERTS);
    }

    // Determine Notification log persistence
    const savedLogs = localStorage.getItem('pip_logs');
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs));
      } catch {
        setLogs(INITIAL_LOGS);
      }
    } else {
      setLogs(INITIAL_LOGS);
    }

    // Generate simulated back-history sparklines immediately on load
    const initialHistory: Record<string, number[]> = {};
    SUPPORTED_ASSETS.forEach((asset) => {
      const hist: number[] = [];
      let base = asset.price;
      // create 12 randomized prior points to draw nice initial sparklines
      for (let i = 0; i < 15; i++) {
        const change = (Math.random() - 0.49) * (asset.category === 'forex' ? 0.001 : base * 0.008);
        base += change;
        hist.push(base);
      }
      initialHistory[asset.id] = hist;
    });
    setTickHistory(initialHistory);
    setLastRefreshed(new Date().toLocaleTimeString());
  }, []);

  // Helper: Persist alerts on edit or additions
  const saveAlerts = (newAlerts: Alert[]) => {
    setAlerts(newAlerts);
    localStorage.setItem('pip_alerts', JSON.stringify(newAlerts));
  };

  // Helper: Persist notification audit logs
  const saveLogs = (newLogs: NotificationLog[]) => {
    setLogs(newLogs);
    localStorage.setItem('pip_logs', JSON.stringify(newLogs));
  };

  // Theme Toggler
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('pip_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // 8. Ticker price update routines & WebSocket fallbacks
  const fetchLiveTickers = async () => {
    setIsRefreshing(true);
    let cryptoPrices: Record<string, number> = {};

    // Fetch public keyless Binance crypto tickers
    try {
      const symbolsToFetch = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const fetches = symbolsToFetch.map(async (sym) => {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
        if (!res.ok) throw new Error('API hit rate-limit');
        const data = await res.json();
        return { symbol: sym, price: parseFloat(data.price) };
      });

      const results = await Promise.all(fetches);
      results.forEach((item) => {
        cryptoPrices[item.symbol] = item.price;
      });
    } catch (err) {
      console.warn('Crypto API rate-limit reached. Seamless simulator fallback activated.', err);
    }

    // Process price modifications onto existing state
    setPrices((prevPrices) => {
      return prevPrices.map((asset) => {
        let nextPrice = asset.price;
        let changeAmount = 0;

        if (asset.category === 'crypto' && cryptoPrices[asset.id]) {
          // Use real live data if fetched successfully
          nextPrice = cryptoPrices[asset.id];
        } else {
          // Simulated random walk deviation walk
          const volatility = asset.category === 'forex' ? 0.00015 : asset.category === 'gold' ? 0.45 : asset.price * 0.0008;
          // random bias walk
          const bias = (Math.random() - 0.5) * volatility;
          nextPrice = asset.price + bias;
        }

        // Determine 24h change percentage
        const initialAssetRef = SUPPORTED_ASSETS.find((p) => p.id === asset.id);
        const originalPrice = initialAssetRef ? initialAssetRef.price : asset.price;
        const changeFactor = ((nextPrice - originalPrice) / originalPrice) * 100;

        // Save tick queue history
        setTickHistory((prevHistory) => {
          const currentQueue = prevHistory[asset.id] || [];
          const nextQueue = [...currentQueue, nextPrice];
          if (nextQueue.length > 20) {
            nextQueue.shift(); // maintain window limit
          }
          return { ...prevHistory, [asset.id]: nextQueue };
        });

        // Evaluate active thresholds against current updated price
        checkAlertCondition(asset.id, asset.symbol, asset.category, nextPrice, asset.name);

        return {
          ...asset,
          price: nextPrice,
          change24h: changeFactor + (initialAssetRef ? initialAssetRef.change24h : 0),
          isSimulated: !cryptoPrices[asset.id] && asset.category === 'crypto' ? true : asset.isSimulated
        };
      });
    });

    setLastRefreshed(new Date().toLocaleTimeString());
    setIsRefreshing(false);
  };

  // Run the background ticker prices fetching loop
  useEffect(() => {
    // Initial fetch
    fetchLiveTickers();

    // Loop interval fetches every 4 seconds for immediate responsiveness
    const interval = setInterval(() => {
      fetchLiveTickers();
    }, 4200);

    return () => clearInterval(interval);
  }, []);

  // 9. Alert evaluating thresholds core engine
  const checkAlertCondition = (
    assetId: string,
    symbol: string,
    category: 'crypto' | 'forex' | 'gold',
    currentPrice: number,
    assetName: string
  ) => {
    // Scan configured alerts
    setAlerts((currentAlerts) => {
      let containsModifications = false;
      const nextAlerts = currentAlerts.map((alert) => {
        if (!alert.isActive || alert.assetId !== assetId) return alert;

        let triggered = false;
        if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
          triggered = true;
        } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
          triggered = true;
        }

        if (triggered) {
          containsModifications = true;
          // Trigger mock log history entry
          const triggeredLog: NotificationLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            alertId: alert.id,
            assetName: alert.assetName,
            symbol: alert.symbol,
            category: alert.category,
            condition: alert.condition,
            triggerPrice: parseFloat(currentPrice.toFixed(category === 'forex' ? 4 : 2)),
            targetPrice: alert.targetPrice,
            timestamp: new Date().toISOString(),
            sentToTelegram: true,
            label: alert.label
          };

          // Append to log history lists
          setLogs((prevLogs) => {
            const nextL = [triggeredLog, ...prevLogs];
            localStorage.setItem('pip_logs', JSON.stringify(nextL));
            return nextL;
          });

          // Dispatch simulated telegram push notification
          triggerTelegramToast(alert.label, alert.symbol, alert.condition, alert.targetPrice, currentPrice);

          // Update alert properties (set inactive to avoid double trigger matches)
          return {
            ...alert,
            isActive: false,
            lastTriggeredAt: new Date().toISOString()
          };
        }

        return alert;
      });

      if (containsModifications) {
        localStorage.setItem('pip_alerts', JSON.stringify(nextAlerts));
      }
      return nextAlerts;
    });
  };

  // 10. Manual creation of dynamic alerts from Form
  const handleAddAlert = (newAlert: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: 'crypto' | 'forex' | 'gold';
    condition: 'above' | 'below';
    targetPrice: number;
    label: string;
    chatId: string;
  }) => {
    const alertItem: Alert = {
      ...newAlert,
      id: `alert-${Date.now()}`,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    const nextAlerts = [alertItem, ...alerts];
    saveAlerts(nextAlerts);
  };

  // 11. Handle Alert management commands
  const handleToggleActiveAlert = (id: string) => {
    const nextAlerts = alerts.map((alert) => {
      if (alert.id === id) {
        return { ...alert, isActive: !alert.isActive };
      }
      return alert;
    });
    saveAlerts(nextAlerts);
  };

  const handleDeleteAlert = (id: string) => {
    const nextAlerts = alerts.filter((alert) => alert.id !== id);
    saveAlerts(nextAlerts);
  };

  const handleClearHistoryLogs = () => {
    saveLogs([]);
  };

  // 12. Simulate instant trigger (Force Trigger) via list buttons
  const handleForceTriggerTest = (alert: Alert) => {
    // Grabs latest price or appends deviation triggered price
    const deviationPrice = alert.condition === 'above'
      ? alert.targetPrice + (alert.category === 'forex' ? 0.0012 : alert.targetPrice * 0.005)
      : alert.targetPrice - (alert.category === 'forex' ? 0.0012 : alert.targetPrice * 0.005);
    
    const decimalPrec = alert.category === 'forex' ? 4 : 2;
    const finalTriggerPrice = parseFloat(deviationPrice.toFixed(decimalPrec));

    const forceLog: NotificationLog = {
      id: `log-${Date.now()}`,
      alertId: alert.id,
      assetName: alert.assetName,
      symbol: alert.symbol,
      category: alert.category,
      condition: alert.condition,
      triggerPrice: finalTriggerPrice,
      targetPrice: alert.targetPrice,
      timestamp: new Date().toISOString(),
      sentToTelegram: true,
      label: alert.label
    };

    saveLogs([forceLog, ...logs]);

    // Deactivate the alert since it has been triggered
    const nextAlerts = alerts.map((a) => {
      if (a.id === alert.id) {
        return { ...a, isActive: false, lastTriggeredAt: new Date().toISOString() };
      }
      return a;
    });
    saveAlerts(nextAlerts);

    // Send visual popup message
    triggerTelegramToast(alert.label, alert.symbol, alert.condition, alert.targetPrice, finalTriggerPrice);
  };

  // Telegram Mock Toast dispatcher
  const triggerTelegramToast = (
    label: string,
    symbol: string,
    condition: 'above' | 'below',
    targetPrice: number,
    triggerPrice: number
  ) => {
    const toastId = `toast-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const newToast = {
      id: toastId,
      title: `pipPing Bot Notification`,
      message: `🔔 "${label}" triggered. ${symbol} went ${condition} threshold limit ${targetPrice}. Current price hit: ${triggerPrice}!`,
      timestamp
    };

    setTelegramToasts((prev) => [newToast, ...prev]);

    // Cleanup toast from screen after 8 seconds
    setTimeout(() => {
      setTelegramToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 8000);
  };

  const removeTelegramToast = (id: string) => {
    setTelegramToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Card select helper
  const handleSelectAssetFromTickers = (asset: AssetPrice) => {
    setSelectedAssetId(asset.id);
  };

  return (
    <div className="min-h-screen transition-colors duration-300 font-sans bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      {/* Visual background atmospheric lights in dark theme */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[300px] rounded-full blur-[160px] bg-emerald-500/5 pointer-events-none hidden dark:block" />
      <div className="absolute top-[400px] right-1/4 w-[500px] h-[400px] rounded-full blur-[180px] bg-emerald-600/5 pointer-events-none hidden dark:block" />

      {/* Main Container */}
      <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8 relative z-10">
        
        {/* Core Header Navigation Segment */}
        <header id="app-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-zinc-200/80 dark:border-zinc-900">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <h1 id="app-title" className="text-2xl font-bold font-sans tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-650 dark:from-zinc-50 dark:to-zinc-300 bg-clip-text text-transparent">
                pipPing
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 text-zinc-500 font-medium">
                v1.1
              </span>
            </div>
            <p id="app-subtitle" className="text-sm text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed">
              Minimalistic price alert ecosystem. Establish pricing rules for cryptocurrencies and forex, and simulated telegram notification pushes.
            </p>
          </div>

          {/* Theme switcher, current clock, statistics indicators */}
          <div className="flex items-center gap-4">
            {clockTime && (
              <div id="live-utc-clock" className="hidden lg:flex flex-col text-right font-mono text-[11px] text-zinc-455">
                <span className="text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-[9px] font-semibold">UTC System Time</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-350 tracking-wider flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3 text-emerald-500 animate-pulse" /> {clockTime}
                </span>
              </div>
            )}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </header>

        {/* Live Marketplace Pricing Tickers panel */}
        <section id="pricing-tickers-section">
          <PriceCards
            prices={prices}
            tickHistory={tickHistory}
            onSelectAsset={handleSelectAssetFromTickers}
            isRefreshing={isRefreshing}
            onManualRefresh={fetchLiveTickers}
          />
        </section>

        {/* Two-Column Setup Interface (Creation Panel left, active alerts right) */}
        <section id="alerts-workflow-section" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <AlertForm
              prices={prices}
              selectedAssetId={selectedAssetId}
              setSelectedAssetId={setSelectedAssetId}
              onAddAlert={handleAddAlert}
            />

            {/* Quick architectural statistics summary */}
            <div className="p-4 rounded-xl border dark:bg-zinc-900/30 dark:border-zinc-850 bg-zinc-100/40 border-zinc-200/60 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-[10px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Under the Hood Setup
              </h4>
              <p className="leading-relaxed text-[11px]">
                To activate push notifications onto your phone, you deploy a lightweight <strong>Cloudflare Worker</strong> cron job. The Worker polls Binance / Twelve Data APIs every 60 seconds, evaluates limits, and fires telegram alerts. No local hardware required.
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

        {/* Audit Status log history grid segment */}
        <section id="history-documentation-section" className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-12">
          {/* Left panel: Trigger notifications history logs */}
          <NotificationLogList
            logs={logs}
            onClearLogs={handleClearHistoryLogs}
          />

          {/* Right panel: Tabbed setup deployment guides */}
          <DeveloperDocs />
        </section>

        {/* Simple Footer */}
        <footer id="app-footer" className="pt-10 border-t border-zinc-250 dark:border-zinc-900 text-center text-xs text-zinc-440 dark:text-zinc-500 space-y-1">
          <p className="font-mono text-[10px] flex items-center justify-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-500" /> pipPing Alerting Architecture • Zero External Overhead
          </p>
          <p>
            Made with React 19, CSS Modern variables, and Tailwind CSS v4.
          </p>
        </footer>

        {/* ========================================================================= */}
        {/* SIMULATED TELEGRAM OVERLAY PUSH TOASTS SYSTEM */}
        {/* ========================================================================= */}
        <div
          id="telegram-simulation-overlay"
          className="fixed bottom-5 right-5 z-50 space-y-3.5 max-w-sm w-full font-sans select-none pointer-events-none"
        >
          {telegramToasts.map((toast) => (
            <div
              id={`tg-toast-${toast.id}`}
              key={toast.id}
              className="p-4 rounded-xl border pointer-events-auto shadow-2xl transition-all duration-300 bg-white/95 dark:bg-zinc-950/95 border-zinc-200 dark:border-sky-500/30 flex gap-3.5 relative overflow-hidden animate-slide-in"
              style={{
                animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}
            >
              {/* Blue sidebar accent strip reminding of Telegram brand */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500" />

              {/* Bot Icon */}
              <div className="p-2.5 rounded-full bg-sky-500/10 text-sky-500 shrink-0 h-10 w-10 flex items-center justify-center leading-none">
                <Send className="w-5 h-5" />
              </div>

              {/* Message Details */}
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-sky-500 uppercase tracking-wide">
                    {toast.title}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {toast.timestamp}
                  </span>
                </div>
                <p className="text-xs text-zinc-650 dark:text-zinc-200 font-medium leading-relaxed">
                  {toast.message}
                </p>
                <div className="pt-1.5 flex items-center justify-between text-[9px] font-mono text-zinc-400">
                  <span>🚀 TeleBot API Push</span>
                  <span>Swipe to dismiss</span>
                </div>
              </div>

              {/* Dismiss Cross handle */}
              <button
                id={`btn-close-toast-${toast.id}`}
                onClick={() => removeTelegramToast(toast.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 absolute top-2.5 right-2.5 cursor-pointer leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Global Keyframe CSS overrides inside index.css for smooth slideIn popups layout */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(20px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}} />

      </div>
    </div>
  );
}
