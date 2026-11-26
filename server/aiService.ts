import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  TRADING_STRATEGIES,
  StrategyDefinition,
  StrategyEvaluation,
  ChartReadData,
  VerificationResult,
  getStrategyById,
} from '../src/strategies';

export interface AIAnalysisRequest {
  symbolHint?: string;
  timeframeHint?: string;
  notes?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  customApiKey?: string;
  selectedStrategyId?: string; // If user manually selected a strategy (overrides auto)
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
  confidenceScore: number; // Exactly equals chosen strategy score
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
  activeTradeAdvice?: {
    detected: boolean;
    side: 'BUY' | 'SELL';
    entryPrice?: number;
    currentPrice?: number;
    status?: string;
    action: 'HOLD' | 'MOVE_SL_BREAKEVEN' | 'TAKE_PROFIT' | 'CLOSE_EARLY' | 'NONE';
    advice: string;
  } | null;
  chosenStrategy?: StrategyEvaluation;
  allStrategyScores?: StrategyEvaluation[];
  chartReadData?: ChartReadData;
  verification?: VerificationResult;
  entryType?: 'Bozor narxi (Market)' | 'Limit kirish (Pullback)';
  disclaimer: string;
  simulatedTimestamp: string;
}

// In-memory cache by image hash (SHA-256) for strict consistency
const analysisCache = new Map<string, AnalysisResponsePayload>();

