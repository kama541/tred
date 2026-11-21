import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AnalysisResult, PaperPosition, PaperTransaction, UserSettings } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project'));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// LocalStorage Keys for persistent fallback
const STORAGE_KEYS = {
  ANALYSIS: 'tradeiq_analysis_history',
  POSITIONS: 'tradeiq_paper_positions',
  TRANSACTIONS: 'tradeiq_paper_transactions',
  SETTINGS: 'tradeiq_user_settings',
};

// Seed default analysis for instant premium experience on first launch
const INITIAL_DEMO_ANALYSIS: AnalysisResult[] = [
  {
    id: 'demo-analysis-1',
    symbol: 'BTC/USDT',
    timeframe: '4h',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    chartContext: 'Bitcoin yuqori hajm bilan asosiy qarshilikni yorib o\'tib, $89,500 talab (demand) maydonchasini qayta sinovdan o\'tkazdi.',
    marketDirection: 'Bullish',
    scenarioType: 'Buy Setup',
    entryZone: { min: 90200, max: 91100, optimal: 90650 },
    stopLoss: 88400,
    takeProfit1: 94800,
    takeProfit2: 97500,
    takeProfit3: 101000,
    riskRewardRatio: 2.15,
    confidenceScore: 84,
    confidenceExplanation: 'Yuqori konflyuens: 4 soatlik Buqa Order Blokining qayta sinovi, 20 EMA dinamik qo\'llab-quvvatlashidan qaytish va $95,000 gacha toza likvidlik bo\'shlig\'i.',
    marketStructure: 'Ketma-ket o\'suvchi maksimumlar (HH) va o\'suvchi minimumlar (HL). $90,000 darajasida bozor strukturasi buzilishi (BOS) tasdiqlandi.',
    supportLevels: [89500, 88400, 86200],
    resistanceLevels: [94800, 97500, 101000],
    liquidityAnalysis: '$94,800 teng maksimumlari ustida xaridorlar likvidligi to\'plangan. $88,900 darajasida sotuvchilar likvidligi olindi.',
    trendAnalysis: '4 soatlik va kunlik grafiklarda kuchli o\'suvchi trend. Impuls harakatlarida hajm kengayishi.',
    technicalIndicators: {
      rsi: { value: 61.4, signal: 'Neutral', calculated: true },
      macd: { histogram: 'Positive Expanding', trend: 'Bullish Momentum', calculated: true },
      emas: { ema20: 90150, ema50: 87800, ema200: 76200, alignment: 'Full Bullish (20 > 50 > 200)', calculated: true },
      volume: { status: 'High Volume Expansion', trend: 'Supporting Trend', calculated: true },
    },
    invalidationCriteria: '4 soatlik shamning $88,400 bekor bo\'lish darajasidan pastda yopilishi buqa impulsini inkor etadi.',
    analysisReasons: [
      'Oldingi qarshilik darajasining $90,200 institutsional talab blokiga aylanishi (retest)',
      'Uchala asosiy harakatlanuvchi o\'rtacha ko\'rsatkichlar (20, 50, 200 EMA) to\'liq buqa tartibida joylashgan',
      'Orttiqcha chakana leveridj ko\'piklarisiz fanding stavkalarining barqarorlashuvi',
      'Minimumdan pastda joylashtirilgan qat\'iy stop loss bilan asimmetrik 1:2.15 Risk/Reward nisbati',
    ],
  },
  {
    id: 'demo-analysis-2',
    symbol: 'ETH/USDT',
    timeframe: '1h',
    createdAt: new Date(Date.now() - 3600000 * 9).toISOString(),
    chartContext: 'Ethereum tushuvchi trend chizig\'idan qaytmoqda va 1 soatlik RSI ko\'rsatkichida ayiq divergensiyasi shakllanmoqda.',
    marketDirection: 'Bearish',
    scenarioType: 'Sell Setup',
    entryZone: { min: 3420, max: 3450, optimal: 3435 },
    stopLoss: 3510,
    takeProfit1: 3280,
    takeProfit2: 3180,
    takeProfit3: 3050,
    riskRewardRatio: 2.07,
    confidenceScore: 78,
    confidenceExplanation: 'Ayiq breyker bloki konflyuensi, RSI divergensiyasi va 200 EMA ustida mustahkamlana olmaslik.',
    marketStructure: '$3460 ustidagi soxta likvidlik olinishidan keyin tushuvchi maksimum (LH) tasdiqlandi.',
    supportLevels: [3280, 3180, 3050],
    resistanceLevels: [3460, 3510, 3580],
    liquidityAnalysis: '$3300 ostida sotuvchilar likvidligi to\'plangan. $3450 ustidagi soxta yorib o\'tishda xaridorlar qopqonga tushdi.',
    trendAnalysis: 'Oraliq pasayuvchi kanal doirasidagi taqsimot harakati.',
    technicalIndicators: {
      rsi: { value: 68.2, signal: 'Bearish Divergence', calculated: true },
      macd: { histogram: 'Negative Expanding', trend: 'Bearish Momentum', calculated: true },
      emas: { ema20: 3430, ema50: 3445, ema200: 3480, alignment: 'Full Bearish (20 < 50 < 200)', calculated: true },
      volume: { status: 'Volume Exhaustion', trend: 'Diverging', calculated: true },
    },
    invalidationCriteria: 'Soatlik shamning $3510 darajasidan yuqorida qabul qilinishi va yopilishi qisqa (short) pozitsiyani bekor qiladi.',
    analysisReasons: [
      '$3,455 darajasida ayiq pin-bar qaytish shami bilan aniq ikkitalik cho\'qqi (double top)',
      'RSI ayiq divergensiyasi: narx yangi cho\'qqi hosil qilganda RSI pastroq cho\'qqi ko\'rsatdi',
      'Pastga yo\'nalgan 50 EMA darajasidan yuqoriga chiqa olmaslik',
    ],
  },
];

