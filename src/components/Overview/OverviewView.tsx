import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Brain,
  Zap,
  Activity,
  Globe,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Target,
  BarChart2,
} from 'lucide-react';
import { WatchlistItem, AnalysisResult, ActiveTab } from '../../types';

interface OverviewViewProps {
  tickers: WatchlistItem[];
  recentAnalyses: AnalysisResult[];
  setActiveTab: (tab: ActiveTab) => void;
  onSelectSymbol: (symbol: string) => void;
  onAnalyzeSymbol: (symbol: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  tickers,
  recentAnalyses,
  setActiveTab,
  onSelectSymbol,
  onAnalyzeSymbol,
}) => {
  // Highlight major assets for cards: BTC, ETH, XAU/USD, EUR/USD
  const featuredSymbols = ['BTC/USDT', 'ETH/USDT', 'XAU/USD', 'EUR/USD'];
  const featuredTickers = tickers.filter((t) => featuredSymbols.includes(t.symbol));

  // Volatility calculation across market
  const highVolCount = tickers.filter((t) => t.volatility === 'High').length;
  const overallVolatility = highVolCount >= 2 ? 'ELEVATED' : 'STABLE';

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome Hero */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#0C121E] via-[#0E1626] to-[#0A101C] border border-[#1E293B] shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>INSTITUTSIONAL KVANT INTELLEKT TIZIMI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              AI Bozor Strukturasi & Grafik Sintezi
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Ixtiyoriy grafik skrinshotini yuklang yoki real vaqtda kripto, forex va indekslarni kuzatib,
              aniq matematik risk-mukofot chegaralari bilan ta'limiy simulyatsiya qilingan savdo ssenariylarini yarating.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab('analyzer')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              <Brain className="w-4 h-4 fill-current" />
              <span>AI Tahlilchini Ishga Tushirish</span>
            </button>
            <button
              onClick={() => setActiveTab('chart')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#131B2A] hover:bg-[#1A2538] text-slate-200 border border-[#223048] font-mono text-xs font-semibold transition-colors"
            >
              <span>Interaktiv Grafik</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Featured Market Overview Cards (BTC, ETH, XAU/USD, EUR/USD) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {featuredTickers.map((item) => {
          const isPositive = item.change24h >= 0;
          return (
            <div
              key={item.symbol}
              onClick={() => onSelectSymbol(item.symbol)}
              className="cursor-pointer group p-5 rounded-xl bg-[#090D15] border border-[#1B2436] hover:border-emerald-500/40 transition-all shadow-lg hover:shadow-emerald-500/5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono font-bold text-base text-white group-hover:text-emerald-400 transition-colors">
                    {item.symbol}
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans">{item.name}</div>
                </div>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                    isPositive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {isPositive ? '+' : ''}
                  {item.change24h.toFixed(2)}%
                </span>
              </div>

              <div className="font-mono text-xl font-extrabold text-white">
                ${item.price.toLocaleString(undefined, { minimumFractionDigits: item.price < 10 ? 4 : 2 })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#172132] text-[10px] font-mono text-slate-400">
                <span>H: ${item.high24h.toLocaleString()}</span>
                <span>L: ${item.low24h.toLocaleString()}</span>
                <span className="text-slate-500 font-bold">{item.volatility} Vol</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary Row: Volatility / Sessions Widget + Market Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Volatility & Market Regime Pulse (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Bozor Volatilligi & Rejim</span>
            </h2>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                overallVolatility === 'ELEVATED'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {overallVolatility === 'ELEVATED' ? 'YUQORI' : 'BARQAROR'}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Global bozor volatilligi ayni paytda{' '}
            <span className="font-semibold text-emerald-400">
              {overallVolatility === 'ELEVATED' ? 'yuqori (faol)' : 'barqaror (me\'yoriy)'}
            </span>. Asosiy kripto va valyuta juftliklarida spredlar tor va likvidlik yetarli darajada.
          </p>

          <div className="space-y-2 pt-2 border-t border-[#172132] text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Kripto 24s o'rtacha impuls:</span>
              <span className="text-emerald-400 font-bold">+2.84%</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>O'rtacha Risk/Mukofot:</span>
              <span className="text-sky-400 font-bold">1 : 2.14</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>O'rtacha AI Ishonch balli:</span>
              <span className="text-amber-400 font-bold">81.2%</span>
            </div>
          </div>
        </div>

        {/* Recent AI Analyses (8 cols) */}
        <div className="lg:col-span-8 p-5 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <Brain className="w-4 h-4 text-emerald-400" />
              <span>So'nggi AI Grafik Tahlillari</span>
            </h2>
            <button
              onClick={() => setActiveTab('history')}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Barcha Tarixni Ko'rish →
            </button>
          </div>

          {recentAnalyses.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs font-mono">
              Hali tahlillar mavjud emas. Yangi tahlil boshlash uchun grafik yuklang!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentAnalyses.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  onClick={() => setActiveTab('history')}
                  className="cursor-pointer p-4 rounded-xl bg-[#0E1522] border border-[#1E293B] hover:border-emerald-500/40 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{item.symbol}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#172030] text-slate-300">
                        {item.timeframe}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        item.scenarioType === 'Buy Setup'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : item.scenarioType === 'Sell Setup'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {item.scenarioType}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {item.chartContext}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-[#172233] text-[11px] font-mono">
                    <span className="text-sky-400 font-semibold">
                      Kirish: ${item.entryZone.optimal.toLocaleString()}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      TP1: ${item.takeProfit1.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
