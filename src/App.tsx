import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { AIAnalyzer } from './components/Analyzer/AIAnalyzer';
import { InteractiveChart } from './components/TradingChart/InteractiveChart';
import { WatchlistView } from './components/Watchlist/WatchlistView';
import { PaperTradingView } from './components/PaperTrading/PaperTradingView';
import { HistoryView } from './components/History/HistoryView';
import { SettingsView } from './components/Settings/SettingsView';
import { ActiveTab, WatchlistItem, AnalysisResult, CandleData, Timeframe } from './types';
import { fetchLiveTickers } from './services/marketData';
import { getAnalysisHistory, getUserSettings } from './lib/supabase';

export const App: React.FC = () => {
  // Default to 'analyzer' (AI Grafik Tahlilchisi) on load
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyzer');
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Global State
  const [tickers, setTickers] = useState<WatchlistItem[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [, setVirtualBalance] = useState<number>(10000);

  // Routing / Parameter passing between tabs
  const [chartSymbol, setChartSymbol] = useState<string>('BTC/USDT');
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>('1h');
  const [analyzerSymbol, setAnalyzerSymbol] = useState<string>('BTC/USDT');
  const [analyzerTimeframe, setAnalyzerTimeframe] = useState<Timeframe>('1h');
  const [analyzerCandles, setAnalyzerCandles] = useState<CandleData[]>([]);
  const [prefilledPaperSetup, setPrefilledPaperSetup] = useState<AnalysisResult | null>(null);
  const [activeChartSetup, setActiveChartSetup] = useState<AnalysisResult | null>(null);

  // Load initial market and user data
  const loadInitialData = useCallback(async () => {
    const liveTickers = await fetchLiveTickers();
    setTickers(liveTickers);

    const pastAnalyses = await getAnalysisHistory();
    setHistory(pastAnalyses);

    const settings = await getUserSettings();
    setVirtualBalance(settings.currentBalance);
  }, []);

  useEffect(() => {
    loadInitialData();
    // Poll live prices every 15 seconds
    const interval = setInterval(async () => {
      const live = await fetchLiveTickers();
      setTickers(live);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

  // Handlers for cross-module workflows
  const handleSelectSymbolFromWatchlist = (symbol: string) => {
    setChartSymbol(symbol);
    setActiveTab('chart');
  };

  const handleAnalyzeSymbolFromWatchlist = (symbol: string) => {
    setAnalyzerSymbol(symbol);
    setActiveTab('analyzer');
  };

  const handleSendToAnalyzerFromChart = (
    symbol: string,
    timeframe: Timeframe,
    candles: CandleData[]
  ) => {
    setAnalyzerSymbol(symbol);
    setAnalyzerTimeframe(timeframe);
    setAnalyzerCandles(candles);
    setActiveTab('analyzer');
  };

  const handleOpenPaperTradeFromSetup = (setup: AnalysisResult) => {
    setPrefilledPaperSetup(setup);
    setActiveTab('papertrading');
  };

  const handleAnalysisSaved = (newResult: AnalysisResult) => {
    setHistory((prev) => [newResult, ...prev]);
    setActiveChartSetup(newResult);
  };

  return (
    <div className="flex min-h-screen bg-[#07090E] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Mobile Menu Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-[#0E1522]/90 backdrop-blur-md border border-[#1E293B] text-slate-400 hover:text-white shadow-lg"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Area - fills the full height without top bar */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Tab Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pt-14 lg:pt-8">
          {/* Keep AIAnalyzer mounted in background so tab switching never resets uploaded chart or analysis */}
          <div className={activeTab === 'analyzer' || activeTab === 'overview' ? 'block' : 'hidden'}>
            <AIAnalyzer
              initialSymbol={analyzerSymbol}
              initialTimeframe={analyzerTimeframe}
              initialCandles={analyzerCandles}
              onOpenPaperTrade={handleOpenPaperTradeFromSetup}
              onAnalysisSaved={handleAnalysisSaved}
            />
          </div>

          {activeTab === 'chart' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    Interaktiv Shamli Grafik
                  </h1>
                  <p className="text-sm text-slate-400 mt-0.5">
                    TradingView Lightweight Charts: EMA ko'rsatkichlari, hajm gistogrammasi va AI skaner.
                  </p>
                </div>
              </div>

              <div className="h-[620px] w-full">
                <InteractiveChart
                  symbol={chartSymbol}
                  timeframe={chartTimeframe}
                  onSymbolChange={setChartSymbol}
                  onTimeframeChange={setChartTimeframe}
                  onSendToAnalyzer={handleSendToAnalyzerFromChart}
                  activeSetup={activeChartSetup}
                />
              </div>
            </div>
          )}

          {activeTab === 'watchlist' && (
            <WatchlistView
              tickers={tickers}
              onSelectSymbol={handleSelectSymbolFromWatchlist}
              onAnalyzeSymbol={handleAnalyzeSymbolFromWatchlist}
            />
          )}

          {activeTab === 'papertrading' && (
            <PaperTradingView
              tickers={tickers}
              prefilledSetup={prefilledPaperSetup}
              onClearPrefilled={() => setPrefilledPaperSetup(null)}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              history={history}
              onOpenAnalysis={(item) => {
                setActiveChartSetup(item);
                setChartSymbol(item.symbol);
                setChartTimeframe(item.timeframe);
                setActiveTab('chart');
              }}
              onDeleteAnalysis={(id) => {
                setHistory((prev) => prev.filter((h) => h.id !== id));
              }}
              onPaperTrade={handleOpenPaperTradeFromSetup}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export default App;
