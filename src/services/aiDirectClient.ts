// Client-side Direct AI Analysis Engine with Multi-Strategy Evaluation
// Allows browser to call OpenAI or Google Gemini directly when backend is offline
// Strict temperature: 0, strategy scoring, and verification.

import { AnalysisResult, Timeframe } from '../types';
import {
  TRADING_STRATEGIES,
  StrategyEvaluation,
  ChartReadData,
  VerificationResult,
  getStrategyById,
} from '../strategies';

function formatStrategiesForPrompt(): string {
  return TRADING_STRATEGIES.map((s) => `
STRATEGY_ID: "${s.id}"
NAME: "${s.name}" (${s.uzbekName})
DIRECTION: ${s.intendedDirection} | MIN_RR: ${s.minRR}
CHECKLIST:
${s.checklist.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
AVOID_CONDITIONS (If any apply, avoidApplies MUST be true and score must be < 65):
${s.avoidConditions.map((a, i) => `  - ${a}`).join('\n')}
`).join('\n────────────────────────────────────\n');
}

const DIRECT_SYSTEM_PROMPT = `You are TRADEIQ AI, an elite institutional quant trader and technical chart reader.
Analyze this high-resolution trading chart screenshot.

1. READ THE CHART:
   - Identify symbol and timeframe.
   - Read the price numbers on the right vertical Y-axis. List the actual numbers you see.
   - Determine last visible price, min/max visible price range, trend, swing high/low, support/resistance, and candle range.
   - If price axis is missing or completely unreadable, set "readable": false.

2. SCORE EVERY STRATEGY FROM THIS LIST:
${formatStrategiesForPrompt()}

3. PROPOSE EXACT TRADE LEVELS FOR TOP-SCORING STRATEGY:
   - Entry, SL, TP must align strictly with the chart's visible Y-axis.
   - Stop Loss tight behind nearest swing point.
   - Reward must strictly satisfy: Take Profit 1 is at exactly 2R (1:2) and Take Profit 2 is at exactly 3R (1:3), where R = |entry - stopLoss|.

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
    "indicatorsDetected": { "ema": "20/50", "rsi": "55", "volume": "Normal" }
  },
  "strategyScores": [
    {
      "strategyId": "trend_pullback",
      "conditionsMet": ["Aniq o'suvchi struktura", "EMA 20 ga pullback"],
      "conditionsNotMet": [],
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

export async function runDirectAIAnalysis(
  dataUrl: string,
  symbolHint: string,
  timeframeHint: string,
  notes?: string,
  apiKey?: string,
  selectedStrategyId?: string
): Promise<AnalysisResult> {
  const key = apiKey || '';
  if (!key) {
    throw new Error("AI API kaliti topilmadi. Sozlamalar sahifasiga kirib OpenAI yoki Gemini kalitingizni kiriting.");
  }

  const isOpenAI = key.startsWith('sk-');
  let rawJson: any;

  if (isOpenAI) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: DIRECT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'high' },
              },
              {
                type: 'text',
                text: `Analyze this trading chart screenshot. Symbol: ${symbolHint}, Timeframe: ${timeframeHint}. ${notes ? `Notes: ${notes}` : ''}`,
              },
            ],
          },
        ],
        max_tokens: 2200,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI xizmati xatolik qaytardi (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI bo'sh javob qaytardi.");
    rawJson = JSON.parse(content);
  } else {
    // Google Gemini Direct Vision Call
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const mimeType = dataUrl.includes(';') ? dataUrl.split(';')[0].replace('data:', '') : 'image/jpeg';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${DIRECT_SYSTEM_PROMPT}\nAnalyze this trading chart. Symbol: ${symbolHint}, Timeframe: ${timeframeHint}. ${notes ? `Notes: ${notes}` : ''}` },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini xizmati xatolik qaytardi (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error("Gemini bo'sh javob qaytardi.");
    rawJson = JSON.parse(candidateText);
  }

  // Parse Chart Read
  const cr = rawJson.chartRead || {};
  const chartReadData: ChartReadData = {
    symbol: cr.symbol || symbolHint || 'BTC/USDT',
    timeframe: cr.timeframe || timeframeHint || '1h',
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
    approxCandleRange: Number(cr.approxCandleRange || 10),
    indicatorsDetected: cr.indicatorsDetected || {},
  };

  // Parse Strategy Scores
  const rawScores: any[] = Array.isArray(rawJson.strategyScores) ? rawJson.strategyScores : [];
  const allStrategyScores: StrategyEvaluation[] = TRADING_STRATEGIES.map((strat) => {
    const found = rawScores.find((r) => r.strategyId === strat.id);
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
      reason: "Mos kelmadi",
    };
  });

  allStrategyScores.sort((a, b) => b.score - a.score);

  let chosenStrategy: StrategyEvaluation | undefined =
    selectedStrategyId && selectedStrategyId !== 'auto'
      ? allStrategyScores.find((s) => s.strategyId === selectedStrategyId)
      : allStrategyScores[0];

  let signal: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let waitFor: string | undefined;

  if (!chartReadData.readable) {
    signal = 'WAIT';
    waitFor = "Grafik narx shkalasi (Y-o'qi) aniq ko'rinmadi. Qaytadan yuklang.";
  } else if (!chosenStrategy || chosenStrategy.score < 70 || chosenStrategy.avoidApplies || chosenStrategy.direction === 'none') {
    signal = 'WAIT';
    waitFor = chosenStrategy?.avoidApplies
      ? `Strategiya cheklovi: ${chosenStrategy.avoidReason || 'Bozorda yuqori xavf mavjud'}`
      : "Hech bir strategiya 70 balldan yuqori natija ko'rsatmadi. Tasdiq kutilmoqda.";
  } else {
    // Check disagreement
    const second = allStrategyScores.find(
      (s) => s.strategyId !== chosenStrategy!.strategyId && (s.direction === 'BUY' || s.direction === 'SELL') && !s.avoidApplies
    );
    if (second && second.direction !== chosenStrategy.direction && Math.abs(chosenStrategy.score - second.score) <= 10 && second.score >= 65) {
      signal = 'WAIT';
      waitFor = `Strategiyalar kelishmayapti: "${chosenStrategy.strategyName}" va "${second.strategyName}" bir-biriga zid.`;
    } else {
      signal = chosenStrategy.direction;
    }
  }

  const pt = rawJson.proposedTrade || {};
  let entry = Number(pt.entry || chartReadData.lastVisiblePrice || 0);
  let stopLoss = Number(pt.stopLoss || 0);

  if (entry <= 0 && chartReadData.lastVisiblePrice > 0) {
    entry = chartReadData.lastVisiblePrice;
  }
  if (stopLoss <= 0 && entry > 0) {
    if (signal === 'BUY' && chartReadData.lastSwingLow > 0 && chartReadData.lastSwingLow < entry) {
      stopLoss = chartReadData.lastSwingLow;
    } else if (signal === 'SELL' && chartReadData.lastSwingHigh > 0 && chartReadData.lastSwingHigh > entry) {
      stopLoss = chartReadData.lastSwingHigh;
    }
  }

  let takeProfit1 = 0;
  let takeProfit2 = 0;
  let riskRewardRatio = 2.0;

  if (signal !== 'WAIT' && entry > 0 && stopLoss > 0) {
    const R = Math.abs(entry - stopLoss);
    if (R <= 0) {
      signal = 'WAIT';
      waitFor = "Kirish va Stop-Loss bir xil bo'lib qoldi.";
    } else {
      if (signal === 'BUY') {
        if (stopLoss >= entry) {
          signal = 'WAIT';
          waitFor = "BUY signali uchun Stop-Loss kirish narxidan pastda bo'lishi kerak.";
        } else {
          takeProfit1 = Number((entry + 2 * R).toFixed(5));
          takeProfit2 = Number((entry + 3 * R).toFixed(5));

          if (chartReadData.nearestResistance > entry && chartReadData.nearestResistance < takeProfit1) {
            signal = 'WAIT';
            const requiredPullback = Number(((chartReadData.nearestResistance + 2 * stopLoss) / 3).toFixed(2));
            waitFor = `Eng yaqin daraja 1:2 dan oldin turibdi (${chartReadData.nearestResistance}). 1:2 nisbat chiqishi uchun narx kamida ${requiredPullback} darajasigacha pullback qilishi kutilmoqda.`;
          }

          const minRange = chartReadData.visiblePriceRange.min;
          const maxRange = chartReadData.visiblePriceRange.max;
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
          takeProfit1 = Number((entry - 2 * R).toFixed(5));
          takeProfit2 = Number((entry - 3 * R).toFixed(5));

          if (chartReadData.nearestSupport > 0 && chartReadData.nearestSupport < entry && chartReadData.nearestSupport > takeProfit1) {
            signal = 'WAIT';
            const requiredRetest = Number(((chartReadData.nearestSupport + 2 * stopLoss) / 3).toFixed(2));
            waitFor = `Eng yaqin daraja 1:2 dan oldin turibdi (${chartReadData.nearestSupport}). 1:2 nisbat chiqishi uchun narx kamida ${requiredRetest} darajasigacha retest qilishi kutilmoqda.`;
          }

          const minRange = chartReadData.visiblePriceRange.min;
          const maxRange = chartReadData.visiblePriceRange.max;
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

      // Recompute effective R:R
      const reward1 = Math.abs(takeProfit1 - entry);
      const reward2 = Math.abs(takeProfit2 - entry);
      const rr1 = Number((reward1 / R).toFixed(2));
      const rr2 = Number((reward2 / R).toFixed(2));
      if (rr1 < 1.98 || rr2 < 2.98) {
        signal = 'WAIT';
        waitFor = `Risk/Reward talabi (kamida 1:2 TP1 va 1:3 TP2) bajarilmadi (amalda TP1=1:${rr1}, TP2=1:${rr2}).`;
      } else {
        riskRewardRatio = rr1;
      }
    }
  }

  let entryType: 'Bozor narxi (Market)' | 'Limit kirish (Pullback)' = 'Bozor narxi (Market)';
  const candleRange = chartReadData.approxCandleRange > 0 ? chartReadData.approxCandleRange : 10;
  if (entry > 0 && chartReadData.lastVisiblePrice > 0 && Math.abs(entry - chartReadData.lastVisiblePrice) > 0.5 * candleRange) {
    entryType = 'Limit kirish (Pullback)';
    if (signal !== 'WAIT' && !waitFor) {
      waitFor = `Limit kirish: ${entry} darajasida qaytish kutilmoqda`;
    }
  }

  const verification: VerificationResult = {
    approved: signal !== 'WAIT',
    problems: signal === 'WAIT' ? [waitFor || 'Strategiya shartlari bajarilmadi'] : [],
    calibrationCheck: "Direct AI tahlili",
  };

  const confidenceScore = chosenStrategy ? chosenStrategy.score : 50;

  return {
    id: `analysis-${Date.now()}`,
    symbol: chartReadData.symbol,
    timeframe: chartReadData.timeframe as Timeframe,
    createdAt: new Date().toISOString(),
    chartImageUrl: dataUrl,
    chartContext: chosenStrategy?.reason || `${chartReadData.symbol} (${chartReadData.timeframe}) ko'p strategiyali tahlil yakunlandi.`,
    marketDirection: signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral',
    scenarioType: signal === 'BUY' ? 'Buy Setup' : signal === 'SELL' ? 'Sell Setup' : 'No Setup',
    signal,
    waitFor: waitFor || `${entry} darajasida kirish`,
    entryZone: { min: entry, max: entry, optimal: entry },
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskRewardRatio,
    confidenceScore,
    confidenceExplanation: `${chosenStrategy?.strategyName || 'Avto'} strategiyasi (${confidenceScore}%) va 1:2 (TP1) / 1:3 (TP2) R:R asosida hisoblandi.`,
    marketStructure: `${chartReadData.trendDirection} bozor tuzilmasi`,
    supportLevels: chartReadData.nearestSupport > 0 ? [chartReadData.nearestSupport] : [],
    resistanceLevels: chartReadData.nearestResistance > 0 ? [chartReadData.nearestResistance] : [],
    liquidityAnalysis: `Asosiy maqsad ${takeProfit1} darajasidagi likvidlik hovuzidir`,
    trendAnalysis: `${chartReadData.trendDirection} trend dinamikasi`,
    technicalIndicators: {
      rsi: { value: null, signal: 'Neutral', calculated: false },
      macd: { histogram: 'Neutral', trend: 'Neutral', calculated: false },
      emas: { ema20: null, ema50: null, ema200: null, alignment: 'Mixed', calculated: false },
    },
    invalidationCriteria: `Agar narx ${stopLoss} darajasini buzsa, bekor bo'ladi`,
    analysisReasons: [chosenStrategy?.reason || "Strategiya tahlili"],
    chosenStrategy,
    allStrategyScores,
    chartReadData,
    verification,
    entryType,
    activeTradeAdvice: rawJson.activeTrade || null,
  };
}

export async function runDirectAIChat(
  question: string,
  analysisContext?: AnalysisResult | null,
  apiKey?: string,
  chartImageUrl?: string,
  history?: Array<{ role: 'user' | 'ai'; text?: string }>
): Promise<string> {
  const key = apiKey || '';
  if (!key) {
    return "AI API kaliti topilmadi. Iltimos, Sozlamalar sahifasida OpenAI kalitingizni kiriting.";
  }

  const systemPrompt = `Siz TRADEIQ AI yordamchisisiz — professional texnik tahlilchi va treyding bo'yicha maslahatchisiz.
Foydalanuvchi yuklangan grafik va undagi bozor holati, shamlar, indikatorlar yoki savdo rejasi bo'yicha savol bermoqda.

QOIDALAR:
1. O'zbek tilida aniq, ixcham, professional va do'stona javob bering.
2. Tahlilda hisoblangan darajalar (Kirish, Stop-Loss, TP1 (1:2), TP2 (1:3)) va strategiya xulosalariga qat'iy asoslaning. Ular faqat yangi skrinshot yuklanganda o'zgaradi.
3. Agar foydalanuvchi "Nega kutish?", "Qayerda kirish kerak?", "Trend qanday?", "RSI nima deyapti?" kabi savollar bersa, sabablarini tahlildagi ma'lumotlar va grafikdagi shamlar bilan tushuntiring.
4. Ortiqcha cho'ziq gaplarsiz, to'g'ridan-to'g'ri mohiyatga o'ting.

Tahlil konteksti:
${analysisContext ? JSON.stringify(analysisContext) : 'Umumiy grafik'}`;

  try {
    if (key.startsWith('sk-')) {
      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      // Include previous conversation history
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-6)) {
          if (h.text) {
            messages.push({
              role: h.role === 'ai' ? 'assistant' : 'user',
              content: h.text,
            });
          }
        }
      }

      // Current turn with vision if image is present
      const userContent: any[] = [];
      const img = chartImageUrl || analysisContext?.chartImageUrl;
      if (img && img.startsWith('data:')) {
        userContent.push({
          type: 'image_url',
          image_url: { url: img, detail: 'high' },
        });
      }
      userContent.push({ type: 'text', text: question });

      messages.push({ role: 'user', content: userContent });

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          temperature: 0.3,
          max_tokens: 750,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return json.choices?.[0]?.message?.content || "Javob olib bo'lmadi.";
      } else {
        const errText = await res.text();
        console.warn('OpenAI Direct Chat error:', errText);
      }
    } else {
      // Gemini fallback if key is not OpenAI
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      const img = chartImageUrl || analysisContext?.chartImageUrl;
      const parts: any[] = [
        {
          text: `${systemPrompt}\n\nFoydalanuvchi savoli: ${question}`,
        },
      ];
      if (img && img.startsWith('data:')) {
        const base64Data = img.includes(',') ? img.split(',')[1] : img;
        const mimeType = img.includes(';') ? img.split(';')[0].replace('data:', '') : 'image/jpeg';
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        });
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    }
  } catch (err: any) {
    console.warn('Direct AI chat fallback failed:', err);
    return `Savolga javob berishda xatolik: ${err.message}`;
  }
  return "OpenAI orqali javob olib bo'lmadi. API kalitingiz to'g'riligini tekshiring.";
}
