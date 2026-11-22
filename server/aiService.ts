import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIAnalysisRequest {
  symbolHint?: string;
  timeframeHint?: string;
  notes?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  customApiKey?: string;
}

export interface AnalysisResponsePayload {
  symbol: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'WAIT';
  marketDirection: 'Bullish' | 'Bearish' | 'Neutral';
  scenarioType: 'Buy Setup' | 'Sell Setup' | 'No Setup';
  chartContext: string;
  waitFor?: string;
  entryZone: { min: number; max: number; optimal: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskRewardRatio: number;
  confidenceScore: number;
  confidenceExplanation: string;
  marketStructure: string;
  supportLevels: number[];
  resistanceLevels: number[];
  liquidityAnalysis: string;
  trendAnalysis: string;
  technicalIndicators: {
    rsi?: { value: number | null; signal: string; calculated: boolean };
    macd?: { histogram: string; trend: string; calculated: boolean };
    emas?: { ema20: number | null; ema50: number | null; ema200: number | null; alignment: string; calculated: boolean };
    volume?: { status: string; trend: string; calculated: boolean };
  };
  invalidationCriteria: string;
  analysisReasons: string[];
  disclaimer: string;
  simulatedTimestamp: string;
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Instructs GPT-4o to give BUY or SELL with levels
// WAIT is ONLY allowed for truly unreadable or flat charts
// ═══════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are TRADEIQ AI, an expert institutional trader and technical analyst.
The user sends you a screenshot of a financial chart (Forex, Crypto, Gold, Indices).

YOUR PRIMARY JOB: Identify the trade direction (BUY or SELL) and return EXACT price levels read from the chart image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: READ THE CHART
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Asset symbol — read from chart title/watermark (e.g. EUR/USD, BTC/USDT, XAU/USD, Gold Spot)
• Timeframe — read from chart label (e.g. 5m, 15m, 1h, 4h, 1D)
• Price levels — read ONLY from the right Y-axis price scale. Use those exact numbers.
  - For Gold (XAU/USD): prices are ~3400-3600 range (e.g. 3552.00)
  - For EUR/USD: prices are ~1.0500-1.1200 range (e.g. 1.09630)
  - For BTC/USDT: prices are ~80000-110000 range

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: CHOOSE SIGNAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Assign signal = "BUY" when:
  - Price is in uptrend (higher highs, higher lows)
  - Price is bouncing from a support / demand zone
  - Price just broke above resistance (bullish breakout)
  - Price pulled back to previous support after a bullish move

Assign signal = "SELL" when:
  - Price is in downtrend (lower highs, lower lows)
  - Price is rejecting from a resistance / supply zone
  - Price just broke below support (bearish breakout)
  - Price pulled back to previous resistance after a bearish move

Assign signal = "WAIT" ONLY when:
  - The chart image is completely blank, corrupted, or unreadable (no price axis visible)

⚠️ RULE: Every real chart has a direction. If ANY price movement is visible, return BUY or SELL.
NEVER return WAIT for news spikes, volatility, fakeouts, uncertainty, consolidation, or unclear setups.
If the setup is risky or uncertain, still pick BUY or SELL with a TIGHTER stop loss and add the risk note in "reason".
If there was a sudden spike/fakeout, do NOT chase the wick; set entry at pullback/retest level with confirmation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: PRICE LEVELS — CRITICAL RULES FOR STOP LOSS AND TAKE PROFIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REWARD MUST BE AT LEAST 1.5x THE RISK. This is mandatory.
⚠️ STOP LOSS MUST BE TIGHT — place it just beyond the nearest swing point, NOT far away.

STOP LOSS MAXIMUM DISTANCES (never exceed):
  • XAU/USD (Gold):  max 12-15 price points from entry  (e.g. entry 3552, SL max 3537-3540 for SELL or 3564-3567 for BUY)
  • EUR/USD, GBP/USD: max 15-20 pips from entry (e.g. entry 1.0963, SL max 1.0943-1.0948)
  • USD/JPY: max 20-25 pips from entry
  • BTC/USDT: max 300-500 USD from entry
  • ETH/USDT: max 20-30 USD from entry

BUY trade:
  entry    = current price or pullback support (never 0)
  stopLoss = just BELOW the last candle low or swing low. TIGHT, within max distance above.
  takeProfit1 = at least 1.5x the stop distance ABOVE entry. Place at nearest resistance.
  takeProfit2 = at least 2.5x the stop distance ABOVE entry.

  REQUIRED: (takeProfit1 - entry) >= 1.5 * (entry - stopLoss)

SELL trade:
  entry    = current price or pullback resistance (never 0)
  stopLoss = just ABOVE the last candle high or swing high. TIGHT, within max distance above.
  takeProfit1 = at least 1.5x the stop distance BELOW entry. Place at nearest support.
  takeProfit2 = at least 2.5x the stop distance BELOW entry.

  REQUIRED: (entry - takeProfit1) >= 1.5 * (stopLoss - entry)

EXAMPLE for XAU/USD SELL at 3552:
  entry = 3552.00, stopLoss = 3562.00 (10 pts risk) ✅ TIGHT
  takeProfit1 = 3537.00 (15 pts reward = 1.5:1) ✅
  takeProfit2 = 3522.00 (30 pts reward = 3:1) ✅

WRONG EXAMPLE (never do this):
  entry = 3548, stopLoss = 3581 (33 pts — TOO FAR ❌), takeProfit1 = 3536 (12 pts ← R:R 0.36 ❌)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT: Return ONLY valid JSON, no markdown, no commentary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "symbol": "XAU/USD",
  "timeframe": "5m",
  "signal": "SELL",
  "entry": 3552.00,
  "stopLoss": 3570.00,
  "takeProfit1": 3525.00,
  "takeProfit2": 3498.00,
  "confidence": 76,
  "trend": "Downtrend with lower highs and lower lows",
  "support": 3525.00,
  "resistance": 3570.00,
  "lastSwingHigh": 3568.00,
  "lastSwingLow": 3530.00,
  "approxCandleRange": 8.00,
  "waitFor": "Entry at 3552 resistance on pullback",
  "reason": "Price broke below key support with strong bearish momentum",
  "invalidation": "Setup is invalid if price closes above 3570"
}`;

export async function runAIAnalysis(req: AIAnalysisRequest): Promise<AnalysisResponsePayload> {
  if (!req.imageBuffer || req.imageBuffer.length === 0) {
    throw new Error("Grafik skrinshoti topilmadi. Tahlil qilish uchun grafik rasmini yuklang.");
  }

  const customKey = req.customApiKey;
  const openAiKey = (customKey && customKey.startsWith('sk-')) ? customKey : (process.env.OPENAI_API_KEY || (customKey ? customKey : undefined));
  const geminiKey = (customKey && !customKey.startsWith('sk-')) ? customKey : process.env.GEMINI_API_KEY;

  if (!openAiKey && !geminiKey) {
    throw new Error("AI API kaliti sozlanmagan. Iltimos, Sozlamalar sahifasida OpenAI yoki Gemini API kalitini kiriting.");
  }

  if (openAiKey) {
    return await runOpenAIAnalysis(req, openAiKey);
  }

  if (geminiKey) {
    return await runGeminiAnalysis(req, geminiKey);
  }

  throw new Error("Hech qanday AI provayderi topilmadi.");
}

async function runOpenAIAnalysis(req: AIAnalysisRequest, apiKey: string): Promise<AnalysisResponsePayload> {
  const modelName = 'gpt-4o';
  const imageSizeKb = (req.imageBuffer!.length / 1024).toFixed(2);
  const mimeType = req.imageMimeType || 'image/png';
  const base64Data = req.imageBuffer!.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  console.log(`[TradeIQ AI] Model: ${modelName}, Image: ${imageSizeKb} KB, Mime: ${mimeType}`);

  const userContent: any[] = [
    {
      type: 'image_url',
      image_url: {
        url: dataUrl,
        detail: 'high',
      },
    },
    {
      type: 'text',
      text: `Analyze this trading chart screenshot and return a trade setup.
Symbol hint (optional): ${req.symbolHint || 'read from chart'}
Timeframe hint (optional): ${req.timeframeHint || 'read from chart'}
${req.notes ? `User note: ${req.notes}` : ''}

REQUIRED: Return BUY or SELL with real price levels from the chart's Y-axis. Return WAIT ONLY if the chart is unreadable or completely flat. Return JSON only.`,
    },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 1200,
    }),
  });

  console.log(`[TradeIQ AI] OpenAI HTTP: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[TradeIQ AI] OpenAI Error: ${errText}`);
    throw new Error(`OpenAI xizmati xatolik qaytardi (${response.status}): ${errText}`);
  }

  const data: any = await response.json();
  const rawText = data.choices?.[0]?.message?.content;

  console.log(`[TradeIQ AI] Raw Response:\n${rawText}`);

  if (!rawText) {
    throw new Error("OpenAI bo'sh javob qaytardi.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseErr: any) {
    console.error(`[TradeIQ AI] JSON Parse Error:`, parseErr);
    throw new Error(`AI javobini JSON formatida o'qib bo'lmadi: ${parseErr.message}`);
  }

  return validateAndFormatResponse(parsed, req.symbolHint, req.timeframeHint);
}

