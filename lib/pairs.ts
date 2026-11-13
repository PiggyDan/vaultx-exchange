export interface PairConfig {
  symbol: string; // Binance symbol, e.g. BTCUSDT
  base: string;
  quote: string;
  name: string;
  color: string; // emblem / accent tint
  simBase: number; // fallback price when offline
  priceDecimals: number;
  amountDecimals: number;
}

export const QUOTE = "USDT";
export const START_QUOTE_BALANCE = 25_000;

export const PAIRS: PairConfig[] = [
  { symbol: "BTCUSDT", base: "BTC", quote: QUOTE, name: "Bitcoin", color: "#F7931A", simBase: 67_500, priceDecimals: 2, amountDecimals: 5 },
  { symbol: "ETHUSDT", base: "ETH", quote: QUOTE, name: "Ethereum", color: "#7B93F0", simBase: 3_500, priceDecimals: 2, amountDecimals: 4 },
  { symbol: "SOLUSDT", base: "SOL", quote: QUOTE, name: "Solana", color: "#14F195", simBase: 160, priceDecimals: 2, amountDecimals: 2 },
  { symbol: "BNBUSDT", base: "BNB", quote: QUOTE, name: "BNB", color: "#F0B90B", simBase: 600, priceDecimals: 2, amountDecimals: 3 },
  { symbol: "XRPUSDT", base: "XRP", quote: QUOTE, name: "XRP", color: "#C0C6CF", simBase: 0.6, priceDecimals: 4, amountDecimals: 1 },
  { symbol: "DOGEUSDT", base: "DOGE", quote: QUOTE, name: "Dogecoin", color: "#C2A633", simBase: 0.15, priceDecimals: 5, amountDecimals: 0 },
];

export const getPair = (symbol: string) => PAIRS.find((p) => p.symbol === symbol) ?? PAIRS[0];

const formatters = new Map<number, Intl.NumberFormat>();
export function fmtNum(n: number, decimals = 2) {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(decimals, f);
  }
  return f.format(n);
}
