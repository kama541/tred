import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts';
import {
  Brain,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { CandleData, Timeframe, AnalysisResult } from '../../types';
import { fetchLiveKlines } from '../../services/marketData';
import { formatAssetPrice } from '../../lib/formatPrice';

interface InteractiveChartProps {
  symbol?: string;
  timeframe?: Timeframe;
  onSymbolChange?: (symbol: string) => void;
  onTimeframeChange?: (tf: Timeframe) => void;
  onSendToAnalyzer?: (symbol: string, timeframe: Timeframe, candles: CandleData[]) => void;
  activeSetup?: AnalysisResult | null;
}

// ─── Mathematical Indicator Engine (TradingView & TA-Lib Standard) ─────────────

/**
 * Exponential Moving Average (EMA)
 * Formula:
 *  - Seed: SMA of first `period` closes
 *  - Multiplier: k = 2 / (period + 1)
 *  - Next: EMA_t = Close_t * k + EMA_(t-1) * (1 - k)
 */
function computeEMA(
  closes: number[],
  period: number,
  times: number[]
): { time: any; value: number }[] {
  const res: { time: any; value: number }[] = [];
  if (closes.length < period) return res;

  const k = 2 / (period + 1);

  // Initial SMA seed
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  res.push({ time: times[period - 1] as any, value: Number(ema.toFixed(5)) });

  // Exponential loop
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    res.push({ time: times[i] as any, value: Number(ema.toFixed(5)) });
  }

  return res;
}

/**
 * Relative Strength Index (RSI) - J. Welles Wilder
 * Formula:
 *  - First period: Simple average of gains and losses
 *  - Wilder's Smoothing: AvgGain_t = (AvgGain_(t-1) * (period - 1) + Gain_t) / period
 *  - RS = AvgGain / AvgLoss
 *  - RSI = 100 - (100 / (1 + RS))
 */
function computeRSI(
  closes: number[],
  times: number[],
  period = 14
): { time: any; value: number }[] {
  const res: { time: any; value: number }[] = [];
  if (closes.length < period + 1) return res;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const initialRs = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : avgGain / avgLoss;
  const initialRsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + initialRs);
  res.push({ time: times[period] as any, value: Number(initialRsi.toFixed(2)) });

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + rs);
    res.push({ time: times[i] as any, value: Number(rsi.toFixed(2)) });
  }

  return res;
}

/**
 * Moving Average Convergence Divergence (MACD) - Gerald Appel
 * Formula:
 *  - MACD Line = EMA(fast) - EMA(slow)
 *  - Signal Line = EMA(signal) of MACD Line
 *  - Histogram = MACD Line - Signal Line
 */