async function runGeminiAnalysis(req: AIAnalysisRequest, apiKey: string): Promise<AnalysisResponsePayload> {
  const modelName = 'gemini-1.5-flash';
  const imageSizeKb = (req.imageBuffer!.length / 1024).toFixed(2);
  const mimeType = req.imageMimeType || 'image/png';

  console.log(`[TradeIQ AI] Gemini model: ${modelName}, Image: ${imageSizeKb} KB`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const promptText = `${SYSTEM_PROMPT}

Analyze this trading chart. Symbol hint: ${req.symbolHint || 'read from chart'}. Timeframe hint: ${req.timeframeHint || 'read from chart'}.
${req.notes ? `User note: ${req.notes}` : ''}
Return BUY or SELL with real price levels. Only return WAIT if chart is unreadable. Return JSON only.`;

  const contents: any[] = [
    { text: promptText },
    {
      inlineData: {
        data: req.imageBuffer!.toString('base64'),
        mimeType: mimeType,
      },
    },
  ];

  const result = await model.generateContent(contents);
  const rawText = result.response.text();
  console.log(`[TradeIQ AI] Gemini Raw:\n${rawText}`);

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseErr: any) {
    throw new Error(`Gemini AI javobini JSON formatida o'qib bo'lmadi: ${parseErr.message}`);
  }

  return validateAndFormatResponse(parsed, req.symbolHint, req.timeframeHint);
}

