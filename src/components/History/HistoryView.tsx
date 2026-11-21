import React, { useState } from 'react';
import {
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Clock,
  Trash2,
  ExternalLink,
  Search,
  Brain,
  FileImage,
  Target,
  ShieldAlert,
  X,
  PlusCircle,
} from 'lucide-react';
import { AnalysisResult } from '../../types';
import { deleteAnalysisResult } from '../../lib/supabase';
import { formatAssetPrice } from '../../lib/formatPrice';

interface HistoryViewProps {
  history: AnalysisResult[];
  onOpenAnalysis: (item: AnalysisResult) => void;
  onDeleteAnalysis: (id: string) => void;
  onPaperTrade?: (setup: AnalysisResult) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onOpenAnalysis,
  onDeleteAnalysis,
  onPaperTrade,
}) => {
  const [search, setSearch] = useState<string>('');
  const [selectedScenario, setSelectedScenario] = useState<string>('All');
  const [inspectedItem, setInspectedItem] = useState<AnalysisResult | null>(null);

  const filtered = history.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(search.toLowerCase()) ||
      item.timeframe.toLowerCase().includes(search.toLowerCase());
    const matchesScenario =
      selectedScenario === 'All' || item.scenarioType === selectedScenario;
    return matchesSearch && matchesScenario;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this saved analysis record?')) {
      await deleteAnalysisResult(id);
      onDeleteAnalysis(id);
      if (inspectedItem?.id === id) setInspectedItem(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <History className="w-6 h-6 text-emerald-400" />
          <span>Tahlillar Tarixi</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Oldingi AI grafik auditlari, simulyatsiya qilingan savdo rejalari, risk chegaralari va qaydlarni ko'rib chiqing.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#090D15] p-3 rounded-xl border border-[#1B2436]">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Simvol yoki taymfreymni qidiring..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0E1522] border border-[#1E293B] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {['All', 'Buy Setup', 'Sell Setup', 'No Setup'].map((scenario) => (
            <button
              key={scenario}
              onClick={() => setSelectedScenario(scenario)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                selectedScenario === scenario
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {scenario === 'All'
                ? 'Hammasi'
                : scenario === 'Buy Setup'
                ? 'Xarid (Buy)'
                : scenario === 'Sell Setup'
                ? 'Sotish (Sell)'
                : 'Ssenariy Yo\'q'}
            </button>
          ))}
        </div>
      </div>

      {/* History Grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-xl border border-dashed border-[#1E293B] bg-[#090D15]/50">
          <Brain className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">Tahlillar Tarixi Bo'sh</h3>
          <p className="text-xs text-slate-500 mt-1">
            Yangi grafikni AI bilan tahlil qiling va natijalar avtomatik ravishda bu yerda saqlanadi.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isBullish = item.marketDirection === 'Bullish';
            const isBearish = item.marketDirection === 'Bearish';

            return (
              <div
                key={item.id}
                onClick={() => setInspectedItem(item)}
                className="cursor-pointer group p-5 rounded-xl bg-[#090D15] border border-[#1B2436] hover:border-emerald-500/40 transition-all space-y-4 shadow-lg hover:shadow-emerald-500/5 relative overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-white">{item.symbol}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#131A28] text-slate-300 border border-[#202C40]">
                      {item.timeframe}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Signal Badge (BUY/SELL/WAIT) */}
                    {item.signal && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          item.signal === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : item.signal === 'SELL'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {item.signal}
                      </span>
                    )}

                    <span
                      className={`flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                        isBullish
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isBearish
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {isBullish ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : isBearish ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {item.scenarioType === 'Buy Setup' ? 'Buy' : item.scenarioType === 'Sell Setup' ? 'Sell' : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Optional Chart Thumbnail */}
                {item.chartImageUrl && (
                  <div className="h-28 w-full rounded-lg overflow-hidden border border-[#1E293B] bg-black relative">
                    <img
                      src={item.chartImageUrl}
                      alt="Analyzed Chart"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-slate-300">
                      Chart Capture
                    </div>
                  </div>
                )}

                {/* Parameters Preview */}
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-[#0E1522] p-2.5 rounded-lg border border-[#1B2538]">
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Kirish</span>
                    <span className="font-semibold text-sky-400">
                      {formatAssetPrice(item.entryZone.optimal, item.symbol)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">Stop Loss</span>
                    <span className="font-semibold text-rose-400">
                      {formatAssetPrice(item.stopLoss, item.symbol)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase">TP1</span>
                    <span className="font-semibold text-emerald-400">
                      {formatAssetPrice(item.takeProfit1, item.symbol)}
                    </span>
                  </div>
                </div>

                {/* Context Excerpt */}
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {item.chartContext}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-2 border-t border-[#172132]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">
                      {item.confidenceScore}% Conf
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Delete Record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Past Analysis Modal */}
      {inspectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#090D15] border border-[#1E293B] rounded-2xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-white">
                  {inspectedItem.symbol}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#131A28] text-slate-300">
                  {inspectedItem.timeframe}
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded ${
                    inspectedItem.scenarioType === 'Buy Setup'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : inspectedItem.scenarioType === 'Sell Setup'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {inspectedItem.scenarioType}
                </span>
              </div>
              <button
                onClick={() => setInspectedItem(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chart screenshot preview if available */}
            {inspectedItem.chartImageUrl && (
              <div className="rounded-xl overflow-hidden border border-[#1E293B] max-h-64 bg-black flex items-center justify-center">
                <img
                  src={inspectedItem.chartImageUrl}
                  alt="Archived Chart"
                  className="max-h-64 object-contain w-full"
                />
              </div>
            )}

            {/* Parameters */}
            <div className="grid grid-cols-4 gap-3 font-mono text-xs bg-[#0E1522] p-3 rounded-xl border border-[#1E293B]">
              <div>
                <span className="text-slate-400 uppercase text-[10px]">Kirish</span>
                <div className="font-bold text-sky-400 text-sm mt-0.5">
                  {formatAssetPrice(inspectedItem.entryZone.optimal, inspectedItem.symbol)}
                </div>
              </div>
              <div>
                <span className="text-slate-400 uppercase text-[10px]">Stop Loss</span>
                <div className="font-bold text-rose-400 text-sm mt-0.5">
                  {formatAssetPrice(inspectedItem.stopLoss, inspectedItem.symbol)}
                </div>
              </div>
              <div>
                <span className="text-slate-400 uppercase text-[10px]">Take Profit 1</span>
                <div className="font-bold text-emerald-400 text-sm mt-0.5">
                  {formatAssetPrice(inspectedItem.takeProfit1, inspectedItem.symbol)}
                </div>
              </div>
              <div>
                <span className="text-slate-400 uppercase text-[10px]">Risk / Reward</span>
                <div className={`font-bold text-sm mt-0.5 ${inspectedItem.riskRewardRatio >= 1.5 ? 'text-emerald-400' : inspectedItem.riskRewardRatio >= 1.0 ? 'text-yellow-400' : 'text-rose-400'}`}>
                  1 : {inspectedItem.riskRewardRatio}
                </div>
              </div>
            </div>

            {/* Context & Reasons */}
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-mono uppercase text-slate-400 font-bold block mb-1">
                  Bozor tahlili
                </span>
                <p className="text-slate-200 leading-relaxed bg-[#0C121E] p-3 rounded-lg border border-[#182334]">
                  {inspectedItem.chartContext}
                </p>
              </div>

              <div>
                <span className="font-mono uppercase text-slate-400 font-bold block mb-1">
                  Texnik sabablar
                </span>
                <div className="space-y-1">
                  {inspectedItem.analysisReasons.map((r, i) => (
                    <div
                      key={i}
                      className="bg-[#0C121E] p-2 rounded-lg text-slate-300 border border-[#182334]"
                    >
                      • {r}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                <div className="font-mono font-bold uppercase text-[10px] mb-0.5">
                  Bekor qilish mezonlari
                </div>
                {inspectedItem.invalidationCriteria}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B]">
              <div className="text-xs font-mono text-slate-500">
                Analyzed on {new Date(inspectedItem.createdAt).toLocaleString()}
              </div>

              <div className="flex items-center gap-2">
                {onPaperTrade && inspectedItem.scenarioType !== 'No Setup' && (
                  <button
                    onClick={() => {
                      onPaperTrade(inspectedItem);
                      setInspectedItem(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Demo savdoga yuborish</span>
                  </button>
                )}
                <button
                  onClick={() => setInspectedItem(null)}
                  className="px-4 py-1.5 rounded-lg bg-[#151D2C] text-slate-300 text-xs font-mono hover:text-white"
                >
                  Yopish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
