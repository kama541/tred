// Shared price formatting utility for all TRADEIQ components
export function formatAssetPrice(price: number | null | undefined, sym: string): string {
  if (price === null || price === undefined || isNaN(price)) return 'N/A';
  const clean = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isJpy = clean.includes('JPY');
  const isGold = clean.includes('XAU') || clean.includes('GOLD') || clean.includes('PAXG');
  const isCrypto = clean.includes('BTC') || clean.includes('ETH') || clean.includes('SOL') || clean.includes('USDT') || clean.includes('USDC') || clean.includes('BNB') || clean.includes('XRP');
  const isForex = !isCrypto && !isGold && (
    clean.includes('EUR') || clean.includes('GBP') || clean.includes('AUD') || clean.includes('NZD') || clean.includes('USD') || clean.includes('CAD') || clean.includes('CHF')
  );

  let decimals = 2;
  let showDollar = true;

  if (isGold) {
    decimals = 2;
    showDollar = true;
  } else if (isJpy) {
    decimals = 3;
    showDollar = false;
  } else if (isForex) {
    decimals = 5;
    showDollar = false;
  } else if (isCrypto) {
    decimals = price >= 100 ? 2 : price >= 1 ? 4 : 6;
    showDollar = true;
  } else {
    decimals = 2;
    showDollar = true;
  }

  const formatted = price.toFixed(decimals);
  return showDollar ? `$${formatted}` : formatted;
}
