// Client-side Direct AI Analysis Engine
// Allows the browser to call OpenAI or Google Gemini directly when the backend is unreachable (e.g. Vercel serverless offline/cold start/timeout).

import { AnalysisResult, Timeframe } from '../types';

const SYSTEM_PROMPT = `You are TRADEIQ AI, an expert institutional trader and technical analyst.
The user sends you a screenshot of a financial chart (Forex, Crypto, Gold, Indices).

YOUR PRIMARY JOB: Identify the trade direction (BUY or SELL) and return EXACT price levels read from the chart image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SIGNAL RULES — READ CAREFULLY:
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
NEVER return WAIT for news spikes, volatility, fakeouts, uncertainty, or unclear setups.
If setup is risky, still pick BUY or SELL with a TIGHTER stop loss and note the risk in "reason".

CRITICAL RULES:
- REWARD MUST BE AT LEAST 1.5x THE RISK (Mandatory).
- STOP LOSS MUST BE TIGHT — place it just beyond the nearest swing point.
- If fakeout/spike occurred, do NOT chase the wick — set entry at pullback/retest level.

USER'S EXISTING ACTIVE TRADE (CRITICAL):
Check if user already has an OPEN POSITION:
1. Examine user notes or input text for mentions of existing BUY/SELL or entry price.
2. Examine the chart screenshot:
   - Execution arrows: BLUE arrow pointing UP (BUY entry), RED arrow pointing DOWN (SELL entry)
   - Broker tags, open position lines, PnL boxes
If an active open trade exists or was provided by the user, provide "activeTradeAdvice":
{
  "detected": true,
  "side": "BUY" or "SELL",
  "entryPrice": 60506.33,
  "currentPrice": 60677.79,
  "status": "In Loss" or "In Profit" or "Near Breakeven",
  "action": "HOLD" or "MOVE_SL_BREAKEVEN" or "TAKE_PROFIT" or "CLOSE_EARLY",
  "advice": "Actionable advice in Uzbek language for their specific open trade. E.g.: Siz 60,506 da SHORT ochgansiz, lekin bozor yuqoriga qarshilikni buzib o'tmoqda. Katta zararni oldini olish uchun Stop-lossni 60,680 ga suring yoki pozitsiyadan erta chiqing."
}
If no active trade is detected or mentioned, return "activeTradeAdvice": null.

OUTPUT: Return ONLY valid JSON, no markdown, no commentary:
{
  "symbol": "BTC/USDT",
  "timeframe": "1h",
  "signal": "BUY",
  "entry": 91420.00,
  "stopLoss": 90500.00,
  "takeProfit1": 93260.00,
  "takeProfit2": 94500.00,
  "confidence": 82,
  "trend": "Bullish trend with higher highs",
  "support": 90500.00,
  "resistance": 93260.00,
  "waitFor": "Entry at 91420 optimal zone on pullback",
  "reason": "Price formed strong bullish market structure with high volume expansion",
  "invalidation": "Invalid if 1h candle closes below 90500",
  "activeTradeAdvice": null
}`;

function maxSlDistance(entryPrice: number, sym: string): number {
  const s = sym.toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return entryPrice * 0.0035;
  if (s.includes('BTC')) return entryPrice * 0.012;
  if (s.includes('ETH') || s.includes('SOL')) return entryPrice * 0.015;
  if (s.includes('JPY')) return entryPrice * 0.004;
  return entryPrice * 0.003;
}

