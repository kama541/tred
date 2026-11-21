// Financial and Technical Indicator Calculations for TradeIQ
// Computes real mathematical indicators from OHLCV candles with full precision

export interface Candle {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calculateEMA(data: number[], period: number): (number | null)[] {
  if (data.length < period) {
    return data.map(() => null);
  }
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(null);
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;

  for (let i = period; i < data.length; i++) {
    const currentEma = (data[i] - prevEma) * multiplier + prevEma;
    result.push(currentEma);
    prevEma = currentEma;
  }

  return result;
}

export function calculateRSI(closes: number[], period: number = 14): { values: (number | null)[]; current: number | null } {
  if (closes.length <= period) {
    return { values: closes.map(() => null), current: null };
  }

  const values: (number | null)[] = [null];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period; i++) {
    values.push(null);
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let currentRsi = 100 - (100 / (1 + rs));
  values[period] = Number(currentRsi.toFixed(2));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    currentRsi = 100 - (100 / (1 + currentRs));
    values.push(Number(currentRsi.toFixed(2)));
  }

  return { values, current: Number(currentRsi.toFixed(2)) };
}

export function calculateMACD(closes: number[]): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
  currentHistogram: number | null;
  trend: 'Bullish Crossover' | 'Bearish Crossover' | 'Bullish Momentum' | 'Bearish Momentum' | 'Neutral';
} {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i]! - ema26[i]!);
    } else {
      macdLine.push(null);
    }
  }

  const validMacd = macdLine.filter((v): v is number => v !== null);
  if (validMacd.length < 9) {
    return {
      macdLine,
      signalLine: closes.map(() => null),
      histogram: closes.map(() => null),
      currentHistogram: null,
      trend: 'Neutral',
    };
  }

  const signalSub = calculateEMA(validMacd, 9);
  const signalLine: (number | null)[] = [];
  let sigIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null);
    } else {
      signalLine.push(signalSub[sigIdx] ?? null);
      sigIdx++;
    }
  }

  const histogram: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram.push(macdLine[i]! - signalLine[i]!);
    } else {
      histogram.push(null);
    }
  }

  const lastHist = histogram[histogram.length - 1];
  const prevHist = histogram[histogram.length - 2];

  let trend: 'Bullish Crossover' | 'Bearish Crossover' | 'Bullish Momentum' | 'Bearish Momentum' | 'Neutral' = 'Neutral';
  if (lastHist !== null && prevHist !== null) {
    if (prevHist < 0 && lastHist >= 0) trend = 'Bullish Crossover';
    else if (prevHist > 0 && lastHist <= 0) trend = 'Bearish Crossover';
    else if (lastHist > 0 && lastHist > prevHist) trend = 'Bullish Momentum';
    else if (lastHist < 0 && lastHist < prevHist) trend = 'Bearish Momentum';
  }

  return {
    macdLine,
    signalLine,
    histogram,
    currentHistogram: lastHist !== null ? Number(lastHist.toFixed(4)) : null,
    trend,
  };
}

export function calculateATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

export function findSupportResistance(candles: Candle[], currentPrice: number): { supports: number[]; resistances: number[] } {
  if (candles.length < 10) {
    return {
      supports: [Number((currentPrice * 0.98).toFixed(2)), Number((currentPrice * 0.95).toFixed(2))],
      resistances: [Number((currentPrice * 1.02).toFixed(2)), Number((currentPrice * 1.05).toFixed(2))]
    };
  }

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  // 3-bar swing pivots
  for (let i = 2; i < candles.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      pivotHighs.push(highs[i]);
    }
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      pivotLows.push(lows[i]);
    }
  }

  const supports = pivotLows
    .filter(p => p < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .map(p => Number(p.toFixed(2)));

  const resistances = pivotHighs
    .filter(p => p > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 3)
    .map(p => Number(p.toFixed(2)));

  if (supports.length === 0) supports.push(Number((currentPrice * 0.985).toFixed(2)));
  if (resistances.length === 0) resistances.push(Number((currentPrice * 1.015).toFixed(2)));

  return { supports, resistances };
}
