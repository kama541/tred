// Common Types for TRADEIQ

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W';

export type MarketDirection = 'Bullish' | 'Bearish' | 'Neutral';
export type ScenarioType = 'Buy Setup' | 'Sell Setup' | 'No Setup';

export interface EntryZone {
  min: number;
  max: number;
  optimal: number;
}

export interface TechnicalIndicatorDetails {
  rsi?: {
    value: number | null;
    signal: 'Oversold' | 'Overbought' | 'Neutral' | 'Bullish Divergence' | 'Bearish Divergence';
    calculated: boolean;
  };
  macd?: {
    histogram: 'Positive Expanding' | 'Positive Contracting' | 'Negative Expanding' | 'Negative Contracting' | 'Neutral';
    trend: 'Bullish Crossover' | 'Bearish Crossover' | 'Bullish Momentum' | 'Bearish Momentum' | 'Neutral';
    calculated: boolean;
  };
  emas?: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    alignment: 'Full Bullish (20 > 50 > 200)' | 'Full Bearish (20 < 50 < 200)' | 'Compression / Consolidation' | 'Mixed';
    calculated: boolean;
  };
  volume?: {
    status: 'High Volume Expansion' | 'Volume Exhaustion' | 'Normal' | 'Low / Anemic';
    trend: 'Supporting Trend' | 'Diverging' | 'Neutral';
    calculated: boolean;
  };
}

export interface ActiveTradeAdvice {
  detected: boolean;
  side: 'BUY' | 'SELL';
  entryPrice?: number;
  currentPrice?: number;
  status?: string;
  action: 'HOLD' | 'MOVE_SL_BREAKEVEN' | 'TAKE_PROFIT' | 'CLOSE_EARLY' | 'NONE';
  advice: string;
}

export interface AnalysisResult {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  createdAt: string;
  chartImageUrl?: string;
  chartContext: string;
  marketDirection: MarketDirection;
  scenarioType: ScenarioType;
  signal?: 'BUY' | 'SELL' | 'WAIT';
  waitFor?: string;
  entryZone: EntryZone;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskRewardRatio: number;
  confidenceScore: number; // 0 - 100
  confidenceExplanation: string;
  marketStructure: string;
  supportLevels: number[];
  resistanceLevels: number[];
  liquidityAnalysis: string;
  trendAnalysis: string;
  technicalIndicators: TechnicalIndicatorDetails;
  invalidationCriteria: string;
  analysisReasons: string[];
  notes?: string;
  activeTradeAdvice?: ActiveTradeAdvice | null;
  customPositionSize?: number;
  customRiskAmount?: number;
  customExpectedProfit?: number;
  customExpectedLoss?: number;
}

export interface CandleData {
  time: number | string; // Unix timestamp in seconds or YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  trend: 'up' | 'down' | 'neutral';
  volatility: 'Low' | 'Medium' | 'High';
  category: 'Crypto' | 'Forex' | 'Indices' | 'Commodities';
  sparkline?: number[];
  lastUpdated: string;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  positionSizeUsd: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl: number;
  pnlPercent: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  exitPrice?: number;
  notes?: string;
  analysisId?: string;
}

export interface PaperTransaction {
  id: string;
  positionId?: string;
  symbol?: string;
  type: 'DEPOSIT' | 'RESET' | 'OPEN_POSITION' | 'CLOSE_POSITION' | 'SL_HIT' | 'TP_HIT';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface UserSettings {
  startingBalance: number;
  currentBalance: number;
  defaultRiskPercent: number;
  geminiApiKey?: string;
  openaiApiKey?: string;
  theme: 'dark';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export type ActiveTab = 'overview' | 'analyzer' | 'chart' | 'watchlist' | 'history' | 'papertrading' | 'settings';
