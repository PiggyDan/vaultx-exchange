// Pure matching rules — no I/O, so they're unit-tested in isolation (see matching.test.ts).

import type { Candle } from "./market";

export type Side = "BUY" | "SELL";
export type OrderKind = "MARKET" | "LIMIT";

/** A limit order is marketable if it crosses the current price. */
export function isMarketable(side: Side, limit: number, market: number) {
  return side === "BUY" ? limit >= market : limit <= market;
}

/** Marketable orders execute at the better of limit and market (price improvement for the taker). */
export function executionPrice(kind: OrderKind, side: Side, limit: number | null, market: number) {
  if (kind === "MARKET" || limit === null) return market;
  return side === "BUY" ? Math.min(limit, market) : Math.max(limit, market);
}

/**
 * Price range traded strictly after an order was placed: only candles that *opened* after creation
 * count (a candle that started earlier may contain prices from before the order existed),
 * plus the current price.
 */
export function rangeSince(candles: Candle[], createdAt: number, currentPrice?: number) {
  let low = Infinity;
  let high = -Infinity;
  for (const c of candles) {
    if (c.openTime < createdAt) continue;
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  if (currentPrice !== undefined && Number.isFinite(currentPrice)) {
    low = Math.min(low, currentPrice);
    high = Math.max(high, currentPrice);
  }
  return Number.isFinite(low) ? { low, high } : null;
}

/** A resting order fills if the market traded through its limit after it was placed. */
export function shouldFillResting(side: Side, limit: number, range: { low: number; high: number } | null) {
  if (!range) return false;
  return side === "BUY" ? range.low <= limit : range.high >= limit;
}

/** Reject limit prices absurdly far from market (fat-finger guard). */
export function withinBand(limit: number, market: number, band = 0.5) {
  return limit >= market * (1 - band) && limit <= market * (1 + band);
}
