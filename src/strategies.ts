// Comprehensive Institutional Trading Strategies for TRADEIQ
// Each strategy contains a verifiable checklist, invalidation/avoid conditions, and trade rules.

export interface StrategyDefinition {
  id: string;
  name: string;
  uzbekName: string;
  description: string;
  intendedDirection: 'BUY' | 'SELL' | 'BOTH';
  minRR: number;
  entryType: 'MARKET' | 'LIMIT_PULLBACK';
  checklist: string[];
  avoidConditions: string[];
  entryRule: string;
  stopLossRule: string;
  takeProfitRule: string;
}

export interface StrategyEvaluation {
  strategyId: string;
  strategyName: string;
  conditionsMet: string[];
  conditionsNotMet: string[];
  conditionsTotal: number;
  score: number; // 0 - 100
  direction: 'BUY' | 'SELL' | 'none';
  avoidApplies: boolean;
  avoidReason?: string;
  reason: string;
}

export interface ChartReadData {
  symbol: string;
  timeframe: string;
  readable: boolean;
  visiblePriceAxis: number[]; // Listed numbers visible on the right Y-axis
  lastVisiblePrice: number;
  visiblePriceRange: { min: number; max: number };
  trendDirection: 'Bullish' | 'Bearish' | 'Range' | 'Unclear';
  lastSwingHigh: number;
  lastSwingLow: number;
  nearestSupport: number;
  nearestResistance: number;
  approxCandleRange: number;
  indicatorsDetected: {
    ema?: string;
    rsi?: string;
    volume?: string;
    other?: string;
  };
}

export interface VerificationResult {
  approved: boolean;
  problems: string[];
  calibrationCheck: string;
}