export async function runDirectAIAnalysis(
  dataUrl: string,
  symbolHint: string,
  timeframeHint: string,
  notes?: string,
  apiKey?: string
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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
        temperature: 0.1,
        max_tokens: 1200,
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
              { text: `${SYSTEM_PROMPT}\nAnalyze this trading chart. Symbol hint: ${symbolHint}, Timeframe: ${timeframeHint}` },
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
          temperature: 0.1,
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

  // Format and validate levels
  const symbol = rawJson.symbol || symbolHint || 'BTC/USDT';
  const timeframe = (rawJson.timeframe as Timeframe) || (timeframeHint as Timeframe) || '1h';
  const rawSignal = (rawJson.signal || 'WAIT').toUpperCase();
  const signal: 'BUY' | 'SELL' | 'WAIT' =
    rawSignal.includes('BUY') ? 'BUY' : rawSignal.includes('SELL') ? 'SELL' : 'WAIT';

  let entry = Number(rawJson.entry || 0);
  let stopLoss = Number(rawJson.stopLoss || 0);
  let takeProfit1 = Number(rawJson.takeProfit1 || 0);
  let takeProfit2 = Number(rawJson.takeProfit2 || takeProfit1 || 0);
  const support = Number(rawJson.support || 0);
  const resistance = Number(rawJson.resistance || 0);

  if (entry <= 0 && support > 0 && resistance > 0) {
    entry = signal === 'BUY' ? support : resistance;
  }

  const MIN_RR = 1.5;
  let riskRewardRatio = MIN_RR;

  if (signal === 'BUY' && entry > 0) {
    if (stopLoss <= 0 || stopLoss >= entry) {
      stopLoss = support > 0 && support < entry ? support : Number((entry - entry * 0.003).toFixed(5));
    }
    const maxSl = maxSlDistance(entry, symbol);
    if (entry - stopLoss > maxSl) stopLoss = Number((entry - maxSl).toFixed(5));
    const risk = entry - stopLoss;
    const minTP1 = entry + risk * MIN_RR;
    if (takeProfit1 <= entry || takeProfit1 < minTP1) {
      takeProfit1 = resistance > minTP1 ? resistance : Number(minTP1.toFixed(5));
    }
    if (takeProfit2 <= takeProfit1) takeProfit2 = Number((entry + risk * (MIN_RR + 1.0)).toFixed(5));
    const reward = takeProfit1 - entry;
    riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : MIN_RR;
  } else if (signal === 'SELL' && entry > 0) {
    if (stopLoss <= entry) {
      stopLoss = resistance > entry ? resistance : Number((entry + entry * 0.003).toFixed(5));
    }
    const maxSl = maxSlDistance(entry, symbol);
    if (stopLoss - entry > maxSl) stopLoss = Number((entry + maxSl).toFixed(5));
    const risk = stopLoss - entry;
    const minTP1 = entry - risk * MIN_RR;
    if (takeProfit1 <= 0 || takeProfit1 >= entry || takeProfit1 > minTP1) {
      takeProfit1 = support > 0 && support <= minTP1 ? support : Number(minTP1.toFixed(5));
    }
    if (takeProfit2 <= 0 || takeProfit2 >= takeProfit1) takeProfit2 = Number((entry - risk * (MIN_RR + 1.0)).toFixed(5));
    const reward = entry - takeProfit1;
    riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : MIN_RR;
  }

  const scenarioType = signal === 'BUY' ? 'Buy Setup' : signal === 'SELL' ? 'Sell Setup' : 'No Setup';
  const marketDirection = signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral';
  const confidenceScore = Math.min(100, Math.max(50, Number(rawJson.confidence || 80)));

  return {
    id: `analysis-${Date.now()}`,
    symbol,
    timeframe,
    createdAt: new Date().toISOString(),
    chartImageUrl: dataUrl,
    chartContext: rawJson.reason || `${symbol} (${timeframe}) bozor strukturasi va sham dinamikasi tahlil qilindi.`,
    marketDirection,
    scenarioType,
    signal,
    waitFor: rawJson.waitFor || (signal === 'BUY' ? `${entry} darajasida kirish` : signal === 'SELL' ? `${entry} darajasida sotish` : 'Tasdiq kutilmoqda'),
    entryZone: { min: entry, max: entry, optimal: entry },
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskRewardRatio,
    confidenceScore,
    confidenceExplanation: `Bozor strukturasi va 1:${riskRewardRatio} Risk/Reward nisbati asosida hisoblandi.`,
    marketStructure: rawJson.trend || `${marketDirection} tuzilma`,
    supportLevels: support > 0 ? [support] : [],
    resistanceLevels: resistance > 0 ? [resistance] : [],
    liquidityAnalysis: signal === 'BUY' ? `Asosiy maqsad ${takeProfit1} darajasidagi likvidlikdir` : `Asosiy maqsad ${takeProfit1} darajasidagi likvidlikdir`,
    trendAnalysis: rawJson.trend || `${marketDirection} yo'nalish`,
    technicalIndicators: {
      rsi: { value: null, signal: 'Neutral', calculated: false },
      macd: { histogram: 'Neutral', trend: 'Neutral', calculated: false },
      emas: { ema20: null, ema50: null, ema200: null, alignment: 'Mixed', calculated: false },
    },
    invalidationCriteria: rawJson.invalidation || `Agar narx ${stopLoss} darajasini buzsa, bekor bo'ladi`,
    analysisReasons: [rawJson.reason || 'Texnik indikatorlar va sham modellari tahlili'],
    activeTradeAdvice: rawJson.activeTradeAdvice || (rawJson.activeTrade ? {
      detected: true,
      side: rawJson.activeTrade.side || 'BUY',
      entryPrice: Number(rawJson.activeTrade.entryPrice) || undefined,
      currentPrice: Number(rawJson.activeTrade.currentPrice) || undefined,
      status: rawJson.activeTrade.status || 'Active',
      action: rawJson.activeTrade.action || 'HOLD',
      advice: rawJson.activeTrade.advice || '',
    } : null),
  };
}

export async function runDirectAIChat(
  question: string,
  analysisContext?: AnalysisResult | null,
  apiKey?: string
): Promise<string> {
  const key = apiKey || '';
  if (!key) return "AI kaliti topilmadi. Sozlamalar bo'limidan kalitni kiriting.";

  try {
    if (key.startsWith('sk-')) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are TRADEIQ AI, an institutional trading assistant. Answer the user question directly, concisely, and professionally in Uzbek language based on the chart setup.',
            },
            {
              role: 'user',
              content: `Tahlil konteksti: ${
                analysisContext ? JSON.stringify(analysisContext) : 'Umumiy savol'
              }\n\nFoydalanuvchi savoli: ${question}`,
            },
          ],
          max_tokens: 600,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return json.choices?.[0]?.message?.content || "Javob olib bo'lmadi.";
      }
    }
  } catch (err: any) {
    console.warn('Direct AI chat fallback failed:', err);
  }
  return "Savolga javob berishda xatolik yuz berdi.";
}
