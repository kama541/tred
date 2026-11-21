import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  DollarSign,
  PlusCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  BookOpen,
  PieChart,
  Percent,
  CheckCircle,
} from 'lucide-react';
import { PaperPosition, PaperTransaction, WatchlistItem, AnalysisResult } from '../../types';
import {
  getPaperPositions,
  savePaperPosition,
  clearPaperPositions,
  getPaperTransactions,
  addPaperTransaction,
  getUserSettings,
  saveUserSettings,
} from '../../lib/supabase';
import { formatAssetPrice } from '../../lib/formatPrice';

interface PaperTradingViewProps {
  tickers: WatchlistItem[];
  prefilledSetup?: AnalysisResult | null;
  onClearPrefilled?: () => void;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({
  tickers,
  prefilledSetup,
  onClearPrefilled,
}) => {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);
  const [balance, setBalance] = useState<number>(10000);
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'journal'>('positions');

  // New Position Modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>('BTC/USDT');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState<number>(91420);
  const [positionSizeUsd, setPositionSizeUsd] = useState<number>(1000);
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Load positions and settings
  const loadData = async () => {
    const loadedPos = await getPaperPositions();
    const loadedTx = await getPaperTransactions();
    const settings = await getUserSettings();
    setPositions(loadedPos);
    setTransactions(loadedTx);
    setBalance(settings.currentBalance);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update unrealized PnL continuously based on live tickers
  useEffect(() => {
    if (tickers.length === 0 || positions.length === 0) return;

    const tickerMap = new Map(tickers.map((t) => [t.symbol, t.price]));
    let updatedAny = false;

    const updated = positions.map((pos) => {
      if (pos.status !== 'OPEN') return pos;
      const livePrice = tickerMap.get(pos.symbol) || pos.currentPrice;

      let pnl = 0;
      if (pos.side === 'LONG') {
        pnl = (livePrice - pos.entryPrice) * pos.quantity;
      } else {
        pnl = (pos.entryPrice - livePrice) * pos.quantity;
      }
      const pnlPercent = (pnl / pos.positionSizeUsd) * 100;

      if (pos.currentPrice !== livePrice || Math.abs(pos.pnl - pnl) > 0.01) {
        updatedAny = true;
        return {
          ...pos,
          currentPrice: livePrice,
          pnl: Number(pnl.toFixed(2)),
          pnlPercent: Number(pnlPercent.toFixed(2)),
        };
      }
      return pos;
    });

    if (updatedAny) {
      setPositions(updated);
    }
  }, [tickers]);

  // Handle pre-filled setup from AI analyzer
  useEffect(() => {
    if (prefilledSetup) {
      setSymbol(prefilledSetup.symbol);
      setSide(prefilledSetup.marketDirection === 'Bearish' ? 'SHORT' : 'LONG');
      setEntryPrice(prefilledSetup.entryZone.optimal);
      setStopLoss(prefilledSetup.stopLoss.toString());
      setTakeProfit(prefilledSetup.takeProfit1.toString());
      if (prefilledSetup.customPositionSize && prefilledSetup.customPositionSize > 0) {
        setPositionSizeUsd(prefilledSetup.customPositionSize);
      }
      const riskInfo = prefilledSetup.customRiskAmount ? ` | Risk: $${prefilledSetup.customRiskAmount}` : '';
      setNotes(`AI tahlilidan olindi (${prefilledSetup.scenarioType}${riskInfo})`);
      setShowModal(true);
      if (onClearPrefilled) onClearPrefilled();
    }
  }, [prefilledSetup]);

  // Execute opening a simulated position
  const handleOpenPosition = async () => {
    if (positionSizeUsd > balance) {
      alert('Pozitsiya hajmi mavjud virtual balansingizdan ortiq.');
      return;
    }

    const qty = positionSizeUsd / entryPrice;
    const newPos: PaperPosition = {
      id: `pos-${Date.now()}`,
      symbol,
      side,
      entryPrice,
      currentPrice: entryPrice,
      quantity: Number(qty.toFixed(6)),
      positionSizeUsd,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      pnl: 0,
      pnlPercent: 0,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      notes,
    };

    const newBalance = balance - positionSizeUsd;
    setBalance(newBalance);

    await savePaperPosition(newPos);
    await addPaperTransaction({
      id: `tx-${Date.now()}`,
      positionId: newPos.id,
      symbol: newPos.symbol,
      type: 'OPEN_POSITION',
      amount: -positionSizeUsd,
      balanceAfter: newBalance,
      description: `${symbol} bo'yicha ${side} ochildi @ $${entryPrice}`,
      createdAt: new Date().toISOString(),
    });

    await saveUserSettings({
      startingBalance: 10000,
      currentBalance: newBalance,
      defaultRiskPercent: 1.0,
      theme: 'dark',
    });

    setShowModal(false);
    loadData();
  };

  // Close simulated position
  const handleClosePosition = async (pos: PaperPosition) => {
    const returnAmount = pos.positionSizeUsd + pos.pnl;
    const newBalance = balance + returnAmount;
    setBalance(newBalance);

    const closedPos: PaperPosition = {
      ...pos,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      exitPrice: pos.currentPrice,
    };

    await savePaperPosition(closedPos);
    await addPaperTransaction({
      id: `tx-${Date.now()}`,
      positionId: pos.id,
      symbol: pos.symbol,
      type: 'CLOSE_POSITION',
      amount: returnAmount,
      balanceAfter: newBalance,
      description: `${pos.symbol} ${pos.side} yopildi @ $${pos.currentPrice}, PnL: $${pos.pnl}`,
      createdAt: new Date().toISOString(),
    });

    await saveUserSettings({
      startingBalance: 10000,
      currentBalance: newBalance,
      defaultRiskPercent: 1.0,
      theme: 'dark',
    });

    loadData();
  };

  // Reset virtual account
  const handleResetAccount = async () => {
    if (!confirm('Haqiqatan ham hisobingizni boshlang\'ich $10,000 ga qaytarmoqchimisiz?')) return;
    const newBalance = 10000;
    setBalance(newBalance);
    setPositions([]);
    await clearPaperPositions();
    await saveUserSettings({ currentBalance: newBalance });
    await addPaperTransaction({
      id: `tx-${Date.now()}`,
      type: 'RESET',
      amount: newBalance,
      balanceAfter: newBalance,
      description: 'Virtual balans boshlang\'ich $10,000 ga yangilandi',
      createdAt: new Date().toISOString(),
    });
    loadData();
  };

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const closedPositions = positions.filter((p) => p.status === 'CLOSED');

  // Analytics
  const totalRealizedPnl = closedPositions.reduce((acc, p) => acc + p.pnl, 0);
  const totalUnrealizedPnl = openPositions.reduce((acc, p) => acc + p.pnl, 0);
  const winningTrades = closedPositions.filter((p) => p.pnl > 0).length;
  const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <span>Virtual Savdo (Paper Trading)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            AI tomonidan taqdim etilgan ssenariylarni haqiqiy bozor narxlarida xavf-xatarsiz sinab ko'ring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAccount}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121927] hover:bg-[#1A2336] text-slate-400 hover:text-slate-200 border border-[#202D44] text-xs font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Balansni Qayta O'rnatish</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs tracking-wide shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Yangi Virtual Bitim</span>
          </button>
        </div>
      </div>

      {/* Account Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#090D15] border border-[#1B2436] font-mono">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Mavjud Balans</span>
            <Wallet className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-bold text-white mt-1.5">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Virtual kapital</div>
        </div>

        <div className="p-4 rounded-xl bg-[#090D15] border border-[#1B2436] font-mono">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Norealizatsiya PnL</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div
            className={`text-xl font-bold mt-1.5 ${
              totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{openPositions.length} ta ochiq pozitsiya</div>
        </div>

        <div className="p-4 rounded-xl bg-[#090D15] border border-[#1B2436] font-mono">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Realizatsiya PnL</span>
            <DollarSign className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div
            className={`text-xl font-bold mt-1.5 ${
              totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{closedPositions.length} ta yopilgan bitim</div>
        </div>

        <div className="p-4 rounded-xl bg-[#090D15] border border-[#1B2436] font-mono">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>G'alaba Darajasi (Win Rate)</span>
            <Percent className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1.5">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{closedPositions.length} tadan {winningTrades} tasi foydada</div>
        </div>
      </div>

      {/* Tabs: Active Positions / Position History / Trade Journal */}
      <div className="flex items-center gap-2 border-b border-[#1B2436] pb-1">
        <button
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition-colors border-b-2 ${
            activeTab === 'positions'
              ? 'border-emerald-400 text-emerald-400 bg-[#0E1524]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Ochiq Pozitsiyalar ({openPositions.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition-colors border-b-2 ${
            activeTab === 'history'
              ? 'border-emerald-400 text-emerald-400 bg-[#0E1524]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Yopilgan Bitimlar ({closedPositions.length})
        </button>
        <button
          onClick={() => setActiveTab('journal')}
          className={`px-4 py-2 text-xs font-mono font-semibold rounded-t-lg transition-colors border-b-2 ${
            activeTab === 'journal'
              ? 'border-emerald-400 text-emerald-400 bg-[#0E1524]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Savdo Jurnali va Tranzaksiyalar ({transactions.length})
        </button>
      </div>

      {/* Table view */}
      {activeTab === 'positions' && (
        <div className="rounded-xl border border-[#1B2436] bg-[#090D15] overflow-hidden shadow-xl">
          {openPositions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs font-mono">
              Hozircha ochiq virtual pozitsiyalar yo'q. &quot;Yangi Virtual Bitim&quot; tugmasini bosing yoki AI tahlilidan foydalaning.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-[#1B2436] bg-[#0C121E] uppercase text-slate-400 text-[11px]">
                    <th className="py-3 px-4">Aktiv</th>
                    <th className="py-3 px-4">Yo'nalish</th>
                    <th className="py-3 px-4 text-right">Kirish Narxi</th>
                    <th className="py-3 px-4 text-right">Joriy Narx</th>
                    <th className="py-3 px-4 text-right">Hajm (USD)</th>
                    <th className="py-3 px-4 text-right">SL / TP</th>
                    <th className="py-3 px-4 text-right">PnL ($ / %)</th>
                    <th className="py-3 px-4 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#151E2E]">
                  {openPositions.map((p) => {
                    const isProfit = p.pnl >= 0;
                    return (
                      <tr key={p.id} className="hover:bg-[#0E1524] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">{p.symbol}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              p.side === 'LONG'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {p.side}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">{formatAssetPrice(p.entryPrice, p.symbol)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-white">
                          {formatAssetPrice(p.currentPrice, p.symbol)}
                        </td>
                        <td className="py-3.5 px-4 text-right">${p.positionSizeUsd.toLocaleString()}</td>
                        <td className="py-3.5 px-4 text-right text-slate-400">
                          <div>SL: {p.stopLoss ? formatAssetPrice(p.stopLoss, p.symbol) : 'Yo\'q'}</div>
                          <div>TP: {p.takeProfit ? formatAssetPrice(p.takeProfit, p.symbol) : 'Yo\'q'}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold">
                          <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? '+' : ''}${p.pnl.toFixed(2)} ({isProfit ? '+' : ''}
                            {p.pnlPercent.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleClosePosition(p)}
                            className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-semibold transition-colors"
                          >
                            Yopish
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="rounded-xl border border-[#1B2436] bg-[#090D15] overflow-hidden shadow-xl">
          {closedPositions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs font-mono">
              No closed simulated trades yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-[#1B2436] bg-[#0C121E] uppercase text-slate-400 text-[11px]">
                    <th className="py-3 px-4">Instrument</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4 text-right">Entry</th>
                    <th className="py-3 px-4 text-right">Exit</th>
                    <th className="py-3 px-4 text-right">Position</th>
                    <th className="py-3 px-4 text-right">Realized PnL</th>
                    <th className="py-3 px-4 text-right">Closed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#151E2E]">
                  {closedPositions.map((p) => {
                    const isProfit = p.pnl >= 0;
                    return (
                      <tr key={p.id} className="hover:bg-[#0E1524]">
                        <td className="py-3 px-4 font-bold text-white">{p.symbol}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              p.side === 'LONG'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {p.side}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">{formatAssetPrice(p.entryPrice, p.symbol)}</td>
                        <td className="py-3 px-4 text-right">{formatAssetPrice(p.exitPrice, p.symbol)}</td>
                        <td className="py-3 px-4 text-right">${p.positionSizeUsd.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold">
                          <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? '+' : ''}${p.pnl.toFixed(2)} ({isProfit ? '+' : ''}
                            {p.pnlPercent.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500">
                          {p.closedAt ? new Date(p.closedAt).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="rounded-xl border border-[#1B2436] bg-[#090D15] p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-slate-400 font-bold">
            Simulated Ledger Transactions
          </div>
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[#0E1524] border border-[#1A2538] text-xs font-mono"
              >
                <div>
                  <div className="text-slate-200 font-medium">{tx.description}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(tx.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-bold ${
                      tx.amount >= 0 ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Balance: ${tx.balanceAfter.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Simulated Trade Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0D121C] border border-[#1E293B] rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <span>Yangi Virtual Bitim Ochish</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Instrument & Side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Aktiv</label>
                  <select
                    value={symbol}
                    onChange={(e) => {
                      const s = e.target.value;
                      setSymbol(s);
                      const t = tickers.find((x) => x.symbol === s);
                      if (t) setEntryPrice(t.price);
                    }}
                    className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-white"
                  >
                    {tickers.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Buyurtma Turi</label>
                  <div className="grid grid-cols-2 gap-1 bg-[#131A28] p-1 rounded-lg border border-[#23314A]">
                    <button
                      type="button"
                      onClick={() => setSide('LONG')}
                      className={`py-1 rounded font-bold ${
                        side === 'LONG'
                          ? 'bg-emerald-500 text-[#07090E]'
                          : 'text-slate-400'
                      }`}
                    >
                      LONG
                    </button>
                    <button
                      type="button"
                      onClick={() => setSide('SHORT')}
                      className={`py-1 rounded font-bold ${
                        side === 'SHORT'
                          ? 'bg-rose-500 text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      SHORT
                    </button>
                  </div>
                </div>
              </div>

              {/* Entry Price & Position Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Kirish Narxi ($)</label>
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-white font-bold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span>Bitim Hajmi ($)</span>
                    <span className="text-[10px] text-sky-400">
                      {((positionSizeUsd / (balance || 1)) * 100).toFixed(0)}% balans
                    </span>
                  </div>
                  <input
                    type="number"
                    value={positionSizeUsd}
                    onChange={(e) => setPositionSizeUsd(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-white font-bold"
                  />
                  <div className="flex items-center gap-1 mt-1 text-[10px]">
                    {[10, 25, 50, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPositionSizeUsd(Number((balance * (pct / 100)).toFixed(2)))}
                        className="flex-1 py-0.5 rounded bg-[#1A2436] hover:bg-[#23314A] text-slate-300"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stop Loss & Take Profit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Stop Loss ($)</label>
                  <input
                    type="number"
                    placeholder="Ixtiyoriy"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-rose-400 placeholder-slate-600 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Take Profit ($)</label>
                  <input
                    type="number"
                    placeholder="Ixtiyoriy"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-emerald-400 placeholder-slate-600 font-bold"
                  />
                </div>
              </div>

              {/* Calculated Risk & Reward Metrics Preview */}
              {(() => {
                const slVal = stopLoss ? parseFloat(stopLoss) : null;
                const tpVal = takeProfit ? parseFloat(takeProfit) : null;
                const slDist = slVal && entryPrice > 0 ? Math.abs(entryPrice - slVal) : 0;
                const slLossEst = slDist > 0 && entryPrice > 0 ? positionSizeUsd * (slDist / entryPrice) : 0;
                const tpDist = tpVal && entryPrice > 0 ? Math.abs(tpVal - entryPrice) : 0;
                const tpProfitEst = tpDist > 0 && entryPrice > 0 ? positionSizeUsd * (tpDist / entryPrice) : 0;
                const riskPercentOfBal = balance > 0 ? (slLossEst / balance) * 100 : 0;
                const rewardPercentOfBal = balance > 0 ? (tpProfitEst / balance) * 100 : 0;

                return (
                  <div className="p-2.5 rounded-lg bg-[#0C121E] border border-[#1A2538] space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Mavjud Balans:</span>
                      <span className="text-white font-bold">${balance.toLocaleString()}</span>
                    </div>
                    {slVal ? (
                      <div className="flex items-center justify-between">
                        <span className="text-rose-400 font-medium">SL urilsa yo'qotish:</span>
                        <span className="text-rose-400 font-bold">
                          -${slLossEst.toFixed(2)} (-{riskPercentOfBal.toFixed(1)}%)
                        </span>
                      </div>
                    ) : null}
                    {tpVal ? (
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-medium">TP urilsa kutilgan daromad:</span>
                        <span className="text-emerald-400 font-bold">
                          +${tpProfitEst.toFixed(2)} (+{rewardPercentOfBal.toFixed(1)}%)
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Notes */}
              <div>
                <label className="text-slate-400 block mb-1">Treyder Eslatmasi</label>
                <input
                  type="text"
                  placeholder="Ssenariy asosi yoki tahlil kodi..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#131A28] border border-[#23314A] rounded-lg p-2 text-slate-200 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleOpenPosition}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
              >
                Bitimni Ochish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