// Helper to get local data safely
function getLocal<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function setLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

// 1. ANALYSIS HISTORY API
export async function getAnalysisHistory(): Promise<AnalysisResult[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          symbol: d.symbol,
          timeframe: d.timeframe,
          createdAt: d.created_at,
          chartImageUrl: d.chart_image_url,
          chartContext: d.raw_ai_response?.chartContext || '',
          marketDirection: d.market_direction,
          scenarioType: d.scenario_type,
          signal: d.raw_ai_response?.signal,
          waitFor: d.raw_ai_response?.waitFor,
          entryZone: d.entry_zone,
          stopLoss: Number(d.stop_loss),
          takeProfit1: Number(d.take_profit_1),
          takeProfit2: d.take_profit_2 ? Number(d.take_profit_2) : undefined,
          takeProfit3: d.take_profit_3 ? Number(d.take_profit_3) : undefined,
          riskRewardRatio: Number(d.risk_reward_ratio),
          confidenceScore: d.confidence_score,
          confidenceExplanation: d.confidence_explanation,
          marketStructure: d.market_structure,
          supportLevels: d.support_levels || [],
          resistanceLevels: d.resistance_levels || [],
          liquidityAnalysis: d.liquidity_analysis,
          trendAnalysis: d.trend_analysis,
          technicalIndicators: d.technical_indicators || {},
          invalidationCriteria: d.invalidation_criteria,
          analysisReasons: d.analysis_reasons || [],
        }));
      }
    } catch (e) {
      console.warn('Supabase fetch failed, falling back to local storage', e);
    }
  }

  // LocalStorage fallback — returns full saved items (no demo data mixed in)
  const local = getLocal<AnalysisResult[]>(STORAGE_KEYS.ANALYSIS, []);
  if (local.length === 0) {
    // Only show demo data on very first visit (empty storage)
    setLocal(STORAGE_KEYS.ANALYSIS, INITIAL_DEMO_ANALYSIS);
    return INITIAL_DEMO_ANALYSIS;
  }
  return local;
}

