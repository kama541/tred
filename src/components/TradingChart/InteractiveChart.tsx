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
  Maximize2,
  TrendingUp,
  Brain,
  Layers,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Check,
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

// ─── Indicator Math ───────────────────────────────────────────────────────────

function computeEMA(closes: number[], period: number, times: number[]): { time: any; value: number }[] {
  const k = 2 / (period + 1);
  let ema = closes[0];
  const res: { time: any; value: number }[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      ema = (ema * i + closes[i]) / (i + 1);
    } else {
      ema = closes[i] * k + ema * (1 - k);
      res.push({ time: times[i] as any, value: Number(ema.toFixed(5)) });
    }
  }
  return res;
}

function computeRSI(closes: number[], times: number[], period = 14): { time: any; value: number }[] {
  const res: { time: any; value: number }[] = [];
  if (closes.length < period + 1) return res;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    res.push({ time: times[i] as any, value: Number(rsi.toFixed(2)) });
  }
  return res;
}

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
  const ema12 = computeEMA(closes, fast, times);
  const ema26 = computeEMA(closes, slow, times);

  // Align by time
  const ema26Map = new Map(ema26.map((d) => [d.time, d.value]));
  const macdLine: { time: any; value: number }[] = [];
  for (const e of ema12) {
    if (ema26Map.has(e.time)) {
      macdLine.push({ time: e.time, value: Number((e.value - ema26Map.get(e.time)!).toFixed(5)) });
    }
  }

  // Signal EMA(9) of MACD
  const macdValues = macdLine.map((d) => d.value);
  const macdTimes = macdLine.map((d) => d.time);
  const signalRaw = computeEMA(macdValues, signal, macdTimes as number[]);

  const signalMap = new Map(signalRaw.map((d) => [d.time, d.value]));
  const histogram: { time: any; value: number; color: string }[] = [];
  for (const m of macdLine) {
    if (signalMap.has(m.time)) {
      const h = m.value - signalMap.get(m.time)!;
      histogram.push({
        time: m.time,
        value: Number(h.toFixed(5)),
        color: h >= 0 ? 'rgba(0, 240, 168, 0.7)' : 'rgba(244, 63, 94, 0.7)',
      });
    }
  }

  return { macd: macdLine, signal: signalRaw, histogram };
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
  const rsiOb = useRef<any>(null);
  const rsiOs = useRef<any>(null);

  const macdLineSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistSeries = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [currentSymbol, setCurrentSymbol] = useState<string>(symbol);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>(timeframe);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Live RSI & MACD values for display
  const [liveRsi, setLiveRsi] = useState<number | null>(null);
  const [liveMacd, setLiveMacd] = useState<number | null>(null);
  const [liveMacdSignal, setLiveMacdSignal] = useState<number | null>(null);

  // Indicator Toggles
  const [showEma20, setShowEma20] = useState<boolean>(true);
  const [showEma50, setShowEma50] = useState<boolean>(true);
  const [showEma200, setShowEma200] = useState<boolean>(false);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showLevels, setShowLevels] = useState<boolean>(true);
  const [showRsi, setShowRsi] = useState<boolean>(true);
  const [showMacd, setShowMacd] = useState<boolean>(true);

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

  // ── Shared chart options ──
  const chartOpts = (height: number) => ({
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
    height,
  });

  // ── Init Main Chart ──
  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.innerHTML = '';

    const chart = createChart(mainRef.current, {
      ...chartOpts(0),
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.08, bottom: 0.22 } },
    });
    mainChart.current = chart;

    candleSeries.current = chart.addCandlestickSeries({
      upColor: '#00F0A8', downColor: '#F43F5E',
      borderVisible: false, wickUpColor: '#00F0A8', wickDownColor: '#F43F5E',
    });

    const vol = chart.addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.current = vol;

    ema20Series.current = chart.addLineSeries({ color: '#38BDF8', lineWidth: 2, title: 'EMA 20', priceLineVisible: false });
    ema50Series.current = chart.addLineSeries({ color: '#F59E0B', lineWidth: 2, title: 'EMA 50', priceLineVisible: false });
    ema200Series.current = chart.addLineSeries({ color: '#A855F7', lineWidth: 2, title: 'EMA 200', priceLineVisible: false });

    const resize = () => {
      if (mainRef.current) chart.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, []);

  // ── Init RSI Sub-chart ──
  useEffect(() => {
    if (!rsiRef.current) return;
    rsiRef.current.innerHTML = '';

    const chart = createChart(rsiRef.current, {
      ...chartOpts(0),
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1E293B', timeVisible: false, secondsVisible: false },
    });
    rsiChart.current = chart;

    rsiSeries.current = chart.addLineSeries({ color: '#F472B6', lineWidth: 2, title: 'RSI 14', priceLineVisible: false });

    // OB / OS lines
    rsiOb.current = rsiSeries.current.createPriceLine({ price: 70, color: 'rgba(244,63,94,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'OB 70' });
    rsiOs.current = rsiSeries.current.createPriceLine({ price: 30, color: 'rgba(0,240,168,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'OS 30' });
    rsiSeries.current.createPriceLine({ price: 50, color: 'rgba(148,163,184,0.25)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });

    const resize = () => {
      if (rsiRef.current) chart.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, []);

  // ── Init MACD Sub-chart ──
  useEffect(() => {
    if (!macdRef.current) return;
    macdRef.current.innerHTML = '';

    const chart = createChart(macdRef.current, {
      ...chartOpts(0),
      rightPriceScale: { borderColor: '#1E293B', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1E293B', timeVisible: true, secondsVisible: false },
    });
    macdChart.current = chart;

    macdHistSeries.current = chart.addHistogramSeries({ priceScaleId: 'right', priceLineVisible: false });
    macdLineSeries.current = chart.addLineSeries({ color: '#38BDF8', lineWidth: 2, title: 'MACD', priceLineVisible: false });
    macdSignalSeries.current = chart.addLineSeries({ color: '#F59E0B', lineWidth: 2, title: 'Signal', priceLineVisible: false });

    const resize = () => {
      if (macdRef.current) chart.applyOptions({ width: macdRef.current.clientWidth, height: macdRef.current.clientHeight });
    };
    window.addEventListener('resize', resize);
    resize();

    return () => { window.removeEventListener('resize', resize); chart.remove(); };
  }, []);

  // ── Sync time scales across all charts ──
  useEffect(() => {
    const charts = [mainChart.current, rsiChart.current, macdChart.current].filter(Boolean) as IChartApi[];
    if (charts.length < 2) return;
    const handlers: (() => void)[] = [];
    charts.forEach((src, i) => {
      const handler = (range: any) => {
        if (!range) return;
        charts.forEach((dst, j) => { if (i !== j) dst.timeScale().setVisibleLogicalRange(range); });
      };
      src.timeScale().subscribeVisibleLogicalRangeChange(handler);
      handlers.push(() => src.timeScale().unsubscribeVisibleLogicalRangeChange(handler));
    });
    return () => handlers.forEach((h) => h());
  }, []);

  // ── Feed data into all charts ──
  useEffect(() => {
    if (!candleSeries.current || !volumeSeries.current || candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => Number(a.time) - Number(b.time));
    const closes = sorted.map((c) => c.close);
    const times = sorted.map((c) => Number(c.time));

    candleSeries.current.setData(sorted.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    volumeSeries.current.setData(sorted.map((c) => ({ time: c.time as any, value: c.volume || 1000, color: c.close >= c.open ? 'rgba(0,240,168,0.25)' : 'rgba(244,63,94,0.25)' })));

    // EMAs
    if (ema20Series.current) ema20Series.current.setData(showEma20 ? computeEMA(closes, 20, times) : []);
    if (ema50Series.current) ema50Series.current.setData(showEma50 ? computeEMA(closes, 50, times) : []);
    if (ema200Series.current) ema200Series.current.setData(showEma200 ? computeEMA(closes, 200, times) : []);

    // RSI
    if (rsiSeries.current) {
      const rsiData = computeRSI(closes, times, 14);
      rsiSeries.current.setData(showRsi ? rsiData : []);
      if (rsiData.length > 0) setLiveRsi(rsiData[rsiData.length - 1].value);
    }

    // MACD
    if (macdLineSeries.current && macdSignalSeries.current && macdHistSeries.current) {
      const { macd, signal, histogram } = computeMACD(closes, times);
      macdLineSeries.current.setData(showMacd ? macd : []);
      macdSignalSeries.current.setData(showMacd ? signal : []);
      macdHistSeries.current.setData(showMacd ? histogram : []);
      if (macd.length > 0) setLiveMacd(macd[macd.length - 1].value);
      if (signal.length > 0) setLiveMacdSignal(signal[signal.length - 1].value);
    }

    mainChart.current?.timeScale().fitContent();
  }, [candles, showEma20, showEma50, showEma200, showRsi, showMacd]);

  // ── Draw setup levels (Entry, SL, TP) ──
  useEffect(() => {
    if (!candleSeries.current || !showLevels || !activeSetup || activeSetup.symbol !== currentSymbol) return;
    const series = candleSeries.current;
    const entryLine = series.createPriceLine({ price: activeSetup.entryZone.optimal, color: '#38BDF8', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `ENTRY: ${formatAssetPrice(activeSetup.entryZone.optimal, symbol)}` });
    const slLine = series.createPriceLine({ price: activeSetup.stopLoss, color: '#F43F5E', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `SL: ${formatAssetPrice(activeSetup.stopLoss, symbol)}` });
    const tp1Line = series.createPriceLine({ price: activeSetup.takeProfit1, color: '#00F0A8', lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `TP1: ${formatAssetPrice(activeSetup.takeProfit1, symbol)}` });
    return () => { try { series.removePriceLine(entryLine); series.removePriceLine(slLine); series.removePriceLine(tp1Line); } catch { } };
  }, [activeSetup, currentSymbol, showLevels]);

  const latestCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0;
  const priceChangePercent = latestCandle && prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  // RSI color
  const rsiColor = liveRsi !== null ? (liveRsi >= 70 ? '#F43F5E' : liveRsi <= 30 ? '#00F0A8' : '#F472B6') : '#F472B6';
  const rsiLabel = liveRsi !== null ? (liveRsi >= 70 ? 'OB' : liveRsi <= 30 ? 'OS' : 'Normal') : '';
  const macdBull = liveMacd !== null && liveMacdSignal !== null && liveMacd > liveMacdSignal;

  return (
    <div className="flex flex-col h-full bg-[#090D15] rounded-xl border border-[#1B2436] overflow-hidden">
      {/* ── Top Toolbar ── */}
      <div className="px-4 py-3 border-b border-[#1B2436] flex flex-wrap items-center justify-between gap-3 bg-[#0C121D]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={currentSymbol}
              onChange={(e) => { const s = e.target.value; setCurrentSymbol(s); if (onSymbolChange) onSymbolChange(s); }}
              className="bg-[#121927] border border-[#202D44] text-white font-mono font-bold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {symbolsList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {latestCandle && (
              <div className="flex items-center gap-2 font-mono text-sm pl-2">
                <span className="font-bold text-white text-base">{formatAssetPrice(latestCandle.close, symbol)}</span>
                <span className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded ${priceChange >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                  {priceChange >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                  {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* Timeframe Buttons */}
          <div className="hidden md:flex items-center bg-[#121927] p-1 rounded-lg border border-[#202D44] gap-0.5">
            {timeframesList.map((tf) => (
              <button key={tf} onClick={() => { setCurrentTimeframe(tf); if (onTimeframeChange) onTimeframeChange(tf); }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${currentTimeframe === tf ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}>
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Indicator Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono">
            <button onClick={() => setShowEma20(!showEma20)}
              className={`px-2 py-1 rounded border transition-colors ${showEma20 ? 'bg-sky-500/15 border-sky-500/40 text-sky-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              EMA 20
            </button>
            <button onClick={() => setShowEma50(!showEma50)}
              className={`px-2 py-1 rounded border transition-colors ${showEma50 ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              EMA 50
            </button>
            <button onClick={() => setShowEma200(!showEma200)}
              className={`px-2 py-1 rounded border transition-colors ${showEma200 ? 'bg-purple-500/15 border-purple-500/40 text-purple-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              EMA 200
            </button>
            <button onClick={() => setShowRsi(!showRsi)}
              className={`px-2 py-1 rounded border transition-colors ${showRsi ? 'bg-pink-500/15 border-pink-500/40 text-pink-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              RSI 14
            </button>
            <button onClick={() => setShowMacd(!showMacd)}
              className={`px-2 py-1 rounded border transition-colors ${showMacd ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              MACD
            </button>
            <button onClick={() => setShowLevels(!showLevels)}
              className={`px-2 py-1 rounded border transition-colors ${showLevels ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-[#121927] border-transparent text-slate-500'}`}>
              Darajalar
            </button>
          </div>

          {/* AI Button */}
          {onSendToAnalyzer && (
            <button onClick={() => onSendToAnalyzer(currentSymbol, currentTimeframe, candles)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#07090E] px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all shadow-sm shadow-emerald-500/20 active:scale-95">
              <Brain className="w-3.5 h-3.5 fill-current" />
              <span>AI BILAN SKANERLASH</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main Chart ── */}
      <div className="relative flex-1 w-full min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090D15]/80 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mb-2" />
            <span className="text-xs font-mono text-slate-400">Loading quantitative feed...</span>
          </div>
        )}
        <div ref={mainRef} className="w-full h-full" />

        {/* Legend Overlay */}
        <div className="absolute top-3 left-4 z-10 pointer-events-none flex items-center gap-3 text-[11px] font-mono bg-[#090D15]/80 px-2.5 py-1 rounded border border-[#1E293B]">
          <span className="text-slate-400">{currentSymbol}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">{currentTimeframe}</span>
          {showEma20 && <span className="text-sky-400">EMA20</span>}
          {showEma50 && <span className="text-amber-400">EMA50</span>}
          {showEma200 && <span className="text-purple-400">EMA200</span>}
        </div>
      </div>

      {/* ── RSI Sub-chart ── */}
      {showRsi && (
        <div className="w-full border-t border-[#1B2436]" style={{ height: 90 }}>
          {/* RSI header */}
          <div className="flex items-center gap-3 px-3 py-0.5 bg-[#0C121D] border-b border-[#1B2436] text-[10px] font-mono">
            <span className="text-pink-400 font-bold">RSI(14)</span>
            {liveRsi !== null && (
              <>
                <span style={{ color: rsiColor }} className="font-bold">{liveRsi.toFixed(1)}</span>
                <span style={{ color: rsiColor, backgroundColor: liveRsi >= 70 ? 'rgba(244,63,94,0.15)' : liveRsi <= 30 ? 'rgba(0,240,168,0.15)' : 'rgba(244,114,182,0.1)' }} className="px-1.5 py-0.5 rounded text-[9px] font-bold">
                  {rsiLabel}
                </span>
              </>
            )}
          </div>
          <div ref={rsiRef} className="w-full" style={{ height: 68 }} />
        </div>
      )}

      {/* ── MACD Sub-chart ── */}
      {showMacd && (
        <div className="w-full border-t border-[#1B2436]" style={{ height: 100 }}>
          {/* MACD header */}
          <div className="flex items-center gap-3 px-3 py-0.5 bg-[#0C121D] border-b border-[#1B2436] text-[10px] font-mono">
            <span className="text-cyan-400 font-bold">MACD(12,26,9)</span>
            {liveMacd !== null && (
              <span className="text-sky-400">{liveMacd.toFixed(4)}</span>
            )}
            {liveMacdSignal !== null && (
              <span className="text-amber-400">SIG: {liveMacdSignal.toFixed(4)}</span>
            )}
            {liveMacd !== null && liveMacdSignal !== null && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${macdBull ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                {macdBull ? '▲ BULLISH' : '▼ BEARISH'}
              </span>
            )}
          </div>
          <div ref={macdRef} className="w-full" style={{ height: 72 }} />
        </div>
      )}
    </div>
  );
};
