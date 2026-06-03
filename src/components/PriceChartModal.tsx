/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-screen chart modal. TradingView Lightweight Charts (v5).
 *
 * - Candlestick series fed by /api/history/:assetId
 * - Interval switcher: 1m | 5m | 15m | 1h | 4h | 1D
 * - Each active alert for this asset becomes a horizontal priceLine at
 *   its target price, color-coded by status
 * - Each past trigger (NotificationLog for this asset) becomes a marker
 * - "Create alert" button prefills the parent form and closes the modal
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { X, RefreshCcw, Loader2, AlertCircle, LineChart, Plus, Trash2, Maximize2, Minimize2, Crosshair } from 'lucide-react';
import { AssetPrice, AssetCategory, Alert, NotificationLog } from '../types';
import { api, type IntervalKey } from '../api';

interface PriceChartModalProps {
  asset: AssetPrice;
  alerts: Alert[];
  logs: NotificationLog[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onCreateAlert: (input: {
    assetId: string;
    assetName: string;
    symbol: string;
    category: AssetCategory;
    targetPrice: number;
  }) => void;
  onDeleteAlert?: (id: string) => void;
}

const INTERVAL_OPTIONS: { key: IntervalKey; label: string; defaultOutput: number }[] = [
  { key: '5m', label: '5m', defaultOutput: 300 },
  { key: '15m', label: '15m', defaultOutput: 300 },
  { key: '1h', label: '1h', defaultOutput: 200 },
];

const COLORS = {
  dark: {
    bg: '#09090b', // zinc-950
    text: '#d4d4d8', // zinc-300
    grid: '#27272a', // zinc-800
    border: '#27272a',
    up: '#10b981', // emerald-500
    down: '#f43f5e', // rose-500
  },
  light: {
    bg: '#ffffff',
    text: '#3f3f46', // zinc-700
    grid: '#e4e4e7', // zinc-200
    border: '#e4e4e7',
    up: '#10b981',
    down: '#f43f5e',
  },
};

export default function PriceChartModal({
  asset,
  alerts,
  logs,
  theme,
  onClose,
  onCreateAlert,
  onDeleteAlert,
}: PriceChartModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const previewLineRef = useRef<IPriceLine | null>(null);

  const [interval, setInterval_] = useState<IntervalKey>('15m');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [placeMode, setPlaceMode] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<number>(0);

  // Filter to only this asset's alerts/logs once (memoized).
  const assetAlerts = useMemo(
    () => alerts.filter((a) => a.assetId === asset.id),
    [alerts, asset.id],
  );
  const assetLogs = useMemo(
    () => logs.filter((l) => l.alertId && assetAlerts.some((a) => a.id === l.alertId)),
    [logs, assetAlerts],
  );

  // The current visible price, for the "Create alert here" button.
  const currentPrice = useMemo(() => {
    const last = asset.price;
    return last && isFinite(last) && last > 0 ? last : null;
  }, [asset.price]);

  // ---- Mount chart once; update theme when it changes ----
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const palette = COLORS[theme];

    // Measure the container up front. On mobile the modal is mounted in a
    // transition (slides up from the bottom), so the container might be 0px
    // tall on the very first paint. We grab whatever size we can, then
    // explicitly resize on the next frame and on every container resize.
    const initialRect = container.getBoundingClientRect();
    const chart = createChart(container, {
      width: Math.max(initialRect.width, 1),
      height: Math.max(initialRect.height, 1),
      // autoSize adds lightweight-charts' own ResizeObserver so the chart
      // tracks container size changes automatically. We also do an explicit
      // resize below (see the `resize()` closure) to catch the first paint.
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
        // Don't auto-add right margin on mobile — keeps candles filling the
        // available width instead of being squeezed into the middle.
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
      },
      // handleScroll = drag/touch PAN, NOT wheel.
      //   v5 made this confusing: `mouseWheel` here used to mean "scroll the
      //   visible range" (horizontal pan) which conflicts with the zoom
      //   behaviour in handleScale. We disable it so the wheel zooms only,
      //   and pan is done by drag (pressedMouseMove) or touch.
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      // handleScale = wheel ZOOM, pinch, axis drag-to-zoom, dbl-click reset.
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
      kineticScroll: { mouse: true, touch: true },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: {
        type: 'price',
        precision: asset.category === 'forex' ? 5 : 2,
        minMove: asset.category === 'forex' ? 0.00001 : 0.01,
      },
    });
    seriesRef.current = series;
    try {
      markersRef.current = createSeriesMarkers(series);
    } catch (err) {
      console.warn('Failed to initialize chart markers:', err);
      markersRef.current = null;
    }