export async function saveAnalysisResult(item: AnalysisResult): Promise<void> {
  // Save full item to localStorage (all fields including signal, waitFor, invalidationCriteria, chartImageUrl)
  const current = getLocal<AnalysisResult[]>(STORAGE_KEYS.ANALYSIS, []);
  // Avoid duplicate IDs
  const deduped = current.filter(a => a.id !== item.id);
  const updated = [item, ...deduped].slice(0, 50); // keep latest 50
  setLocal(STORAGE_KEYS.ANALYSIS, updated);

  if (supabase) {
    try {
      await supabase.from('analysis_history').insert({
        id: item.id,
        symbol: item.symbol,
        timeframe: item.timeframe,
        chart_image_url: item.chartImageUrl,
        market_direction: item.marketDirection,
        scenario_type: item.scenarioType,
        entry_zone: item.entryZone,
        stop_loss: item.stopLoss,
        take_profit_1: item.takeProfit1,
        take_profit_2: item.takeProfit2,
        take_profit_3: item.takeProfit3,
        risk_reward_ratio: item.riskRewardRatio,
        confidence_score: item.confidenceScore,
        confidence_explanation: item.confidenceExplanation,
        market_structure: item.marketStructure,
        support_levels: item.supportLevels,
        resistance_levels: item.resistanceLevels,
        liquidity_analysis: item.liquidityAnalysis,
        trend_analysis: item.trendAnalysis,
        technical_indicators: item.technicalIndicators,
        invalidation_criteria: item.invalidationCriteria,
        analysis_reasons: item.analysisReasons,
        raw_ai_response: { chartContext: item.chartContext, signal: item.signal, waitFor: item.waitFor },
      });
    } catch (e) {
      console.error('Supabase save error:', e);
    }
  }
}

export async function deleteAnalysisResult(id: string): Promise<void> {
  const current = getLocal<AnalysisResult[]>(STORAGE_KEYS.ANALYSIS, []);
  const filtered = current.filter(a => a.id !== id);
  setLocal(STORAGE_KEYS.ANALYSIS, filtered);

  if (supabase) {
    try {
      await supabase.from('analysis_history').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase delete error:', e);
    }
  }
}

// 2. PAPER TRADING POSITIONS API
const INITIAL_DEMO_POSITIONS: PaperPosition[] = [
  {
    id: 'pos-1',
    symbol: 'BTC/USDT',
    side: 'LONG',
    entryPrice: 90650,
    currentPrice: 91420.50,
    quantity: 0.15,
    positionSizeUsd: 13597.50,
    stopLoss: 88400,
    takeProfit: 94800,
    pnl: 115.58,
    pnlPercent: 0.85,
    status: 'OPEN',
    openedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    notes: 'Triggered from AI Buy Setup confluence.',
  },
];

export async function getPaperPositions(): Promise<PaperPosition[]> {
  if (!localStorage.getItem(STORAGE_KEYS.POSITIONS)) {
    setLocal(STORAGE_KEYS.POSITIONS, INITIAL_DEMO_POSITIONS);
    return INITIAL_DEMO_POSITIONS;
  }
  return getLocal<PaperPosition[]>(STORAGE_KEYS.POSITIONS, []);
}

export async function clearPaperPositions(): Promise<void> {
  setLocal(STORAGE_KEYS.POSITIONS, []);
}

export async function savePaperPosition(pos: PaperPosition): Promise<void> {
  const current = await getPaperPositions();
  const existingIdx = current.findIndex(p => p.id === pos.id);
  let updated: PaperPosition[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = pos;
  } else {
    updated = [pos, ...current];
  }
  setLocal(STORAGE_KEYS.POSITIONS, updated);
}

export async function getPaperTransactions(): Promise<PaperTransaction[]> {
  const initial: PaperTransaction[] = [
    {
      id: 'tx-1',
      type: 'DEPOSIT',
      amount: 10000,
      balanceAfter: 10000,
      description: 'Initial virtual capital allocation',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
  ];
  return getLocal<PaperTransaction[]>(STORAGE_KEYS.TRANSACTIONS, initial);
}

export async function addPaperTransaction(tx: PaperTransaction): Promise<void> {
  const current = await getPaperTransactions();
  setLocal(STORAGE_KEYS.TRANSACTIONS, [tx, ...current]);
}

// 3. USER SETTINGS API
const DEFAULT_SETTINGS: UserSettings = {
  startingBalance: 10000,
  currentBalance: 10115.58,
  defaultRiskPercent: 1.0,
  openaiApiKey: '',
  theme: 'dark',
};

export async function getUserSettings(): Promise<UserSettings> {
  return getLocal<UserSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getUserSettings();
  const merged: UserSettings = { ...current, ...settings };
  setLocal(STORAGE_KEYS.SETTINGS, merged);
}