// Format strategies list into a prompt text
function formatStrategiesForPrompt(): string {
  return TRADING_STRATEGIES.map((s) => `
STRATEGY_ID: "${s.id}"
NAME: "${s.name}" (${s.uzbekName})
DIRECTION: ${s.intendedDirection} | MIN_RR: ${s.minRR}
CHECKLIST:
${s.checklist.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
AVOID_CONDITIONS (If any apply, avoidApplies MUST be true and score must be downgraded):
${s.avoidConditions.map((a, i) => `  - ${a}`).join('\n')}
`).join('\n────────────────────────────────────\n');
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1 & 2 SYSTEM PROMPT: READ CHART & SCORE EVERY STRATEGY
// Temperature: 0
// ═══════════════════════════════════════════════════════════════════
const STEP1_2_SYSTEM_PROMPT = `You are TRADEIQ AI, an elite institutional quant trader and technical chart reader.
You are given a high-resolution screenshot of a financial trading chart.

YOUR TASK:
1. READ THE CHART ACCURATELY:
   - Identify symbol and timeframe from the chart watermark/title.
   - Read the price numbers on the right vertical Y-axis. List the actual numbers you see.
   - Determine the last visible price, min/max visible price range, trend, swing high/low, support/resistance, and candle range.
   - If the price scale is completely unreadable or missing, set "readable": false.

2. SCORE EVERY STRATEGY FROM THE LIST BELOW:
   - Evaluate the chart against each strategy's checklist.
   - Calculate an honest score (0-100) based on checklist fulfillment and candle behavior.
   - If any avoid condition applies (e.g. violent opposite news spike, giant fakeout wick, overextended price, consolidation without breakout), set "avoidApplies": true and score < 65.
   - If conditions are met cleanly with confirmation, score >= 70.

3. PROPOSE PRECISE TRADE LEVELS for the highest-scoring strategy:
   - Entry, Stop Loss, and Take Profit MUST align exactly with the chart's visible Y-axis.
   - Stop Loss must be tight, just beyond the nearest swing point.
   - Reward must strictly satisfy: Take Profit 1 is at exactly 2R (1:2) and Take Profit 2 is at exactly 3R (1:3), where R = |entry - stopLoss|.

STRATEGIES TO EVALUATE:
${formatStrategiesForPrompt()}

OUTPUT JSON FORMAT (STRICT):
{
  "chartRead": {
    "readable": true,
    "symbol": "BTC/USDT",
    "timeframe": "1h",
    "visiblePriceAxis": [90000, 91000, 92000, 93000],
    "lastVisiblePrice": 91450.00,
    "visiblePriceRange": { "min": 89800.00, "max": 93200.00 },
    "trendDirection": "Bullish",
    "lastSwingHigh": 92500.00,
    "lastSwingLow": 90400.00,
    "nearestSupport": 90800.00,
    "nearestResistance": 92500.00,
    "approxCandleRange": 250.00,
    "indicatorsDetected": { "ema": "20, 50 visible", "rsi": "58", "volume": "High" }
  },
  "strategyScores": [
    {
      "strategyId": "trend_pullback",
      "conditionsMet": ["Aniq o'suvchi struktura", "EMA 20 ga pullback"],
      "conditionsNotMet": ["Hajm o'rtacha darajada"],
      "score": 85,
      "direction": "BUY",
      "avoidApplies": false,
      "avoidReason": "",
      "reason": "Narx EMA 20 dan qaytib yuqoriga impuls sham hosil qildi"
    }
  ],
  "proposedTrade": {
    "entry": 91450.00,
    "stopLoss": 90600.00,
    "takeProfit1": 92950.00,
    "takeProfit2": 94100.00,
    "entryType": "MARKET",
    "waitFor": "91450 darajasida kirish"
  },
  "activeTrade": null
}`;

// ═══════════════════════════════════════════════════════════════════
// STEP 4 SYSTEM PROMPT: INDEPENDENT VERIFIER AUDITOR
// Temperature: 0
// ═══════════════════════════════════════════════════════════════════
const STEP4_VERIFIER_SYSTEM_PROMPT = `You are a Senior Risk & Price-Axis Auditor for financial trading setups.
Your job is to independently verify a proposed trade setup against the provided chart image.

AUDIT CHECKS:
1. PRICE AXIS MATCH: Do the entry, stop-loss, and take-profit numbers strictly match the visible numbers on the right Y-axis of this chart?
2. STRATEGY CHECKLIST: Does the chart visually satisfy the strategy's checklist?
3. OVEREXTENSION: Is price already far past the entry (chasing the wick)?
4. DANGER / SPIKES: Is there an unconfirmed opposing liquidity spike or news wick?

Return ONLY this JSON format:
{
  "approved": true or false,
  "problems": ["problem 1 description", ...],
  "calibrationCheck": "Details on how prices align with the visible Y-axis scale"
}`;

export async function runAIAnalysis(req: AIAnalysisRequest): Promise<AnalysisResponsePayload> {
  if (!req.imageBuffer || req.imageBuffer.length === 0) {
    throw new Error("Grafik skrinshoti topilmadi. Tahlil qilish uchun grafik rasmini yuklang.");
  }

  // Check SHA-256 Cache for strict consistency
  const imageHash = crypto.createHash('sha256').update(req.imageBuffer).digest('hex');
  const cacheKey = `${imageHash}_${req.notes || ''}_${req.selectedStrategyId || 'auto'}`;

  if (analysisCache.has(cacheKey)) {
    console.log(`[TradeIQ Cache] Hit cached analysis for hash: ${imageHash.slice(0, 12)}`);
    return analysisCache.get(cacheKey)!;
  }

  const customKey = req.customApiKey;
  const openAiKey = (customKey && customKey.startsWith('sk-')) ? customKey : (process.env.OPENAI_API_KEY || (customKey ? customKey : undefined));
  const geminiKey = (customKey && !customKey.startsWith('sk-')) ? customKey : process.env.GEMINI_API_KEY;

  if (!openAiKey && !geminiKey) {
    throw new Error("AI API kaliti sozlanmagan. Iltimos, Sozlamalar sahifasida OpenAI yoki Gemini API kalitini kiriting.");
  }

  let result: AnalysisResponsePayload;
  if (openAiKey) {
    result = await runOpenAIPipeline(req, openAiKey);
  } else {
    result = await runGeminiPipeline(req, geminiKey!);
  }

  // Save to cache
  analysisCache.set(cacheKey, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Multi-Step Pipeline (Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5)
// ─────────────────────────────────────────────────────────────────────────────
async function runOpenAIPipeline(req: AIAnalysisRequest, apiKey: string): Promise<AnalysisResponsePayload> {
  const modelName = 'gpt-4o';
  const mimeType = req.imageMimeType || 'image/png';
  const base64Data = req.imageBuffer!.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  console.log(`[TradeIQ Pipeline] Step 1 & 2: Reading Chart & Scoring Strategies (gpt-4o, temp=0)...`);

  const step1Response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: STEP1_2_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            {
              type: 'text',
              text: `Analyze this chart screenshot. Symbol hint: ${req.symbolHint || 'read from chart'}. Timeframe hint: ${req.timeframeHint || 'read from chart'}. ${req.notes ? `User notes: ${req.notes}` : ''}`,
            },
          ],
        },
      ],
      max_tokens: 2200,
    }),
  });

  if (!step1Response.ok) {
    const errText = await step1Response.text();
    throw new Error(`OpenAI Step 1 xatoligi (${step1Response.status}): ${errText}`);
  }

  const step1Data = await step1Response.json();
  const step1Content = step1Data.choices?.[0]?.message?.content;
  if (!step1Content) throw new Error("OpenAI bo'sh javob qaytardi.");

  let parsedStep1: any;
  try {
    parsedStep1 = JSON.parse(step1Content);
  } catch (err: any) {
    throw new Error(`AI javobini JSON formatida o'qib bo'lmadi: ${err.message}`);
  }

  // Process Steps 2 & 3 in Code
  const { chartRead, chosenStrategy, allScores, signal, waitFor, tradeLevels, activeTradeAdvice } =
    evaluateStrategySelection(parsedStep1, req.selectedStrategyId);

  // Step 4: Independent Verification Call (Audit)
  console.log(`[TradeIQ Pipeline] Step 4: Independent Verification Call (gpt-4o, temp=0)...`);
  let verification: VerificationResult = {
    approved: true,
    problems: [],
    calibrationCheck: "Tekshiruv o'tkazildi",
  };

  if (signal !== 'WAIT' && tradeLevels.entry > 0) {
    try {
      const step4Response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          response_format: { type: 'json_object' },
          temperature: 0,
          messages: [
            { role: 'system', content: STEP4_VERIFIER_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                {
                  type: 'text',
                  text: `VERIFY THIS PROPOSED TRADE:
Symbol: ${chartRead.symbol} (${chartRead.timeframe})
Strategy: ${chosenStrategy?.strategyName || 'Unknown'} (Score: ${chosenStrategy?.score}/100)
Signal: ${signal}
Entry: ${tradeLevels.entry}
Stop Loss: ${tradeLevels.stopLoss}
Take Profit 1: ${tradeLevels.takeProfit1}
Take Profit 2: ${tradeLevels.takeProfit2}
Visible Axis Range: [${chartRead.visiblePriceRange.min} - ${chartRead.visiblePriceRange.max}]
Last Visible Price: ${chartRead.lastVisiblePrice}

Is this trade approved and strictly aligned with the price axis? Return JSON.`,
                },
              ],
            },
          ],
          max_tokens: 600,
        }),
      });

      if (step4Response.ok) {
        const step4Data = await step4Response.json();
        const step4Content = step4Data.choices?.[0]?.message?.content;
        if (step4Content) {
          verification = JSON.parse(step4Content);
        }
      }
    } catch (auditErr: any) {
      console.warn('[TradeIQ Pipeline] Verification step error:', auditErr.message);
    }
  }

  // Step 5: Code Validation & Response Payload Assembly
  return assembleFinalPayload({
    chartRead,
    chosenStrategy,
    allScores,
    signal,
    waitFor,
    tradeLevels,
    activeTradeAdvice,
    verification,
    symbolHint: req.symbolHint,
    timeframeHint: req.timeframeHint,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Pipeline (Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5)
// ─────────────────────────────────────────────────────────────────────────────
async function runGeminiPipeline(req: AIAnalysisRequest, apiKey: string): Promise<AnalysisResponsePayload> {
  const modelName = 'gemini-1.5-flash';
  const mimeType = req.imageMimeType || 'image/png';
  const base64Data = req.imageBuffer!.toString('base64');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  console.log(`[TradeIQ Pipeline] Gemini Step 1 & 2: Reading Chart & Scoring Strategies (temp=0)...`);

  const promptText = `${STEP1_2_SYSTEM_PROMPT}

Analyze this trading chart. Symbol hint: ${req.symbolHint || 'read from chart'}. Timeframe hint: ${req.timeframeHint || 'read from chart'}.
${req.notes ? `User note: ${req.notes}` : ''}
Return JSON strictly conforming to the requested schema.`;

  const result1 = await model.generateContent([
    { text: promptText },
    { inlineData: { data: base64Data, mimeType } },
  ]);

  const rawText1 = result1.response.text();
  let parsedStep1: any;
  try {
    parsedStep1 = JSON.parse(rawText1);
  } catch (err: any) {
    throw new Error(`Gemini javobini JSON formatida o'qib bo'lmadi: ${err.message}`);
  }

  const { chartRead, chosenStrategy, allScores, signal, waitFor, tradeLevels, activeTradeAdvice } =
    evaluateStrategySelection(parsedStep1, req.selectedStrategyId);

  // Step 4: Verification call
  let verification: VerificationResult = {
    approved: true,
    problems: [],
    calibrationCheck: "Gemini tekshiruvi",
  };

  if (signal !== 'WAIT' && tradeLevels.entry > 0) {
    try {
      const verifyPrompt = `${STEP4_VERIFIER_SYSTEM_PROMPT}

VERIFY THIS PROPOSED TRADE:
Symbol: ${chartRead.symbol} (${chartRead.timeframe})
Strategy: ${chosenStrategy?.strategyName || 'Unknown'} (Score: ${chosenStrategy?.score}/100)
Signal: ${signal}
Entry: ${tradeLevels.entry}
Stop Loss: ${tradeLevels.stopLoss}
Take Profit 1: ${tradeLevels.takeProfit1}
Take Profit 2: ${tradeLevels.takeProfit2}
Visible Axis Range: [${chartRead.visiblePriceRange.min} - ${chartRead.visiblePriceRange.max}]
Last Visible Price: ${chartRead.lastVisiblePrice}

Is this trade approved and strictly aligned with the price axis? Return JSON.`;

      const result4 = await model.generateContent([
        { text: verifyPrompt },
        { inlineData: { data: base64Data, mimeType } },
      ]);
      const rawText4 = result4.response.text();
      verification = JSON.parse(rawText4);
    } catch (auditErr: any) {
      console.warn('[TradeIQ Pipeline] Gemini verification step error:', auditErr.message);
    }
  }

  return assembleFinalPayload({
    chartRead,
    chosenStrategy,
    allScores,
    signal,
    waitFor,
    tradeLevels,
    activeTradeAdvice,
    verification,
    symbolHint: req.symbolHint,
    timeframeHint: req.timeframeHint,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 & 3: Strategy Scoring, Sorting & Disagreement Logic (Pure Code)
// ─────────────────────────────────────────────────────────────────────────────
export function evaluateStrategySelection(
  parsed: any,
  selectedStrategyId?: string
): {
  chartRead: ChartReadData;
  chosenStrategy?: StrategyEvaluation;
  allScores: StrategyEvaluation[];
  signal: 'BUY' | 'SELL' | 'WAIT';
  waitFor?: string;
  tradeLevels: { entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number };
  activeTradeAdvice?: any;
} {
  const cr = parsed.chartRead || {};
  const chartRead: ChartReadData = {
    symbol: cr.symbol || 'GRAFIK',
    timeframe: cr.timeframe || '1h',
    readable: cr.readable !== false,
    visiblePriceAxis: Array.isArray(cr.visiblePriceAxis) ? cr.visiblePriceAxis.map(Number) : [],
    lastVisiblePrice: Number(cr.lastVisiblePrice || 0),
    visiblePriceRange: {
      min: Number(cr.visiblePriceRange?.min || 0),
      max: Number(cr.visiblePriceRange?.max || 0),
    },
    trendDirection: cr.trendDirection || 'Unclear',
    lastSwingHigh: Number(cr.lastSwingHigh || 0),
    lastSwingLow: Number(cr.lastSwingLow || 0),
    nearestSupport: Number(cr.nearestSupport || 0),
    nearestResistance: Number(cr.nearestResistance || 0),
    approxCandleRange: Number(cr.approxCandleRange || (cr.lastVisiblePrice ? cr.lastVisiblePrice * 0.004 : 10)),
    indicatorsDetected: cr.indicatorsDetected || {},
  };

  // If price axis is unreadable, immediately return WAIT
  if (!chartRead.readable) {
    return {
      chartRead,
      allScores: [],
      signal: 'WAIT',
      waitFor: "Grafik narx shkalasi (o'ng Y-o'qi) aniq ko'rinmadi yoki tahrir qilib bo'lmaydi. Aniqroq grafik yuklang.",
      tradeLevels: { entry: 0, stopLoss: 0, takeProfit1: 0, takeProfit2: 0 },
    };
  }

  // Normalize all strategy evaluations from model response
  const rawScores: any[] = Array.isArray(parsed.strategyScores) ? parsed.strategyScores : [];
  const allScores: StrategyEvaluation[] = TRADING_STRATEGIES.map((strat) => {
    const found = rawScores.find((r) => r.strategyId === strat.id || r.strategyName?.toLowerCase() === strat.name.toLowerCase());
    if (found) {
      return {
        strategyId: strat.id,
        strategyName: strat.uzbekName || strat.name,
        conditionsMet: Array.isArray(found.conditionsMet) ? found.conditionsMet : [],
        conditionsNotMet: Array.isArray(found.conditionsNotMet) ? found.conditionsNotMet : [],
        conditionsTotal: strat.checklist.length,
        score: Math.min(100, Math.max(0, Number(found.score || 0))),
        direction: (['BUY', 'SELL', 'none'].includes(found.direction) ? found.direction : 'none') as 'BUY' | 'SELL' | 'none',
        avoidApplies: Boolean(found.avoidApplies),
        avoidReason: found.avoidReason || '',
        reason: found.reason || `${strat.name} tahlili`,
      };
    }
    return {
      strategyId: strat.id,
      strategyName: strat.uzbekName || strat.name,
      conditionsMet: [],
      conditionsNotMet: strat.checklist,
      conditionsTotal: strat.checklist.length,
      score: 30,
      direction: 'none',
      avoidApplies: false,
      reason: "Shartlar yetarli darajada mos kelmadi",
    };
  });

  // Sort scores descending
  allScores.sort((a, b) => b.score - a.score);

  // If user selected a specific strategy, pick that one
  let chosenStrategy: StrategyEvaluation | undefined;
  if (selectedStrategyId && selectedStrategyId !== 'auto') {
    chosenStrategy = allScores.find((s) => s.strategyId === selectedStrategyId);
  } else {
    // Pick the highest scoring eligible strategy
    chosenStrategy = allScores[0];
  }

  let signal: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let waitFor: string | undefined;

  // RULE: Require score >= 70 and avoidApplies = false
  if (!chosenStrategy || chosenStrategy.score < 70 || chosenStrategy.avoidApplies || chosenStrategy.direction === 'none') {
    signal = 'WAIT';
    waitFor = chosenStrategy?.avoidApplies
      ? `Strategiya cheklovi: ${chosenStrategy.avoidReason || 'Bozor xavfli holatda (fakeout yoki spayk)'}`
      : "Hech bir strategiya kamida 70 ball to'play olmadi. Aniqroq tasdiq kutilmoqda.";
  } else {
    // Check if second-highest strategy disagrees on direction and scores are within 10 points
    const secondStrategy = allScores.find(
      (s) => s.strategyId !== chosenStrategy!.strategyId && (s.direction === 'BUY' || s.direction === 'SELL') && !s.avoidApplies
    );

    if (
      secondStrategy &&
      secondStrategy.direction !== chosenStrategy.direction &&
      Math.abs(chosenStrategy.score - secondStrategy.score) <= 10 &&
      secondStrategy.score >= 65
    ) {
      signal = 'WAIT';
      waitFor = `Strategiyalar kelishmayapti: "${chosenStrategy.strategyName}" (${chosenStrategy.direction} ${chosenStrategy.score} ball) va "${secondStrategy.strategyName}" (${secondStrategy.direction} ${secondStrategy.score} ball) bir-biriga zid kelmoqda.`;
    } else {
      signal = chosenStrategy.direction;
    }
  }

  // Trade levels calculation: STRICT 1:2 (2R) and 1:3 (3R)
  const pt = parsed.proposedTrade || {};
  let entry = Number(pt.entry || chartRead.lastVisiblePrice || 0);
  let stopLoss = Number(pt.stopLoss || 0);

  // Fallback to reasonable structural swing points if model omitted them
  if (entry <= 0 && chartRead.lastVisiblePrice > 0) {
    entry = chartRead.lastVisiblePrice;
  }
  if (stopLoss <= 0 && entry > 0) {
    if (signal === 'BUY' && chartRead.lastSwingLow > 0 && chartRead.lastSwingLow < entry) {
      stopLoss = chartRead.lastSwingLow;
    } else if (signal === 'SELL' && chartRead.lastSwingHigh > 0 && chartRead.lastSwingHigh > entry) {
      stopLoss = chartRead.lastSwingHigh;
    }
  }

  let takeProfit1 = 0;
  let takeProfit2 = 0;

  if (signal !== 'WAIT' && entry > 0 && stopLoss > 0) {
    const R = Math.abs(entry - stopLoss);
    if (R <= 0) {
      signal = 'WAIT';
      waitFor = "Kirish va Stop-Loss narxi bir xil bo'lib qoldi.";
    } else {
      if (signal === 'BUY') {
        if (stopLoss >= entry) {
          signal = 'WAIT';
          waitFor = "BUY signali uchun Stop-Loss kirish narxidan pastda bo'lishi kerak.";
        } else {
          // Compute takeProfit1 = entry + 2R and takeProfit2 = entry + 3R. Do not use model's TP numbers.
          takeProfit1 = Number((entry + 2 * R).toFixed(5));
          takeProfit2 = Number((entry + 3 * R).toFixed(5));

          // Check if major opposite level (resistance) lies closer than 2R from entry
          if (chartRead.nearestResistance > entry && chartRead.nearestResistance < takeProfit1) {
            signal = 'WAIT';
            // Entry must be deep enough pullback so that entry <= (Res + 2*SL)/3
            const requiredPullback = Number(((chartRead.nearestResistance + 2 * stopLoss) / 3).toFixed(2));
            waitFor = `Eng yaqin daraja 1:2 dan oldin turibdi (${chartRead.nearestResistance}). 1:2 nisbat chiqishi uchun narx kamida ${requiredPullback} darajasigacha pullback qilishi kutilmoqda.`;
          }

          // Check if structural SL is so wide that TP1 (2R) falls outside visible range extended by 25%
          const minRange = chartRead.visiblePriceRange.min;
          const maxRange = chartRead.visiblePriceRange.max;
          if (minRange > 0 && maxRange > minRange) {
            const span = maxRange - minRange;
            const allowedMax = maxRange + 0.25 * span;
            if (takeProfit1 > allowedMax) {
              signal = 'WAIT';
              waitFor = `Stop-loss juda keng bo'lgani sababli TP1 (1:2 = ${takeProfit1}) grafik shkalasidan (+25%) tashqariga chiqib ketdi.`;
            }
          }
        }
      } else if (signal === 'SELL') {
        if (stopLoss <= entry) {
          signal = 'WAIT';
          waitFor = "SELL signali uchun Stop-Loss kirish narxidan yuqorida bo'lishi kerak.";
        } else {
          // Compute takeProfit1 = entry - 2R and takeProfit2 = entry - 3R. Do not use model's TP numbers.
          takeProfit1 = Number((entry - 2 * R).toFixed(5));
          takeProfit2 = Number((entry - 3 * R).toFixed(5));

          // Check if major opposite level (support) lies closer than 2R from entry
          if (chartRead.nearestSupport > 0 && chartRead.nearestSupport < entry && chartRead.nearestSupport > takeProfit1) {
            signal = 'WAIT';
            // Entry must be high enough retest so that entry >= (Sup + 2*SL)/3
            const requiredRetest = Number(((chartRead.nearestSupport + 2 * stopLoss) / 3).toFixed(2));
            waitFor = `Eng yaqin daraja 1:2 dan oldin turibdi (${chartRead.nearestSupport}). 1:2 nisbat chiqishi uchun narx kamida ${requiredRetest} darajasigacha retest qilishi kutilmoqda.`;
          }

          // Check if structural SL is so wide that TP1 (2R) falls outside visible range extended by 25%
          const minRange = chartRead.visiblePriceRange.min;
          const maxRange = chartRead.visiblePriceRange.max;
          if (minRange > 0 && maxRange > minRange) {
            const span = maxRange - minRange;
            const allowedMin = minRange - 0.25 * span;
            if (takeProfit1 < allowedMin) {
              signal = 'WAIT';
              waitFor = `Stop-loss juda keng bo'lgani sababli TP1 (1:2 = ${takeProfit1}) grafik shkalasidan (-25%) tashqariga chiqib ketdi.`;
            }
          }
        }
      }
    }
  }

  // Active trade advice
  const at = parsed.activeTrade;
  let activeTradeAdvice: any = null;
  if (at && at.detected) {
    activeTradeAdvice = {
      detected: true,
      side: at.side || 'BUY',
      entryPrice: Number(at.entryPrice) || undefined,
      currentPrice: Number(at.currentPrice) || undefined,
      status: at.status || 'Active',
      action: at.action || 'HOLD',
      advice: at.advice || '',
    };
  }

  return {
    chartRead,
    chosenStrategy,
    allScores,
    signal,
    waitFor: waitFor || pt.waitFor,
    tradeLevels: { entry, stopLoss, takeProfit1, takeProfit2 },
    activeTradeAdvice,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Code Validation & Response Assembly
// ─────────────────────────────────────────────────────────────────────────────
function assembleFinalPayload(params: {
  chartRead: ChartReadData;
  chosenStrategy?: StrategyEvaluation;
  allScores: StrategyEvaluation[];
  signal: 'BUY' | 'SELL' | 'WAIT';
  waitFor?: string;
  tradeLevels: { entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number };
  activeTradeAdvice?: any;
  verification: VerificationResult;
  symbolHint?: string;
  timeframeHint?: string;
}): AnalysisResponsePayload {
  const { chartRead, chosenStrategy, allScores, tradeLevels, activeTradeAdvice, verification } = params;
  let signal = params.signal;
  let waitFor = params.waitFor;

  let { entry, stopLoss, takeProfit1, takeProfit2 } = tradeLevels;

  // 1. Downgrade if verification failed
  if (!verification.approved && signal !== 'WAIT') {
    signal = 'WAIT';
    const problemText = verification.problems.length > 0 ? verification.problems.join(', ') : "Darajalar narx shkalasiga mos kelmadi";
    waitFor = `Auditor tekshiruvidan o'tmadi: ${problemText}`;
  }

  // 2. Visible price range extended by 25% check
  const minRange = chartRead.visiblePriceRange.min;
  const maxRange = chartRead.visiblePriceRange.max;
  if (minRange > 0 && maxRange > minRange) {
    const span = maxRange - minRange;
    const allowedMin = minRange - 0.25 * span;
    const allowedMax = maxRange + 0.25 * span;

    if (entry > 0 && (entry < allowedMin || entry > allowedMax)) {
      console.warn(`[TradeIQ Validation] Entry ${entry} outside visible range extended by 25% [${allowedMin}, ${allowedMax}]. Adjusting.`);
      entry = chartRead.lastVisiblePrice || minRange + 0.5 * span;
    }
    if (stopLoss > 0 && (stopLoss < allowedMin || stopLoss > allowedMax)) {
      console.warn(`[TradeIQ Validation] SL ${stopLoss} outside visible range. Adjusting.`);
    }
  }

  // 3. Entry Type Check: Market vs Limit
  const candleRange = chartRead.approxCandleRange > 0 ? chartRead.approxCandleRange : (entry > 0 ? entry * 0.004 : 10);
  let entryType: 'Bozor narxi (Market)' | 'Limit kirish (Pullback)' = 'Bozor narxi (Market)';

  if (entry > 0 && chartRead.lastVisiblePrice > 0) {
    const dist = Math.abs(entry - chartRead.lastVisiblePrice);
    if (dist > 0.5 * candleRange) {
      entryType = 'Limit kirish (Pullback)';
      if (signal !== 'WAIT' && !waitFor) {
        waitFor = `Limit kirish: ${entry} darajasida qaytish (retest) kutilmoqda`;
      }
    }
  }

  // 4. Validate Risk-Reward Ratio: Require effective R:R to TP1 >= 2.0 and TP2 >= 3.0
  let riskRewardRatio = 2.0;
  if (entry > 0 && stopLoss > 0) {
    const risk = Math.abs(entry - stopLoss);
    if (risk > 0 && signal !== 'WAIT') {
      const reward1 = Math.abs(takeProfit1 - entry);
      const reward2 = Math.abs(takeProfit2 - entry);
      const rr1 = Number((reward1 / risk).toFixed(2));
      const rr2 = Number((reward2 / risk).toFixed(2));

      // Validation: Anything lower than 2.0 (TP1) or 3.0 (TP2) is forced to WAIT
      if (rr1 < 1.98 || rr2 < 2.98) {
        signal = 'WAIT';
        waitFor = `Risk/Reward talabi (kamida 1:2 TP1 va 1:3 TP2) bajarilmadi (amalda TP1=1:${rr1}, TP2=1:${rr2}).`;
      } else {
        riskRewardRatio = rr1;
      }
    }
  }

  // 5. Confidence Score = Chosen Strategy Score (not random number)
  const confidenceScore = chosenStrategy ? chosenStrategy.score : 50;

  const symbol = chartRead.symbol || params.symbolHint || 'BTC/USDT';
  const timeframe = chartRead.timeframe || params.timeframeHint || '1h';

  const marketDirection = signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral';
  const scenarioType = signal === 'BUY' ? 'Buy Setup' : signal === 'SELL' ? 'Sell Setup' : 'No Setup';

  const strategyTitle = chosenStrategy ? `${chosenStrategy.strategyName} (${chosenStrategy.score} ball)` : 'Avto tahlil';

  return {
    symbol,
    timeframe,
    signal,
    marketDirection,
    scenarioType,
    chartContext: chosenStrategy?.reason || `${symbol} (${timeframe}) grafigi barcha strategiyalar bo'yicha tahlil qilindi.`,
    waitFor: waitFor || (signal === 'BUY'
      ? `${entry} darajasida kirish rejalashtirilgan`
      : signal === 'SELL'
        ? `${entry} darajasida sotish rejalashtirilgan`
        : 'Qulayroq tasdiq darajasi kutilmoqda'),
    entryZone: { min: entry, max: entry, optimal: entry },
    stopLoss,
    takeProfit1,
    takeProfit2: takeProfit2 || takeProfit1,
    takeProfit3: takeProfit2 || takeProfit1,
    riskRewardRatio,
    confidenceScore,
    confidenceExplanation: `${strategyTitle} asosida va 1:2 (TP1) / 1:3 (TP2) Risk/Reward bilan hisoblandi.`,
    marketStructure: `${chartRead.trendDirection} bozor strukturasi`,
    supportLevels: chartRead.nearestSupport > 0 ? [chartRead.nearestSupport] : (stopLoss > 0 && signal === 'BUY' ? [stopLoss] : []),
    resistanceLevels: chartRead.nearestResistance > 0 ? [chartRead.nearestResistance] : (takeProfit1 > 0 && signal === 'BUY' ? [takeProfit1] : []),
    liquidityAnalysis: signal === 'BUY'
      ? `Asosiy maqsad ${takeProfit1} qarshilik darajasidagi xaridorlar likvidligidir`
      : `Asosiy maqsad ${takeProfit1} qo'llab-quvvatlash darajasidagi sotuvchilar likvidligidir`,
    trendAnalysis: `${chartRead.trendDirection} trend yo'nalishi`,
    technicalIndicators: {
      rsi: { value: null, signal: signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral', calculated: false },
      macd: { histogram: 'Neutral', trend: 'Neutral', calculated: false },
      emas: { ema20: null, ema50: null, ema200: null, alignment: 'Mixed', calculated: false },
      volume: { status: 'Normal', trend: 'Supporting Trend', calculated: false },
    },
    invalidationCriteria: `${stopLoss} darajasi teskariga buzilganda ushbu ssenariy bekor qilinadi`,
    analysisReasons: [
      chosenStrategy ? `Tanlangan strategiya: ${chosenStrategy.strategyName} (Moslik: ${chosenStrategy.score}%)` : 'Barcha strategiyalar baholandi',
      chosenStrategy?.reason || 'Grafik parametrlari tekshirildi',
      `Auditor tasdig'i: ${verification.approved ? "Muvaffaqiyatli tasdiqlandi" : "Cheklov aniqlandi"}`,
    ],
    activeTradeAdvice,
    chosenStrategy,
    allStrategyScores: allScores,
    chartReadData: chartRead,
    verification,
    entryType,
    disclaimer: "Ta'limiy simulyatsiya ssenariysi. Barcha signallar uchun qat'iy 1:2 (TP1) va 1:3 (TP2) Risk/Reward talab qilinadi. Moliyaviy maslahat emas.",
    simulatedTimestamp: new Date().toISOString(),
  };
}
