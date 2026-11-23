import { CandleData, WatchlistItem, Timeframe } from '../types';

export async function fetchLiveKlines(symbol: string, timeframe: Timeframe): Promise<CandleData[]> {
  try {
    const res = await fetch(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=300`);
    if (res.ok) {
      const data = await res.json();
      if (data.candles && data.candles.length > 0) {
        return data.candles;
      }
    }
  } catch (err) {
    console.warn('Live klines fetch error:', err);
  }

  // Fallback generation if offline
  return generateClientFallbackCandles(symbol, 250);
}

export async function fetchLiveTickers(): Promise<WatchlistItem[]> {
  try {
    const res = await fetch('/api/market/tickers');
    if (res.ok) {
      const data = await res.json();
      if (data.tickers && data.tickers.length > 0) {
        return data.tickers;
      }
    }
  } catch (err) {
    console.warn('Live tickers fetch error:', err);
  }

  return [
    { symbol: 'BTC/USDT', name: 'Bitcoin', price: 91420.50, change24h: 2.45, high24h: 92100.00, low24h: 89300.00, volume24h: 34100000000, trend: 'up', volatility: 'High', category: 'Crypto', lastUpdated: new Date().toISOString() },
    { symbol: 'ETH/USDT', name: 'Ethereum', price: 3412.80, change24h: 1.15, high24h: 3480.00, low24h: 3350.00, volume24h: 18200000000, trend: 'up', volatility: 'Medium', category: 'Crypto', lastUpdated: new Date().toISOString() },
    { symbol: 'SOL/USDT', name: 'Solana', price: 184.60, change24h: 4.80, high24h: 189.20, low24h: 174.50, volume24h: 8900000000, trend: 'up', volatility: 'High', category: 'Crypto', lastUpdated: new Date().toISOString() },
    { symbol: 'XAU/USD', name: 'Gold Spot', price: 2654.40, change24h: -0.32, high24h: 2668.00, low24h: 2642.00, volume24h: 12400000000, trend: 'down', volatility: 'Low', category: 'Commodities', lastUpdated: new Date().toISOString() },
    { symbol: 'EUR/USD', name: 'Euro / USD', price: 1.0542, change24h: -0.18, high24h: 1.0580, low24h: 1.0520, volume24h: 95000000000, trend: 'down', volatility: 'Low', category: 'Forex', lastUpdated: new Date().toISOString() },
    { symbol: 'GBP/USD', name: 'British Pound / USD', price: 1.2638, change24h: 0.22, high24h: 1.2680, low24h: 1.2590, volume24h: 68000000000, trend: 'up', volatility: 'Low', category: 'Forex', lastUpdated: new Date().toISOString() },
    { symbol: 'NAS100', name: 'Nasdaq 100', price: 20845.00, change24h: 0.95, high24h: 20950.00, low24h: 20680.00, volume24h: 41000000000, trend: 'up', volatility: 'Medium', category: 'Indices', lastUpdated: new Date().toISOString() },
    { symbol: 'US30', name: 'Dow Jones 30', price: 43410.00, change24h: 0.35, high24h: 43620.00, low24h: 43250.00, volume24h: 29000000000, trend: 'up', volatility: 'Low', category: 'Indices', lastUpdated: new Date().toISOString() },
  ];
}

function generateClientFallbackCandles(symbol: string, count: number): CandleData[] {
  let basePrice = 90500;
  let precision = 2;
  if (symbol.includes('ETH')) basePrice = 3400;
  else if (symbol.includes('SOL')) basePrice = 180;
  else if (symbol.includes('XAU')) basePrice = 2650;
  else if (symbol.includes('EUR')) { basePrice = 1.054; precision = 4; }
  else if (symbol.includes('GBP')) { basePrice = 1.264; precision = 4; }
  else if (symbol.includes('NAS')) basePrice = 20800;
  else if (symbol.includes('US30')) basePrice = 43400;

  const candles: CandleData[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const step = 3600;

  for (let i = count; i >= 0; i--) {
    const time = now - i * step;
    const delta = (Math.sin(i / 6) * 0.4 + (Math.random() - 0.48)) * (basePrice * 0.006);
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + Math.random() * (basePrice * 0.003);
    const low = Math.min(open, close) - Math.random() * (basePrice * 0.003);
    const volume = Math.floor(1000 + Math.random() * 5000);

    candles.push({
      time,
      open: Number(open.toFixed(precision)),
      high: Number(high.toFixed(precision)),
      low: Number(low.toFixed(precision)),
      close: Number(close.toFixed(precision)),
      volume,
    });
    price = close;
  }

  return candles;
}
