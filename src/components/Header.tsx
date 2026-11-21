import React, { useState, useEffect } from 'react';
import {
  Menu,
  Clock,
  Wallet,
  Sparkles,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { ActiveTab, WatchlistItem } from '../types';

interface HeaderProps {
  setMobileOpen: (open: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  tickers: WatchlistItem[];
  virtualBalance: number;
  onRefreshData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  setMobileOpen,
  setActiveTab,
  tickers,
  virtualBalance,
  onRefreshData,
}) => {
  const [currentUtcTime, setCurrentUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentUtcTime(now.toUTCString().slice(17, 22) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Determine current financial market sessions based on UTC
  const getSessionStatus = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();

    // London: 08:00 - 16:30 UTC
    const londonOpen = utcHour >= 8 && utcHour < 16;
    // New York: 13:00 - 21:00 UTC
    const nyOpen = utcHour >= 13 && utcHour < 21;
    // Tokyo: 00:00 - 09:00 UTC
    const tokyoOpen = utcHour >= 0 && utcHour < 9;
    // Sydney: 22:00 - 07:00 UTC
    const sydneyOpen = utcHour >= 22 || utcHour < 7;

    return [
      { name: 'London', open: londonOpen },
      { name: 'Nyu-York', open: nyOpen },
      { name: 'Tokio', open: tokyoOpen },
      { name: 'Sidney', open: sydneyOpen },
    ];
  };

  const sessions = getSessionStatus();

  return (
    <header className="h-16 bg-[#090D15]/95 backdrop-blur-md border-b border-[#1B2436] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Left side: Hamburger + Ticker Tape preview */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-[#151D2C]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Market Sessions Indicators */}
        <div className="hidden sm:flex items-center gap-2 bg-[#0E1420] border border-[#1E293B] px-3 py-1.5 rounded-lg text-xs">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-mono text-[11px] mr-1 hidden md:inline">SESSIYALAR:</span>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            {sessions.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.open ? 'bg-emerald-400 shadow-[0_0_6px_#00F0A8]' : 'bg-slate-600'
                  }`}
                />
                <span className={s.open ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                  {s.name}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{currentUtcTime}</span>
        </div>
      </div>

      {/* Right side: Balance + Analyze CTA */}
      <div className="flex items-center gap-3">
        {onRefreshData && (
          <button
            onClick={onRefreshData}
            title="Bozor ma'lumotlarini yangilash"
            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#121926] rounded-lg transition-colors border border-transparent hover:border-[#1E293B]"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        {/* Virtual Account Balance Chip */}
        <div
          onClick={() => setActiveTab('papertrading')}
          className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0E1522] border border-[#1E293B] hover:border-emerald-500/40 transition-all text-xs"
        >
          <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
            <Wallet className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-400">Virtual Balans</div>
            <div className="font-mono font-semibold text-slate-100">
              ${virtualBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Analyze Chart CTA */}
        <button
          onClick={() => setActiveTab('analyzer')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-semibold text-xs tracking-wide transition-all shadow-md shadow-emerald-500/20 active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5 fill-current" />
          <span>GRAFIKNI TAHLIL QILISH</span>
        </button>
      </div>
    </header>
  );
};
