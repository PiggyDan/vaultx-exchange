import { PAIRS } from "@/lib/pairs";
import { ApiError } from "./http";

// data-api.binance.vision is Binance's public market-data mirror; unlike api.binance.com it isn't
// geo-blocked for US cloud regions (where Vercel functions run by default).
const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];

async function binance<T>(path: string): Promise<T> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      /* try next host */
    }
  }
  throw new ApiError(503, "Market data is unavailable right now, please try again");
}

let priceCache: { at: number; prices: Record<string, number> } | null = null;

/** Latest price for every supported pair, cached for 2s per server instance. */
export async function getPrices(): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.at < 2000) return priceCache.prices;
  const symbols = encodeURIComponent(JSON.stringify(PAIRS.map((p) => p.symbol)));
  const rows = await binance<{ symbol: string; price: string }[]>(`/api/v3/ticker/price?symbols=${symbols}`);
  const prices = Object.fromEntries(rows.map((r) => [r.symbol, parseFloat(r.price)]));
  priceCache = { at: Date.now(), prices };
  return prices;
}

export interface Candle {
  openTime: number;
  low: number;
  high: number;
}

/**
 * Candles covering [since, now], used to fill resting limit orders that were crossed while
 * nobody was looking. Resolution degrades with age so one request (max 1000 candles) suffices.
 */
export async function getCandlesSince(symbol: string, since: Date): Promise<{ candles: Candle[]; intervalMs: number }> {
  const ageMin = (Date.now() - since.getTime()) / 60_000;
  const [interval, intervalMs] =
    ageMin <= 1000 ? (["1m", 60_000] as const) : ageMin <= 60_000 ? (["1h", 3_600_000] as const) : (["1d", 86_400_000] as const);
  const startTime = Math.floor(since.getTime() / intervalMs) * intervalMs;
  const rows = await binance<unknown[][]>(
    `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=1000`,
  );
  return {
    intervalMs,
    candles: rows.map((k) => ({ openTime: Number(k[0]), high: parseFloat(String(k[2])), low: parseFloat(String(k[3])) })),
  };
}