function validateAndFormatResponse(parsed: any, symbolHint?: string, timeframeHint?: string): AnalysisResponsePayload {
  // 1. Symbol & Timeframe
  let symbol = (typeof parsed.symbol === 'string' && parsed.symbol.trim() && parsed.symbol !== 'UNKNOWN')
    ? parsed.symbol.trim().toUpperCase()
    : (symbolHint || 'GRAFIK');

  if (!symbol.includes('/') && symbol.length === 6) {
    symbol = `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }

  const timeframe = (typeof parsed.timeframe === 'string' && parsed.timeframe.trim())
    ? parsed.timeframe.trim()
    : (timeframeHint || '1h');

  // 2. Signal — default to BUY if ambiguous
  const rawSignal = String(parsed.signal || '').toUpperCase();
  let signal: 'BUY' | 'SELL' | 'WAIT' = 'BUY';
  if (rawSignal.includes('SELL')) signal = 'SELL';
  else if (rawSignal.includes('WAIT')) signal = 'WAIT';
  else signal = 'BUY';

  let entry = Number(parsed.entry || 0);
  let stopLoss = Number(parsed.stopLoss || 0);
  let takeProfit1 = Number(parsed.takeProfit1 || 0);
  let takeProfit2 = Number(parsed.takeProfit2 || takeProfit1 || 0);
  let takeProfit3 = Number(parsed.takeProfit3 || takeProfit2 || 0);

  const support = Number(parsed.support || 0);
  const resistance = Number(parsed.resistance || 0);

  // If entry is 0 (AI failed to read), try to derive from support/resistance
  if (entry <= 0 && support > 0 && resistance > 0) {
    entry = signal === 'BUY' ? support : resistance;
  }

  const waitFor = typeof parsed.waitFor === 'string' ? parsed.waitFor.trim() : '';
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : (parsed.chartContext || '');
  const invalidation = typeof parsed.invalidation === 'string' ? parsed.invalidation.trim() : '';

  const MIN_RR = 1.5; // minimum acceptable reward:risk
  let riskRewardRatio = MIN_RR;

  // ── Max SL distance by asset type ──────────────────────────────
  // Prevents AI from placing SL absurdly far away
  function maxSlDistance(entryPrice: number, sym: string): number {
    const s = sym.toUpperCase();
    if (s.includes('XAU') || s.includes('GOLD'))  return entryPrice * 0.0035; // 0.35% → ~12 pts on 3550
    if (s.includes('BTC'))                         return entryPrice * 0.012;  // 1.2%
    if (s.includes('ETH') || s.includes('SOL'))    return entryPrice * 0.015;  // 1.5%
    if (s.includes('JPY'))                         return entryPrice * 0.004;  // 0.4%
    // Forex major pairs (EUR, GBP, etc.)
    return entryPrice * 0.003; // 0.3% → ~33 pips on 1.09
  }

  // 3. Level correction & enforce minimum R:R + SL cap
  if (signal === 'BUY' && entry > 0) {
    // Fix stopLoss direction
    if (stopLoss <= 0 || stopLoss >= entry) {
      stopLoss = support > 0 && support < entry ? support : Number((entry - entry * 0.003).toFixed(5));
    }
    // ⚡ Cap SL distance — if AI placed SL too far, tighten it
    const maxSl = maxSlDistance(entry, symbol);
    if (entry - stopLoss > maxSl) {
      stopLoss = Number((entry - maxSl).toFixed(5));
      console.log(`[TradeIQ AI] BUY: SL capped to max distance ${maxSl.toFixed(5)}, new SL=${stopLoss}`);
    }
    const risk = entry - stopLoss;

    // Fix takeProfit1: must give ≥ 1.5:1 R:R
    const minTP1 = entry + risk * MIN_RR;
    if (takeProfit1 <= entry || takeProfit1 < minTP1) {
      takeProfit1 = (resistance > minTP1) ? resistance : Number(minTP1.toFixed(5));
    }
    // Fix takeProfit2
    if (takeProfit2 <= takeProfit1) {
      takeProfit2 = Number((entry + risk * (MIN_RR + 1.0)).toFixed(5));
    }

    const reward = takeProfit1 - entry;
    riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : MIN_RR;
    console.log(`[TradeIQ AI] BUY → Entry:${entry} SL:${stopLoss} TP1:${takeProfit1} TP2:${takeProfit2} Risk:${risk.toFixed(5)} R:R:${riskRewardRatio}`);

  } else if (signal === 'SELL' && entry > 0) {
    // Fix stopLoss direction
    if (stopLoss <= entry) {
      stopLoss = resistance > entry ? resistance : Number((entry + entry * 0.003).toFixed(5));
    }
    // ⚡ Cap SL distance — if AI placed SL too far, tighten it
    const maxSl = maxSlDistance(entry, symbol);
    if (stopLoss - entry > maxSl) {
      stopLoss = Number((entry + maxSl).toFixed(5));
      console.log(`[TradeIQ AI] SELL: SL capped to max distance ${maxSl.toFixed(5)}, new SL=${stopLoss}`);
    }
    const risk = stopLoss - entry;

    // Fix takeProfit1: must give ≥ 1.5:1 R:R
    const minTP1 = entry - risk * MIN_RR;
    if (takeProfit1 <= 0 || takeProfit1 >= entry || takeProfit1 > minTP1) {
      takeProfit1 = (support > 0 && support <= minTP1) ? support : Number(minTP1.toFixed(5));
    }
    // Fix takeProfit2
    if (takeProfit2 <= 0 || takeProfit2 >= takeProfit1) {
      takeProfit2 = Number((entry - risk * (MIN_RR + 1.0)).toFixed(5));
    }

    const reward = entry - takeProfit1;
    riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : MIN_RR;
    console.log(`[TradeIQ AI] SELL → Entry:${entry} SL:${stopLoss} TP1:${takeProfit1} TP2:${takeProfit2} Risk:${risk.toFixed(5)} R:R:${riskRewardRatio}`);

  } else if (signal === 'WAIT') {
    if (entry > 0 && stopLoss > 0 && takeProfit1 > 0) {
      const risk = Math.abs(entry - stopLoss);
      const reward = Math.abs(takeProfit1 - entry);
      if (risk > 0) riskRewardRatio = Number((reward / risk).toFixed(2));
    }
  }

  if (riskRewardRatio <= 0 || !Number.isFinite(riskRewardRatio)) riskRewardRatio = MIN_RR;

  const scenarioType: 'Buy Setup' | 'Sell Setup' | 'No Setup' =
    signal === 'BUY' ? 'Buy Setup' : signal === 'SELL' ? 'Sell Setup' : 'No Setup';

  const marketDirection: 'Bullish' | 'Bearish' | 'Neutral' =
    signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral';

  const confidenceScore = Math.min(100, Math.max(50, Number(parsed.confidence || 78)));

  return {
    symbol,
    timeframe,
    signal,
    marketDirection,
    scenarioType,
    chartContext: reason || `${symbol} (${timeframe}) bozor strukturasi va sham dinamikasi tahlil qilindi.`,
    waitFor: waitFor || (signal === 'BUY'
      ? `${entry} darajasida kirish rejalashtirilgan`
      : signal === 'SELL'
      ? `${entry} darajasida sotish rejalashtirilgan`
      : 'Qulayroq kirish darajasi kutilmoqda'),
    entryZone: { min: entry, max: entry, optimal: entry },
    stopLoss,
    takeProfit1,
    takeProfit2: takeProfit2 || takeProfit1,
    takeProfit3: takeProfit3 || takeProfit2 || takeProfit1,
    riskRewardRatio,
    confidenceScore,
    confidenceExplanation: `Struktura, qo'llab-quvvatlash/qarshilik va 1:${riskRewardRatio} Risk/Reward nisbati asosida hisoblandi.`,
    marketStructure: parsed.trend || (signal === 'BUY'
      ? "O'suvchi buyurtma oqimi (Higher Highs / Higher Lows)"
      : "Tushuvchi buyurtma oqimi (Lower Highs / Lower Lows)"),
    supportLevels: support > 0 ? [support] : (stopLoss > 0 && signal === 'BUY' ? [stopLoss] : []),
    resistanceLevels: resistance > 0 ? [resistance] : (takeProfit1 > 0 && signal === 'BUY' ? [takeProfit1] : []),
    liquidityAnalysis: signal === 'BUY'
      ? `Asosiy maqsad ${takeProfit1} qarshilik darajasidagi xaridorlar likvidligidir`
      : `Asosiy maqsad ${takeProfit1} qo'llab-quvvatlash darajasidagi sotuvchilar likvidligidir`,
    trendAnalysis: parsed.trend || `${marketDirection} yo'nalishli dinamika`,
    technicalIndicators: {
      rsi: { value: null, signal: signal === 'BUY' ? 'Bullish Momentum' : 'Bearish Momentum', calculated: false },
      macd: { histogram: 'Neutral', trend: 'Neutral', calculated: false },
      emas: { ema20: null, ema50: null, ema200: null, alignment: 'Mixed', calculated: false },
      volume: { status: 'Normal', trend: 'Supporting Trend', calculated: false },
    },
    invalidationCriteria: invalidation || `${stopLoss} darajasi buzilganda ushbu ssenariy bekor qilinadi`,
    analysisReasons: [
      reason || "Bozor strukturasi va asosiy darajalar tahlili",
      waitFor ? `Reja: ${waitFor}` : `Risk/Reward: 1:${riskRewardRatio}`,
    ],
    disclaimer: "Ta'limiy simulyatsiya ssenariysi. Moliyaviy maslahat emas.",
    simulatedTimestamp: new Date().toISOString(),
  };
}