    // Belt-and-suspenders: re-fit the chart to its container after the
    // first paint, and on every container / viewport resize. This catches
    // the case where the modal animates in and the chart initially renders
    // at 0×0, and orientation changes on mobile.
    let raf1 = 0;
    let raf2 = 0;
    const resize = () => {
      const r = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        chart.applyOptions({ width: r.width, height: r.height });
      }
    };
    raf1 = requestAnimationFrame(resize);
    raf2 = requestAnimationFrame(() => resize());

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const onWindowResize = () => resize();
    window.addEventListener('resize', onWindowResize);
    window.visualViewport?.addEventListener('resize', onWindowResize);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.visualViewport?.removeEventListener('resize', onWindowResize);
      priceLinesRef.current.clear();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
    // Intentionally only re-mount when asset or theme flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, theme]);

  // ---- Update theme without remount when only `theme` changes ----
  useEffect(() => {
    if (!chartRef.current) return;
    const palette = COLORS[theme];
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
    });
  }, [theme]);

  // ---- Fetch + render candle history whenever asset or interval changes ----
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const opt = INTERVAL_OPTIONS.find((o) => o.key === interval) ?? INTERVAL_OPTIONS[1];
    api
      .getHistory(asset.id, interval, opt.defaultOutput)
      .then((data) => {
        if (cancelled) return;
        if (!data.length) {
          setError('No history returned for this interval. The provider may be rate-limited or this symbol may be unsupported.');
          setCandles(0);
          return;
        }
        const series = seriesRef.current!;
        // Set data (replaces any previous).
        series.setData(
          data.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        // Fit the visible range to the data.
        chartRef.current?.timeScale().fitContent();
        setCandles(data.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message || 'Failed to load history');
        setCandles(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, interval, reloadKey]);

  // ---- (Re)draw alert price lines whenever alerts or theme change ----
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    // Wipe old lines.
    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current.clear();

    // Active -> emerald solid; inactive -> zinc dashed.
    const palette = COLORS[theme];
    for (const a of assetAlerts) {
      const color = a.isActive ? palette.up : '#71717a'; // zinc-500
      const lineStyle: LineStyle = a.isActive ? LineStyle.Solid : LineStyle.Dashed;
      const title = `${a.isActive ? '●' : '○'} ${truncate(a.label, 18)} @ ${a.targetPrice}`;
      const line = series.createPriceLine({
        price: a.targetPrice,
        color,
        lineWidth: 2,
        lineStyle,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.set(a.id, line);
    }
  }, [assetAlerts, theme]);

  // ---- (Re)draw trigger markers whenever logs change ----
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    const palette = COLORS[theme];
    const ms: SeriesMarker<Time>[] = assetLogs
      .map((l) => {
        const t = Math.floor(new Date(l.timestamp).getTime() / 1000);
        if (!isFinite(t) || t <= 0) return null;
        return {
          time: t as UTCTimestamp,
          position: l.condition === 'above' ? 'belowBar' : 'aboveBar',
          color: palette.up,
          shape: l.condition === 'above' ? 'arrowUp' : 'arrowDown',
          text: `Fired @ ${l.triggerPrice}`,
        } as SeriesMarker<Time>;
      })
      .filter((m): m is SeriesMarker<Time> => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    try {
      markers.setMarkers(ms);
    } catch (err) {
      console.warn('Failed to update chart markers:', err);
    }
  }, [assetLogs, theme]);

  // ---- Tap-to-place alert mode ----
  // Stable callback ref so the placement effect doesn't tear down on every
  // parent re-render (parent's onCreateAlert/onClose may not be memoized).
  const placeRef = useRef({ onCreateAlert, onClose, asset, currentPrice });
  placeRef.current = { onCreateAlert, onClose, asset, currentPrice };

  useEffect(() => {
    if (!placeMode) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const palette = COLORS[theme];
    const startPrice = placeRef.current.currentPrice ?? 0;
    let line: IPriceLine | null = null;
    try {
      line = series.createPriceLine({
        price: startPrice,
        color: palette.up,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '◎ New alert',
      });
      previewLineRef.current = line;
    } catch (err) {
      console.warn('Failed to create preview line:', err);
    }

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.point || !line) return;
      const p = series.coordinateToPrice(param.point.y);
      if (p === null) return;
      try {
        line.applyOptions({ price: Number(p) });
      } catch {
        /* line may have been removed mid-cycle */
      }
    };

    const onClick = (param: MouseEventParams<Time>) => {
      if (!param.point) return;
      const p = series.coordinateToPrice(param.point.y);
      if (p === null) return;
      const price = Number(p);
      if (!isFinite(price) || price <= 0) return;
      const { onCreateAlert, onClose, asset } = placeRef.current;
      onCreateAlert({
        assetId: asset.id,
        assetName: asset.name,
        symbol: asset.symbol,
        category: asset.category,
        targetPrice: price,
      });
      setPlaceMode(false);
      onClose();
    };

    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      if (line) {
        try {
          series.removePriceLine(line);
        } catch {
          /* chart/series may already be gone */
        }
      }
      previewLineRef.current = null;
    };
  }, [placeMode, theme, asset.id]);

  // ---- ESC: cancel placement mode first, then close the modal ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (placeMode) {
        setPlaceMode(false);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, placeMode]);

  const handleCreateAlertHere = () => {
    if (!currentPrice) return;
    onCreateAlert({
      assetId: asset.id,
      assetName: asset.name,
      symbol: asset.symbol,
      category: asset.category,
      targetPrice: currentPrice,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${asset.symbol} price chart`}
      className={`fixed inset-0 z-50 flex flex-col items-center sm:justify-center bg-zinc-950/95 sm:bg-zinc-950/70 ${isFullscreen ? '' : 'sm:backdrop-blur-sm'}`}
      onClick={onClose}
    >
      <div
        className={`w-full h-[100dvh] flex flex-col bg-white dark:bg-zinc-950 overflow-hidden ${
          isFullscreen
            ? 'max-w-none sm:max-w-none sm:max-h-none sm:rounded-none'
            : 'max-w-[385px] sm:max-w-6xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-zinc-200 sm:dark:border-zinc-800 sm:shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== Mobile drag handle (iOS-sheet affordance) ===== */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <span className="block w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* ===== Top bar ===== */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2 sm:py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chart"
              className="p-2 -ml-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 touch-target shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0 hidden sm:block">
              <LineChart className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-bold truncate">{asset.symbol}</span>
                {currentPrice !== null && (
                  <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 sm:hidden shrink-0">
                    {formatPriceShort(currentPrice, asset.category)}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-zinc-400 truncate">
                {loading
                  ? 'Loading…'
                  : error
                    ? `History unavailable ${asset.symbol}`
                    : `${candles} candles · ${interval}`}
                {assetAlerts.length > 0 && (
                  <>
                    {' · '}
                    {assetAlerts.length} alert{assetAlerts.length === 1 ? '' : 's'}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 touch-target"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setPlaceMode((m) => !m)}
              aria-label={placeMode ? 'Cancel placement' : 'Tap chart to place alert'}
              aria-pressed={placeMode}
              title={placeMode ? 'Cancel placement (ESC)' : 'Tap chart to place alert'}
              className={`p-2 rounded-lg touch-target transition-colors ${
                placeMode
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/40'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Crosshair className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCreateAlertHere}
              disabled={!currentPrice}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 sm:px-3 py-2 rounded-lg text-xs font-semibold touch-target
                bg-emerald-500 hover:bg-emerald-600 text-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed"
              title={`Create an alert at the current price (${currentPrice ?? '—'})`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alert at current</span>
              <span className="sm:hidden">Alert</span>
            </button>
          </div>
        </div>

        {/* ===== Chart (flex-1 with min-h-0 so the parent flex doesn't blow up) ===== */}
        <div className="relative flex-1 min-h-[260px] min-w-0">
          <div
            ref={containerRef}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: 'none', cursor: placeMode ? 'crosshair' : undefined }}
          />
          {placeMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-mono font-semibold ring-1 ring-sky-500/30 backdrop-blur-sm whitespace-nowrap">
                <Crosshair className="w-3 h-3" />
                Tap chart to place alert · ESC to cancel
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/80 text-zinc-100 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading {interval} history…
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div className="flex items-start gap-2 p-4 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs max-w-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-0.5">Could not load history</div>
                  <div className="opacity-90">{error}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== Bottom toolbar: interval switcher + reload + alerts toggle ===== */}
        <div className="flex items-center gap-1 px-2 sm:px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setInterval_(opt.key)}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap touch-target ${
                  interval === opt.key
                    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md touch-target shrink-0"
            title="Reload"
            aria-label="Reload"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>        
      </div>
    </div>
  );
}

function formatPriceShort(price: number, category: string): string {
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
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
