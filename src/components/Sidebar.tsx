import React from 'react';
import {
  LayoutDashboard,
  Brain,
  CandlestickChart,
  ListOrdered,
  History,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  setMobileOpen,
}) => {
  const navItems = [
    { id: 'overview', label: 'Umumiy ko\'rinish', icon: LayoutDashboard },
    { id: 'analyzer', label: 'AI Grafik Tahlilchisi', icon: Brain, badge: 'PRO' },
    { id: 'chart', label: 'Interaktiv Grafik', icon: CandlestickChart },
    { id: 'watchlist', label: 'Bozor Kuzatuvi', icon: ListOrdered },
    { id: 'papertrading', label: 'Virtual Savdo', icon: TrendingUp },
    { id: 'history', label: 'Tahlillar Tarixi', icon: History },
    { id: 'settings', label: 'Sozlamalar', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#090D15] border-r border-[#1B2436] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Navigation Items - Clean full height list without logo or status blocks */}
        <div className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as ActiveTab);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/15 to-transparent text-emerald-400 border-l-2 border-emerald-400 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-[#121926]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};