export const TRADING_STRATEGIES: StrategyDefinition[] = [
  {
    id: 'trend_pullback',
    name: 'Trend Pullback & EMA Bounce',
    uzbekName: "Trend bo'yicha qaytish (Pullback / EMA)",
    description: "Aniq o'suvchi yoki tushuvchi trendda narxning EMA yoki avvalgi darajaga qaytib, trend yo'nalishida davom etishi.",
    intendedDirection: 'BOTH',
    minRR: 2.0,
    entryType: 'LIMIT_PULLBACK',
    checklist: [
      "Bozorda aniq yo'nalishli struktura mavjud (Higher Highs / Higher Lows yoki Lower Highs / Lower Lows)",
      "Narx asosiy harakatdan so'ng EMA (20/50) yoki avvalgi sinov zonasiga (pullback) qaytdi",
      "Pullback darajasida trend yo'nalishida davom etish shamchasi (rejection wick / tasdiq) paydo bo'ldi",
      "Hajm yoki momentum trend yo'nalishini qo'llab-quvvatlamoqda"
    ],
    avoidConditions: [
      "Bozor yo'nalishsiz flet yoki tor diapazonda siqilib qolgan",
      "Qarama-qarshi kuchli divergensiya yoki katta teskari shamlar mavjud",
      "Narx pullback zonasidan ancha uzoqlashib ketgan (overextended)"
    ],
    entryRule: "Pullback / EMA qaytish nuqtasida yoki tasdiq shamining yopilishida",
    stopLossRule: "Pullback paytida hosil bo'lgan eng so'nggi swing cho'qqisi/tubi orqasida (tight)",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi (R = entry - SL masofasi)"
  },
  {
    id: 'breakout_retest',
    name: 'Breakout & Retest',
    uzbekName: "Yorib o'tish va qayta sinash (Breakout & Retest)",
    description: "Asosiy qo'llab-quvvatlash yoki qarshilik darajasini yorib o'tib, uni orqadan muvaffaqiyatli sinab qaytishi.",
    intendedDirection: 'BOTH',
    minRR: 2.0,
    entryType: 'LIMIT_PULLBACK',
    checklist: [
      "Asosiy gorizontal Support yoki Resistance darajasi to'liq tanali sham bilan yorib o'tildi",
      "Yorilish paytida sezilarli hajm yoki kuchli impuls kuzatildi",
      "Narx yorilgan darajani qayta sinash (retest) uchun qaytdi",
      "Retest darajasidan qaytish (rejection) shamchasi shakllandi va daraja himoyalandi"
    ],
    avoidConditions: [
      "Soxta yorilish (faqat uzun soya bilan yorib, darhol daraja ichiga qaytib yopilgan fakeout)",
      "Retest bo'lmasdan narx juda uzoqqa ketib qolgan",
      "Daraja bir necha marta tartibsiz kesib o'tilgan (iflos daraja)"
    ],
    entryRule: "Yorilgan darajaning retest nuqtasida (Limit) yoki tasdiq shamida",
    stopLossRule: "Yorilgan daraja va retest shamining orqa tomonida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  },
  {
    id: 'support_demand_bounce',
    name: 'Support / Demand Zone Bounce',
    uzbekName: "Qo'llab-quvvatlash / Talab zonasidan sakrash",
    description: "Kuchli xaridlar boshlangan asosiy qo'llab-quvvatlash yoki talab (Demand) zonasidan yuqoriga qaytish.",
    intendedDirection: 'BUY',
    minRR: 2.0,
    entryType: 'MARKET',
    checklist: [
      "Narx aniq ko'rinib turgan kuchli Support / Demand zonasiga yetib keldi",
      "Zonaga yaqinlashganda sotuvchilar shamlari kichrayib, sotuv bosimi so'ndi",
      "Pastki likvidlik tozalandi va xaridorlarning faollashuv shamchasi (Hammer / Engulfing) paydo bo'ldi",
      "Narx zona ostiga tushmasdan mustahkam ushlab turildi"
    ],
    avoidConditions: [
      "Narx zonani katta qizil shamlar bilan shiddatli teshishda davom etmoqda",
      "Zona avval bir necha marta sinovdan o'tib zaiflashib bo'lgan",
      "Katta yangiliklar paytidagi nazoratsiz shamlar"
    ],
    entryRule: "Talab zonasining yuqori chegarasida xaridorlar tasdig'i bilan",
    stopLossRule: "Support zonasi va oxirgi pastki soyaning ostida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  },
  {
    id: 'resistance_supply_rejection',
    name: 'Resistance / Supply Zone Rejection',
    uzbekName: "Qarshilik / Taklif zonasidan qaytish",
    description: "Kuchli sotuvlar boshlangan asosiy qarshilik yoki taklif (Supply) zonasidan pastga qaytish.",
    intendedDirection: 'SELL',
    minRR: 2.0,
    entryType: 'MARKET',
    checklist: [
      "Narx aniq ko'rinib turgan kuchli Resistance / Supply zonasiga yetib keldi",
      "Yuqori likvidlik tozalandi (yuqoriga uzun soya / fakeout)",
      "Sotuvchilarning faollashuv shamchasi (Shooting Star / Bearish Engulfing) paydo bo'ldi",
      "Narx zona ustida yopila olmadi va sotuv bosimi ortdi"
    ],
    avoidConditions: [
      "Narx zonani to'liq katta yashil sham bilan yuqoriga yorib o'tmoqda",
      "Narx qarshilik ostida siqilib (ascending triangle / compression) yuqoriga portlashga tayyorlanmoqda",
      "Qarshilikka qarshi kuchli parabolik ko'tarilish davom etmoqda"
    ],
    entryRule: "Qarshilik zonasida sotuvchilar tasdig'i bilan",
    stopLossRule: "Qarshilik zonasi va eng yuqori soyaning ustida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  },
  {
    id: 'range_trading',
    name: 'Range Trading (Mean Reversion)',
    uzbekName: "Diapazonda savdo (Flet / Range)",
    description: "Aniq chegaralangan gorizontal diapazonda (Range High / Range Low) chegaralardan markazga yoki qarama-qarshi tomonga savdo.",
    intendedDirection: 'BOTH',
    minRR: 2.0,
    entryType: 'LIMIT_PULLBACK',
    checklist: [
      "Bozor kamida 2 ta cho'qqi va 2 ta tub bilan chegaralangan aniq diapazonda harakatlanmoqda",
      "Narx Range Low (pastki) yoki Range High (yuqori) chegarasiga keldi",
      "Chegarani yorib o'tolmasdan ichkariga qaytish belgisi shakllandi",
      "RSI haddan tashqari xarid (70+) yoki sotuv (30-) chegarasida"
    ],
    avoidConditions: [
      "Diapazondan kuchli impulsli trend yorilishi boshlanmoqda",
      "Narx diapazon o'rtasida (Range EQ) turibdi (50/50 noaniq hudud)",
      "Diapazon juda tor va risk/reward 1:2 dan kichik"
    ],
    entryRule: "Range Low da BUY yoki Range High da SELL chegaradan qaytganda",
    stopLossRule: "Diapazon chegarasidan biroz tashqarida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  },
  {
    id: 'liquidity_sweep_reversal',
    name: 'Liquidity Sweep & SFP Reversal',
    uzbekName: "Likvidlikni yig'ish va burilish (SFP)",
    description: "Oldingi muhim swing cho'qqisi yoki tubidan likvidlik olinib (soxta yorib), narxning tezda orqaga qaytishi.",
    intendedDirection: 'BOTH',
    minRR: 2.0,
    entryType: 'MARKET',
    checklist: [
      "Oldingi muhim Swing High yoki Swing Low darajasidan oshib o'tildi",
      "Sham tanasi daraja tashqarisida qola olmadi va uzun soya qoldirib orqaga yopildi (SFP)",
      "Darhol qarama-qarshi yo'nalishda agressiv impuls paydo bo'ldi",
      "Bozor strukturasining qisqa muddatli burilishi (MSS / CHoCH) yuz berdi"
    ],
    avoidConditions: [
      "Sham to'liq tanasi bilan darajadan tashqarida yopildi (bu haqiqiy breakout, sweep emas)",
      "Bir necha sham ketma-ket yangi cho'qqi/tub qilib kuchayib bormoqda",
      "Nazoratsiz yangiliklar spayki davom etmoqda"
    ],
    entryRule: "Sham daraja ichiga qaytib yopilgandan so'ng darhol",
    stopLossRule: "Olingan likvidlik soyasining (eng yuqori/eng pastki nuqta) orqasida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  },
  {
    id: 'momentum_expansion',
    name: 'Momentum Volume Expansion',
    uzbekName: "Kuchli hajm va impuls (Momentum)",
    description: "Uzoq konsolidatsiyadan keyin yuqori hajm bilan kuchli yo'nalishli impuls boshlanishi.",
    intendedDirection: 'BOTH',
    minRR: 2.0,
    entryType: 'MARKET',
    checklist: [
      "Konsolidatsiya yoki tor zonadan katta to'liq tanali impuls shamchasi chiqdi",
      "Savdo hajmi (Volume) oldingi shamlarga nisbatan sezilarli yuqori",
      "Narx barcha yaqin EMAlardan (20/50) uzoqlashib tezlashmoqda",
      "Qarshilik yoki qo'llab-quvvatlashgacha bo'lgan masofa erkin va ochiq"
    ],
    avoidConditions: [
      "Sham haddan tashqari cho'zilgan va charchash belgisi (exhaustion wick) qoldirgan",
      "Narx darhol katta to'siq darajasiga taqalib turibdi",
      "Likvidlik past va hajm sun'iy spaykdan iborat"
    ],
    entryRule: "Impuls shamining yopilishida yoki kichik mikro-pullbackda",
    stopLossRule: "Impuls shamining tubi yoki yorilgan konsolidatsiya o'rtasida",
    takeProfitRule: "TP1 kamida 2R (1:2), TP2 kamida 3R (1:3) masofada joylashtiriladi"
  }
];

export function getStrategyById(id: string): StrategyDefinition | undefined {
  return TRADING_STRATEGIES.find((s) => s.id === id);
}
