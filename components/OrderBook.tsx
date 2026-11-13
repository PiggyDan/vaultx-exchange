"use client";

import { useEffect, useMemo, useState } from "react";
import type { PriceDirection } from "@/hooks/useBinanceTicker";
import { fmtNum } from "@/lib/pairs";

interface Level {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  price: number;
  direction: PriceDirection;
  rows?: number;
  base?: string;
  quote?: string;
  priceDecimals?: number;
  amountDecimals?: number;
  fiatValue?: string;
}

// Amounts are generated in "BTC-sized" units, then scaled to the pair's price so notional depth looks similar.
const REF_PRICE = 67_500;
const randAmount = () => (Math.random() > 0.94 ? 2 + Math.random() * 6 : Math.random() ** 2 * 1.2 + 0.0005);
const jitter = (a: number) => (Math.random() < 0.18 ? randAmount() : Math.max(0.0005, a * (0.85 + Math.random() * 0.3)));

function Row({
  level,
  max,
  side,
  priceDecimals,
  amountDecimals,
}: {
  level: Level;
  max: number;
  side: "bid" | "ask";
  priceDecimals: number;
  amountDecimals: number;
}) {
  const color = side === "bid" ? "#0ECB81" : "#F6465D";
  return (
    <div className="relative grid grid-cols-3 px-3 py-[2px] font-mono text-xs tabular-nums hover:bg-white/5">
      <div
        className="absolute inset-y-0 right-0 transition-[width] duration-500 ease-out"
        style={{ width: `${(level.total / max) * 100}%`, backgroundColor: `${color}26` }}
      />
      <span className="relative" style={{ color }}>
        {fmtNum(level.price, priceDecimals)}
      </span>
      <span className="relative text-right text-[#EAECEF]">{fmtNum(level.amount, amountDecimals)}</span>
      <span className="relative text-right text-[#B7BDC6]">{fmtNum(level.total, amountDecimals)}</span>
    </div>
  );
}

export default function OrderBook({
  price,
  direction,
  rows = 14,
  base = "BTC",
  quote = "USDT",
  priceDecimals = 2,
  amountDecimals = 5,
  fiatValue,
}: OrderBookProps) {
  const [amounts, setAmounts] = useState<{ asks: number[]; bids: number[] }>({ asks: [], bids: [] });

  useEffect(() => {
    const seed = () =>
      setAmounts({
        asks: Array.from({ length: rows }, randAmount),
        bids: Array.from({ length: rows }, randAmount),
      });
    const first = setTimeout(seed, 0);
    const id = setInterval(() => {
      setAmounts((prev) => ({ asks: prev.asks.map(jitter), bids: prev.bids.map(jitter) }));
    }, 750);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [rows]);

  const book = useMemo(() => {
    if (price <= 0 || amounts.asks.length === 0)
      return { asks: [] as Level[], bids: [] as Level[], max: 1, spread: 0, bidVol: 0, askVol: 0 };
    const minTick = 10 ** -priceDecimals;
    const step = Math.max(minTick, +(price * 0.00002).toFixed(priceDecimals));
    const bestBid = Math.floor(price / step) * step;
    const bestAsk = bestBid + step;
    const scale = REF_PRICE / price;

    let cum = 0;
    const asks: Level[] = amounts.asks.map((a, i) => {
      const amount = a * scale;
      cum += amount;
      return { price: +(bestAsk + i * step).toFixed(priceDecimals), amount, total: cum };
    });
    const askVol = cum;

    cum = 0;
    const bids: Level[] = amounts.bids.map((a, i) => {
      const amount = a * scale;
      cum += amount;
      return { price: +(bestBid - i * step).toFixed(priceDecimals), amount, total: cum };
    });
    const bidVol = cum;

    return { asks: asks.reverse(), bids, max: Math.max(askVol, bidVol), spread: bestAsk - bestBid, bidVol, askVol };
  }, [price, amounts, priceDecimals]);

  const bidPct = book.bidVol + book.askVol > 0 ? (book.bidVol / (book.bidVol + book.askVol)) * 100 : 50;
  const up = direction === "up";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2B3139] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[#EAECEF]">Order Book</h2>
        <span className="text-[10px] text-[#848E9C]">Spread {fmtNum(book.spread, priceDecimals)}</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-[#848E9C]">
        <span>Price({quote})</span>
        <span className="text-right">Amount({base})</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-end overflow-hidden">
          {book.asks.map((l, i) => (
            <Row key={`a${i}`} level={l} max={book.max} side="ask" priceDecimals={priceDecimals} amountDecimals={amountDecimals} />
          ))}
        </div>

        <div className="flex items-center gap-2 border-y border-[#2B3139] px-3 py-2">
          <span className={`font-mono text-lg font-semibold tabular-nums ${up ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
            {price > 0 ? fmtNum(price, priceDecimals) : "—"}
          </span>
          <span className={up ? "text-[#0ECB81]" : "text-[#F6465D]"}>{up ? "↑" : "↓"}</span>
          <span className="truncate font-mono text-xs text-[#848E9C]">{price > 0 && fiatValue ? `≈ ${fiatValue}` : "—"}</span>
        </div>

        <div className="flex-1 overflow-hidden">
          {book.bids.map((l, i) => (
            <Row key={`b${i}`} level={l} max={book.max} side="bid" priceDecimals={priceDecimals} amountDecimals={amountDecimals} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[#2B3139] px-3 py-2 text-[11px]">
        <span className="text-[#0ECB81]">B {bidPct.toFixed(1)}%</span>
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[#F6465D]">
          <div className="h-full bg-[#0ECB81] transition-[width] duration-500" style={{ width: `${bidPct}%` }} />
        </div>
        <span className="text-[#F6465D]">{(100 - bidPct).toFixed(1)}% S</span>
      </div>
    </div>
  );
}
