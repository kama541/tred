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

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  symbol = 'BTC/USDT',
  timeframe = '1h',
  onSymbolChange,
  onTimeframeChange,
  onSendToAnalyzer,
  activeSetup,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Series = useRef<ISeriesApi<'Line'> | null>(null);

  const [currentSymbol, setCurrentSymbol] = useState<string>(symbol);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>(timeframe);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Indicator Toggles
  const [showEma20, setShowEma20] = useState<boolean>(true);
  const [showEma50, setShowEma50] = useState<boolean>(true);
  const [showEma200, setShowEma200] = useState<boolean>(false);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showLevels, setShowLevels] = useState<boolean>(true);

  const symbolsList = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'NAS100', 'US30'];
  const timeframesList: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

  // Load candles
  const loadCandleData = useCallback(async (sym: string, tf: Timeframe) => {
    setLoading(true);
    const data = await fetchLiveKlines(sym, tf);
    setCandles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    setCurrentSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    setCurrentTimeframe(timeframe);
  }, [timeframe]);

  useEffect(() => {
    loadCandleData(currentSymbol, currentTimeframe);
  }, [currentSymbol, currentTimeframe, loadCandleData]);

  // Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090D15' },
        textColor: '#94A3B8',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38BDF8',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: '#1E293B',
        },
        horzLine: {
          color: '#38BDF8',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: '#1E293B',
        },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    chartInstance.current = chart;

    // Candlestick series
    const candle = chart.addCandlestickSeries({
      upColor: '#00F0A8',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#00F0A8',
      wickDownColor: '#F43F5E',
    });
    candleSeries.current = candle;

    // Volume Series
    const vol = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    vol.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeries.current = vol;

    // EMA 20
    const ema20 = chart.addLineSeries({
      color: '#38BDF8',
      lineWidth: 2,
      title: 'EMA 20',
      priceLineVisible: false,
    });
    ema20Series.current = ema20;

    // EMA 50
    const ema50 = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 2,
      title: 'EMA 50',
      priceLineVisible: false,
    });
    ema50Series.current = ema50;

    // EMA 200
    const ema200 = chart.addLineSeries({
      color: '#A855F7',
      lineWidth: 2,
      title: 'EMA 200',
      priceLineVisible: false,
    });
    ema200Series.current = ema200;

    // Responsive resize handler
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update chart data when candles change
  useEffect(() => {
    if (!candleSeries.current || !volumeSeries.current || candles.length === 0) return;

    // Format for lightweight-charts: must be sorted ascending by time
    const sorted = [...candles].sort((a, b) => Number(a.time) - Number(b.time));

    const formattedCandles = sorted.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const formattedVolume = sorted.map((c) => ({
      time: c.time as any,
      value: c.volume || 1000,
      color: c.close >= c.open ? 'rgba(0, 240, 168, 0.25)' : 'rgba(244, 63, 94, 0.25)',
    }));

    candleSeries.current.setData(formattedCandles);
    volumeSeries.current.setData(formattedVolume);

    // Compute EMAs
    const closes = sorted.map((c) => c.close);
    const computeLineData = (period: number) => {
      const k = 2 / (period + 1);
      let ema = closes[0];
      const res: { time: any; value: number }[] = [];
      for (let i = 0; i < sorted.length; i++) {
        if (i < period - 1) {
          ema = (ema * i + closes[i]) / (i + 1);
        } else {
          ema = closes[i] * k + ema * (1 - k);
          res.push({
            time: sorted[i].time as any,
            value: Number(ema.toFixed(2)),
          });
        }
      }
      return res;
    };

    if (ema20Series.current) {
      ema20Series.current.setData(showEma20 ? computeLineData(20) : []);
    }
    if (ema50Series.current) {
      ema50Series.current.setData(showEma50 ? computeLineData(50) : []);
    }
    if (ema200Series.current) {
      ema200Series.current.setData(showEma200 ? computeLineData(200) : []);
    }

    if (chartInstance.current) {
      chartInstance.current.timeScale().fitContent();
    }
  }, [candles, showEma20, showEma50, showEma200]);

  // Draw setup levels (Entry, SL, TP) if provided in activeSetup
  useEffect(() => {
    if (!candleSeries.current || !showLevels || !activeSetup || activeSetup.symbol !== currentSymbol) return;

    const series = candleSeries.current;

    // Draw lines
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
      title: `STOP LOSS: ${formatAssetPrice(activeSetup.stopLoss, symbol)}`,
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
      } catch (e) {
        // Ignored
      }
    };
  }, [activeSetup, currentSymbol, showLevels]);

  const latestCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0;
  const priceChangePercent = latestCandle && prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-[#090D15] rounded-xl border border-[#1B2436] overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-4 py-3 border-b border-[#1B2436] flex flex-wrap items-center justify-between gap-3 bg-[#0C121D]">
        {/* Symbol & Timeframe selectors */}
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

        {/* Indicator Toggles & Actions */}
        <div className="flex items-center gap-2">
          {/* Indicators dropdown or pill toggles */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setShowEma20(!showEma20)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma20
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 20
            </button>
            <button
              onClick={() => setShowEma50(!showEma50)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma50
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 50
            </button>
            <button
              onClick={() => setShowEma200(!showEma200)}
              className={`px-2 py-1 rounded border transition-colors ${
                showEma200
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                  : 'bg-[#121927] border-transparent text-slate-500'
              }`}
            >
              EMA 200
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

          {/* Quick AI Analyze Button */}
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

      {/* Main Chart Canvas Container */}
      <div className="relative flex-1 w-full min-h-[460px]">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090D15]/80 backdrop-blur-sm">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mb-2" />
            <span className="text-xs font-mono text-slate-400">Loading quantitative feed...</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />

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
    </div>
  );
};