function computeMACD(
  closes: number[],
  times: number[],
  fast = 12,
  slow = 26,
  signal = 9
): {
  macd: { time: any; value: number }[];
  signal: { time: any; value: number }[];
  histogram: { time: any; value: number; color: string }[];
} {
  const emaFast = computeEMA(closes, fast, times);
  const emaSlow = computeEMA(closes, slow, times);

  const slowMap = new Map<number, number>(emaSlow.map((d) => [d.time, d.value]));
  const macdLine: { time: any; value: number }[] = [];

  for (const f of emaFast) {
    if (slowMap.has(f.time)) {
      macdLine.push({
        time: f.time,
        value: Number((f.value - slowMap.get(f.time)!).toFixed(5)),
      });
    }
  }

  const macdValues = macdLine.map((d) => d.value);
  const macdTimes = macdLine.map((d) => d.time as number);
  const signalLine = computeEMA(macdValues, signal, macdTimes);

  const signalMap = new Map<number, number>(signalLine.map((d) => [d.time, d.value]));
  const histogram: { time: any; value: number; color: string }[] = [];

  for (const m of macdLine) {
    if (signalMap.has(m.time)) {
      const h = m.value - signalMap.get(m.time)!;
      histogram.push({
        time: m.time,
        value: Number(h.toFixed(5)),
        color: h >= 0 ? 'rgba(0, 240, 168, 0.75)' : 'rgba(244, 63, 94, 0.75)',
      });
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  symbol = 'BTC/USDT',
  timeframe = '1h',
  onSymbolChange,
  onTimeframeChange,
  onSendToAnalyzer,
  activeSetup,
}) => {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const mainChart = useRef<IChartApi | null>(null);
  const rsiChart = useRef<IChartApi | null>(null);
  const macdChart = useRef<IChartApi | null>(null);

  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Series = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistSeries = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [currentSymbol, setCurrentSymbol] = useState<string>(symbol);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>(timeframe);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Indicator Toggles
  const [showEma20, setShowEma20] = useState<boolean>(true);
  const [showEma50, setShowEma50] = useState<boolean>(true);
  const [showEma200, setShowEma200] = useState<boolean>(true);
  const [showRsi, setShowRsi] = useState<boolean>(true);
  const [showMacd, setShowMacd] = useState<boolean>(true);
  const [showLevels, setShowLevels] = useState<boolean>(true);

  // Dynamic values shown on header (updated on hover or defaults to latest candle)
  const [displayRsi, setDisplayRsi] = useState<number | null>(null);
  const [displayMacd, setDisplayMacd] = useState<number | null>(null);
  const [displayMacdSignal, setDisplayMacdSignal] = useState<number | null>(null);
  const [displayEma20, setDisplayEma20] = useState<number | null>(null);
  const [displayEma50, setDisplayEma50] = useState<number | null>(null);
  const [displayEma200, setDisplayEma200] = useState<number | null>(null);

  // Lookup caches for fast O(1) crosshair queries
  const indicatorCache = useRef<{
    rsi: Map<number, number>;
    macd: Map<number, { macd: number; sig: number }>;
    ema20: Map<number, number>;
    ema50: Map<number, number>;
    ema200: Map<number, number>;
    latest: {
      rsi: number | null;
      macd: number | null;
      macdSig: number | null;
      ema20: number | null;
      ema50: number | null;
      ema200: number | null;
    };
  }>({
    rsi: new Map(),
    macd: new Map(),
    ema20: new Map(),
    ema50: new Map(),
    ema200: new Map(),
    latest: { rsi: null, macd: null, macdSig: null, ema20: null, ema50: null, ema200: null },
  });

  const symbolsList = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'NAS100', 'US30'];
  const timeframesList: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

  // Load candles
  const loadCandleData = useCallback(async (sym: string, tf: Timeframe) => {
    setLoading(true);
    const data = await fetchLiveKlines(sym, tf);
    setCandles(data);
    setLoading(false);
  }, []);

  useEffect(() => { setCurrentSymbol(symbol); }, [symbol]);
  useEffect(() => { setCurrentTimeframe(timeframe); }, [timeframe]);
  useEffect(() => { loadCandleData(currentSymbol, currentTimeframe); }, [currentSymbol, currentTimeframe, loadCandleData]);

  // ── Shared chart styling ──
  const chartOpts = {
    layout: {
      background: { type: ColorType.Solid, color: '#090D15' },
      textColor: '#94A3B8',
      fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#38BDF8', width: 1 as 1, style: LineStyle.Dotted, labelBackgroundColor: '#1E293B' },
      horzLine: { color: '#38BDF8', width: 1 as 1, style: LineStyle.Dotted, labelBackgroundColor: '#1E293B' },
    },
    timeScale: { borderColor: '#1E293B', timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: '#1E293B' },
    handleScroll: true,
    handleScale: true,
  };

  // ── Initialize Main Chart ──
  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.innerHTML = '';

    const chart = createChart(mainRef.current, {
      ...chartOpts,
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.08, bottom: 0.22 } },
    });
    mainChart.current = chart;

    candleSeries.current = chart.addCandlestickSeries({
      upColor: '#00F0A8',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#00F0A8',
      wickDownColor: '#F43F5E',
    });

    const vol = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.current = vol;

    ema20Series.current = chart.addLineSeries({ color: '#38BDF8', lineWidth: 2, title: 'EMA 20', priceLineVisible: false });
    ema50Series.current = chart.addLineSeries({ color: '#F59E0B', lineWidth: 2, title: 'EMA 50', priceLineVisible: false });
    ema200Series.current = chart.addLineSeries({ color: '#A855F7', lineWidth: 2, title: 'EMA 200', priceLineVisible: false });

    // Crosshair inspection tracking for precision
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        const l = indicatorCache.current.latest;
        setDisplayRsi(l.rsi);
        setDisplayMacd(l.macd);
        setDisplayMacdSignal(l.macdSig);
        setDisplayEma20(l.ema20);
        setDisplayEma50(l.ema50);
        setDisplayEma200(l.ema200);
        return;
      }
      const t = Number(param.time);
      const cache = indicatorCache.current;
      if (cache.rsi.has(t)) setDisplayRsi(cache.rsi.get(t)!);
      if (cache.macd.has(t)) {
        const m = cache.macd.get(t)!;
        setDisplayMacd(m.macd);
        setDisplayMacdSignal(m.sig);
      }
      if (cache.ema20.has(t)) setDisplayEma20(cache.ema20.get(t)!);
      if (cache.ema50.has(t)) setDisplayEma50(cache.ema50.get(t)!);
      if (cache.ema200.has(t)) setDisplayEma200(cache.ema200.get(t)!);
    });

    const resize = () => {
      if (mainRef.current) chart.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, []);

  // ── Initialize RSI Sub-chart ──
  useEffect(() => {
    if (!rsiRef.current) return;
    rsiRef.current.innerHTML = '';

    const chart = createChart(rsiRef.current, {
      ...chartOpts,
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1E293B', timeVisible: false, secondsVisible: false },
    });
    rsiChart.current = chart;

    rsiSeries.current = chart.addLineSeries({
      color: '#F472B6',
      lineWidth: 2,
      title: 'RSI 14',
      priceLineVisible: false,
    });

    // Overbought (70) and Oversold (30) levels
    rsiSeries.current.createPriceLine({
      price: 70,
      color: 'rgba(244,63,94,0.6)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'OB 70',
    });
    rsiSeries.current.createPriceLine({
      price: 30,
      color: 'rgba(0,240,168,0.6)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'OS 30',
    });
    rsiSeries.current.createPriceLine({
      price: 50,
      color: 'rgba(148,163,184,0.3)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    });

    const resize = () => {
      if (rsiRef.current) chart.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, []);

  // ── Initialize MACD Sub-chart ──
  useEffect(() => {
    if (!macdRef.current) return;
    macdRef.current.innerHTML = '';

    const chart = createChart(macdRef.current, {
      ...chartOpts,
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1E293B', timeVisible: true, secondsVisible: false },
    });
    macdChart.current = chart;

    macdHistSeries.current = chart.addHistogramSeries({ priceScaleId: 'right', priceLineVisible: false });
    macdLineSeries.current = chart.addLineSeries({ color: '#38BDF8', lineWidth: 2, title: 'MACD', priceLineVisible: false });
    macdSignalSeries.current = chart.addLineSeries({ color: '#F59E0B', lineWidth: 2, title: 'Signal', priceLineVisible: false });

    // Zero line
    macdLineSeries.current.createPriceLine({
      price: 0,
      color: 'rgba(148,163,184,0.35)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    });

    const resize = () => {
      if (macdRef.current) chart.applyOptions({ width: macdRef.current.clientWidth, height: macdRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, []);

  // ── Synchronize Time Scale & Crosshair across all charts ──
  useEffect(() => {
    const charts = [mainChart.current, rsiChart.current, macdChart.current].filter(Boolean) as IChartApi[];
    if (charts.length < 2) return;

    const unsubs: (() => void)[] = [];

    charts.forEach((src, i) => {
      const handler = (range: any) => {
        if (!range) return;
        charts.forEach((dst, j) => {
          if (i !== j) {
            dst.timeScale().setVisibleLogicalRange(range);
          }
        });
      };
      src.timeScale().subscribeVisibleLogicalRangeChange(handler);
      unsubs.push(() => src.timeScale().unsubscribeVisibleLogicalRangeChange(handler));
    });

    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Compute and Feed Exact Indicator Data ──
  useEffect(() => {
    if (!candleSeries.current || !volumeSeries.current || candles.length === 0) return;

    // Sort chronologically ascending
    const sorted = [...candles].sort((a, b) => Number(a.time) - Number(b.time));
    const closes = sorted.map((c) => c.close);
    const times = sorted.map((c) => Number(c.time));

    // Update Candles & Volume
    candleSeries.current.setData(sorted.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })));

    volumeSeries.current.setData(sorted.map((c) => ({
      time: c.time as any,
      value: c.volume || 1000,
      color: c.close >= c.open ? 'rgba(0,240,168,0.25)' : 'rgba(244,63,94,0.25)',
    })));

    // 1. Exact EMA Calculations
    const ema20Data = computeEMA(closes, 20, times);
    const ema50Data = computeEMA(closes, 50, times);
    const ema200Data = computeEMA(closes, 200, times);

    if (ema20Series.current) ema20Series.current.setData(showEma20 ? ema20Data : []);
    if (ema50Series.current) ema50Series.current.setData(showEma50 ? ema50Data : []);
    if (ema200Series.current) ema200Series.current.setData(showEma200 ? ema200Data : []);

    // 2. Exact RSI Calculation (Wilder 14)
    const rsiData = computeRSI(closes, times, 14);
    if (rsiSeries.current) rsiSeries.current.setData(showRsi ? rsiData : []);

    // 3. Exact MACD Calculation (12, 26, 9)
    const { macd, signal, histogram } = computeMACD(closes, times, 12, 26, 9);
    if (macdLineSeries.current && macdSignalSeries.current && macdHistSeries.current) {
      macdLineSeries.current.setData(showMacd ? macd : []);
      macdSignalSeries.current.setData(showMacd ? signal : []);
      macdHistSeries.current.setData(showMacd ? histogram : []);
    }

    // Build Fast Lookup Cache for Crosshair Queries
    const rsiMap = new Map<number, number>(rsiData.map((d) => [Number(d.time), d.value]));
    const ema20Map = new Map<number, number>(ema20Data.map((d) => [Number(d.time), d.value]));
    const ema50Map = new Map<number, number>(ema50Data.map((d) => [Number(d.time), d.value]));
    const ema200Map = new Map<number, number>(ema200Data.map((d) => [Number(d.time), d.value]));

    const macdMap = new Map<number, { macd: number; sig: number }>();
    const sigMap = new Map<number, number>(signal.map((d) => [Number(d.time), d.value]));
    for (const m of macd) {
      const t = Number(m.time);
      if (sigMap.has(t)) {
        macdMap.set(t, { macd: m.value, sig: sigMap.get(t)! });
      }
    }

    const latestRsi = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : null;
    const latestMacd = macd.length > 0 ? macd[macd.length - 1].value : null;
    const latestSig = signal.length > 0 ? signal[signal.length - 1].value : null;
    const latestEma20 = ema20Data.length > 0 ? ema20Data[ema20Data.length - 1].value : null;
    const latestEma50 = ema50Data.length > 0 ? ema50Data[ema50Data.length - 1].value : null;
    const latestEma200 = ema200Data.length > 0 ? ema200Data[ema200Data.length - 1].value : null;

    indicatorCache.current = {
      rsi: rsiMap,
      macd: macdMap,
      ema20: ema20Map,
      ema50: ema50Map,
      ema200: ema200Map,
      latest: {
        rsi: latestRsi,
        macd: latestMacd,
        macdSig: latestSig,
        ema20: latestEma20,
        ema50: latestEma50,
        ema200: latestEma200,
      },
    };

    setDisplayRsi(latestRsi);
    setDisplayMacd(latestMacd);
    setDisplayMacdSignal(latestSig);
    setDisplayEma20(latestEma20);
    setDisplayEma50(latestEma50);
    setDisplayEma200(latestEma200);

    mainChart.current?.timeScale().fitContent();
  }, [candles, showEma20, showEma50, showEma200, showRsi, showMacd]);

  // ── Draw Trade Setup Levels (Entry, SL, TP) ──
  useEffect(() => {
    if (!candleSeries.current || !showLevels || !activeSetup || activeSetup.symbol !== currentSymbol) return;
    const series = candleSeries.current;

    const entryLine = series.createPriceLine({
      price: activeSetup.entryZone.optimal,
      color: '#38BDF8',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `ENTRY: ${formatAssetPrice(activeSetup.entryZone.optimal, symbol)}`,
    });

    const slLine = series.createPriceLine({
      price: activeSetup.stopLoss,
      color: '#F43F5E',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `SL: ${formatAssetPrice(activeSetup.stopLoss, symbol)}`,
    });

    const tp1Line = series.createPriceLine({
      price: activeSetup.takeProfit1,
      color: '#00F0A8',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `TP1: ${formatAssetPrice(activeSetup.takeProfit1, symbol)}`,
    });

    return () => {
      try {
        series.removePriceLine(entryLine);
        series.removePriceLine(slLine);
        series.removePriceLine(tp1Line);
      } catch {}
    };
  }, [activeSetup, currentSymbol, showLevels, symbol]);

  const latestCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0;
  const priceChangePercent = latestCandle && prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  // Real-time interpretations
  const rsiVal = displayRsi;
  const rsiColor = rsiVal !== null ? (rsiVal >= 70 ? '#F43F5E' : rsiVal <= 30 ? '#00F0A8' : '#F472B6') : '#F472B6';
  const rsiLabel = rsiVal !== null ? (rsiVal >= 70 ? 'OB (Haddan tashqari xarid)' : rsiVal <= 30 ? 'OS (Haddan tashqari sotuv)' : 'Normal (30-70)') : '';
  const macdBull = displayMacd !== null && displayMacdSignal !== null && displayMacd > displayMacdSignal;

  return (
    <div className="flex flex-col h-full bg-[#090D15] rounded-xl border border-[#1B2436] overflow-hidden">
      {/* ── Top Toolbar ── */}
      <div className="px-4 py-3 border-b border-[#1B2436] flex flex-wrap items-center justify-between gap-3 bg-[#0C121D]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={currentSymbol}
              onChange={(e) => {
                const s = e.target.value;
                setCurrentSymbol(s);
                if (onSymbolChange) onSymbolChange(s);
              }}
              className="bg-[#121927] border border-[#202D44] text-white font-mono font-bold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {symbolsList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {latestCandle && (
              <div className="flex items-center gap-2 font-mono text-sm pl-2">
                <span className="font-bold text-white text-base">
                  {formatAssetPrice(latestCandle.close, symbol)}
                </span>
                <span
                  className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded ${
                    priceChange >= 0
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {priceChange >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                  )}
                  {priceChangePercent >= 0 ? '+' : ''}
                  {priceChangePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* Timeframe Buttons */}
          <div className="hidden md:flex items-center bg-[#121927] p-1 rounded-lg border border-[#202D44] gap-0.5">
            {timeframesList.map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  setCurrentTimeframe(tf);
                  if (onTimeframeChange) onTimeframeChange(tf);
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                  currentTimeframe === tf
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Indicator Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setShowEma20(!showEma20)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma20
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 20 {displayEma20 !== null && showEma20 && <span className="opacity-75">({displayEma20.toFixed(1)})</span>}
            </button>
            <button
              onClick={() => setShowEma50(!showEma50)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma50
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 50 {displayEma50 !== null && showEma50 && <span className="opacity-75">({displayEma50.toFixed(1)})</span>}
            </button>
            <button
              onClick={() => setShowEma200(!showEma200)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma200
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 200 {displayEma200 !== null && showEma200 && <span className="opacity-75">({displayEma200.toFixed(1)})</span>}
            </button>
            <button
              onClick={() => setShowRsi(!showRsi)}
              className={`px-2 py-1 rounded border transition-colors ${
                showRsi
                  ? 'bg-pink-500/15 border-pink-500/40 text-pink-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              RSI 14
            </button>
            <button
              onClick={() => setShowMacd(!showMacd)}
              className={`px-2 py-1 rounded border transition-colors ${
                showMacd
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              MACD
            </button>
            <button
              onClick={() => setShowLevels(!showLevels)}
              className={`px-2 py-1 rounded border transition-colors ${
                showLevels
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              Darajalar
            </button>
          </div>

          {/* AI Scan Button */}
          {onSendToAnalyzer && (
            <button
              onClick={() => onSendToAnalyzer(currentSymbol, currentTimeframe, candles)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#07090E] px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all shadow-sm shadow-emerald-500/20 active:scale-95"
            >
              <Brain className="w-3.5 h-3.5 fill-current" />
              <span>AI BILAN SKANERLASH</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main Candlestick Chart ── */}
      <div className="relative flex-1 w-full min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090D15]/80 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mb-2" />
            <span className="text-xs font-mono text-slate-400">Jonli bozor shamchalar yuklanmoqda...</span>
          </div>
        )}
        <div ref={mainRef} className="w-full h-full" />

        {/* Legend Overlay */}
        <div className="absolute top-3 left-4 z-10 pointer-events-none flex items-center gap-3 text-[11px] font-mono bg-[#090D15]/85 px-2.5 py-1 rounded border border-[#1E293B]">
          <span className="text-slate-300 font-bold">{currentSymbol}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">{currentTimeframe}</span>
          {showEma20 && displayEma20 !== null && (
            <span className="text-sky-400">EMA20: {displayEma20.toFixed(2)}</span>
          )}
          {showEma50 && displayEma50 !== null && (
            <span className="text-amber-400">EMA50: {displayEma50.toFixed(2)}</span>
          )}
          {showEma200 && displayEma200 !== null && (
            <span className="text-purple-400">EMA200: {displayEma200.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* ── RSI Sub-chart Panel ── */}
      {showRsi && (
        <div className="w-full border-t border-[#1B2436]" style={{ height: 95 }}>
          <div className="flex items-center gap-3 px-3 py-0.5 bg-[#0C121D] border-b border-[#1B2436] text-[10px] font-mono">
            <span className="text-pink-400 font-bold">RSI (14)</span>
            {rsiVal !== null && (
              <>
                <span style={{ color: rsiColor }} className="font-bold text-[11px]">
                  {rsiVal.toFixed(2)}
                </span>
                <span
                  style={{
                    color: rsiColor,
                    backgroundColor:
                      rsiVal >= 70
                        ? 'rgba(244,63,94,0.15)'
                        : rsiVal <= 30
                        ? 'rgba(0,240,168,0.15)'
                        : 'rgba(244,114,182,0.1)',
                  }}
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                >
                  {rsiLabel}
                </span>
                <span className="text-slate-500 hidden sm:inline">
                  (70+ Ko'p olingan / 30- Ko'p sotilgan)
                </span>
              </>
            )}
          </div>
          <div ref={rsiRef} className="w-full" style={{ height: 72 }} />
        </div>
      )}

      {/* ── MACD Sub-chart Panel ── */}
      {showMacd && (
        <div className="w-full border-t border-[#1B2436]" style={{ height: 105 }}>
          <div className="flex items-center gap-3 px-3 py-0.5 bg-[#0C121D] border-b border-[#1B2436] text-[10px] font-mono">
            <span className="text-cyan-400 font-bold">MACD (12, 26, 9)</span>
            {displayMacd !== null && (
              <span className="text-sky-400 font-bold">
                MACD: {displayMacd.toFixed(4)}
              </span>
            )}
            {displayMacdSignal !== null && (
              <span className="text-amber-400 font-bold">
                SIG: {displayMacdSignal.toFixed(4)}
              </span>
            )}
            {displayMacd !== null && displayMacdSignal !== null && (
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  macdBull ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {macdBull ? '▲ BULLISH (O\'sish signali)' : '▼ BEARISH (Tushish signali)'}
              </span>
            )}
          </div>
          <div ref={macdRef} className="w-full" style={{ height: 78 }} />
        </div>
      )}
    </div>
  );
};
