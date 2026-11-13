import { describe, expect, it } from "vitest";
import { executionPrice, isMarketable, rangeSince, shouldFillResting, withinBand } from "./matching";

describe("isMarketable", () => {
  it("buy limit at or above market crosses", () => {
    expect(isMarketable("BUY", 100, 100)).toBe(true);
    expect(isMarketable("BUY", 101, 100)).toBe(true);
    expect(isMarketable("BUY", 99, 100)).toBe(false);
  });
  it("sell limit at or below market crosses", () => {
    expect(isMarketable("SELL", 100, 100)).toBe(true);
    expect(isMarketable("SELL", 99, 100)).toBe(true);
    expect(isMarketable("SELL", 101, 100)).toBe(false);
  });
});

describe("executionPrice", () => {
  it("market orders take the market price", () => {
    expect(executionPrice("MARKET", "BUY", null, 100)).toBe(100);
  });
  it("marketable limits get price improvement", () => {
    expect(executionPrice("LIMIT", "BUY", 105, 100)).toBe(100);
    expect(executionPrice("LIMIT", "SELL", 95, 100)).toBe(100);
  });
});

describe("rangeSince", () => {
  const candles = [
    { openTime: 0, low: 50, high: 150 }, // opened before the order — must be ignored
    { openTime: 60_000, low: 98, high: 103 },
    { openTime: 120_000, low: 96, high: 101 },
  ];

  it("ignores candles that opened before the order", () => {
    expect(rangeSince(candles, 30_000)).toEqual({ low: 96, high: 103 });
  });
  it("includes the current price", () => {
    expect(rangeSince(candles, 30_000, 110)).toEqual({ low: 96, high: 110 });
  });
  it("returns null with no data", () => {
    expect(rangeSince([], 0)).toBeNull();
  });
  it("falls back to current price alone", () => {
    expect(rangeSince([], 0, 100)).toEqual({ low: 100, high: 100 });
  });
});

describe("shouldFillResting", () => {
  const range = { low: 96, high: 103 };
  it("fills a buy when the low touched the limit", () => {
    expect(shouldFillResting("BUY", 96, range)).toBe(true);
    expect(shouldFillResting("BUY", 95, range)).toBe(false);
  });
  it("fills a sell when the high touched the limit", () => {
    expect(shouldFillResting("SELL", 103, range)).toBe(true);
    expect(shouldFillResting("SELL", 104, range)).toBe(false);
  });
  it("never fills without data", () => {
    expect(shouldFillResting("BUY", 1e9, null)).toBe(false);
  });
});

describe("withinBand", () => {
  it("accepts prices within ±50%", () => {
    expect(withinBand(150, 100)).toBe(true);
    expect(withinBand(50, 100)).toBe(true);
  });
  it("rejects fat-finger prices", () => {
    expect(withinBand(151, 100)).toBe(false);
    expect(withinBand(49, 100)).toBe(false);
  });
});
