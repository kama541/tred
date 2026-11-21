import React, { useState } from 'react';
import {
  ListOrdered,
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  CandlestickChart,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from 'lucide-react';
import { WatchlistItem, Timeframe } from '../../types';
import { formatAssetPrice } from '../../lib/formatPrice';

interface WatchlistViewProps {
  tickers: WatchlistItem[];
  onSelectSymbol: (symbol: string) => void;
  onAnalyzeSymbol: (symbol: string) => void;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  tickers,
  onSelectSymbol,
  onAnalyzeSymbol,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTf, setSelectedTf] = useState<Timeframe>('1h');

  const categories = ['Hammasi', 'Kripto', 'Forex', 'Xomashyo', 'Indekslar'];

  const filteredTickers = tickers.filter((item) => {
    let catMatch = true;
    if (filterCategory === 'Kripto') catMatch = item.category === 'Crypto';
    else if (filterCategory === 'Forex') catMatch = item.category === 'Forex';
    else if (filterCategory === 'Xomashyo') catMatch = item.category === 'Commodities';
    else if (filterCategory === 'Indekslar') catMatch = item.category === 'Indices';

    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return catMatch && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ListOrdered className="w-6 h-6 text-emerald-400" />
            <span>Bozor Kuzatuv Ro'yxati</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Haqiqiy bozor narxlari, 24 soatlik o'zgarish, volatillik indekslari va AI tahliliga bir zumda o'tish.
          </p>
        </div>

        {/* Timeframe pill selector for monitoring */}
        <div className="flex items-center gap-2 bg-[#0E1522] border border-[#1E293B] p-1 rounded-lg">
          <span className="text-[11px] font-mono text-slate-400 px-2 uppercase">Taymfreym:</span>
          {(['15m', '1h', '4h', '1D'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              className={`px-2.5 py-1 text-xs font-mono rounded font-medium transition-colors ${
                selectedTf === tf
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#090D15] p-3 rounded-xl border border-[#1B2436]">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Simvol yoki aktiv nomini qidiring..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0E1522] border border-[#1E293B] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono transition-colors"
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                filterCategory === cat
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-[#121926]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tickers Table */}
      <div className="rounded-xl border border-[#1B2436] bg-[#090D15] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1B2436] bg-[#0C121E] text-[11px] font-mono uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4 font-semibold">Aktiv</th>
                <th className="py-3.5 px-4 font-semibold text-right">Narx</th>
                <th className="py-3.5 px-4 font-semibold text-right">24s O'zgarish</th>
                <th className="py-3.5 px-4 font-semibold text-right hidden sm:table-cell">24s Maks / Min</th>
                <th className="py-3.5 px-4 font-semibold text-center hidden md:table-cell">Volatillik</th>
                <th className="py-3.5 px-4 font-semibold text-center hidden lg:table-cell">Trend</th>
                <th className="py-3.5 px-4 font-semibold text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151E2E] text-sm font-mono">
              {filteredTickers.map((item) => {
                const isPositive = item.change24h >= 0;
                return (
                  <tr
                    key={item.symbol}
                    className="hover:bg-[#0E1524] transition-colors group"
                  >
                    {/* Symbol & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#141C2C] border border-[#202D44] flex items-center justify-center font-bold text-xs text-white">
                          {item.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{item.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#162032] text-slate-400 font-sans">
                              {item.category}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-sans">{item.name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Live Price */}
                    <td className="py-3.5 px-4 text-right font-bold text-slate-100">
                      {formatAssetPrice(item.price, item.symbol)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold ${
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
                    </td>

                    {/* 24h High / Low */}
                    <td className="py-3.5 px-4 text-right hidden sm:table-cell text-xs text-slate-400">
                      <div>{formatAssetPrice(item.high24h, item.symbol)}</div>
                      <div className="text-slate-500">{formatAssetPrice(item.low24h, item.symbol)}</div>
                    </td>

                    {/* Volatility */}
                    <td className="py-3.5 px-4 text-center hidden md:table-cell">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                          item.volatility === 'High'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : item.volatility === 'Medium'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {item.volatility}
                      </span>
                    </td>

                    {/* Trend Indicator */}
                    <td className="py-3.5 px-4 text-center hidden lg:table-cell">
                      <div className="inline-flex items-center gap-1 text-xs">
                        {isPositive ? (
                          <>
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Bullish</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-4 h-4 text-rose-400" />
                            <span className="text-rose-400 font-semibold">Bearish</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onSelectSymbol(item.symbol)}
                          title="Open in Interactive Chart"
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-[#1A2438] rounded-lg transition-colors border border-transparent hover:border-[#24334C]"
                        >
                          <CandlestickChart className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onAnalyzeSymbol(item.symbol)}
                          title="Analyze with AI"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors"
                        >
                          <Brain className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Analyze</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
