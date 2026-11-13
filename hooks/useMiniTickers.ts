"use client";

import { useEffect, useState } from "react";
import type { PairConfig } from "@/lib/pairs";

export interface MiniTicker {
  price: number;
  open: number;
  change: number;
  live: boolean;
}

const WS_COMBINED = "wss://data-stream.binance.vision/stream?streams=";

/** Lightweight 24h price + change for many pairs over one combined stream, with simulated fallback. */
export function useMiniTickers(pairs: PairConfig[]): Record<string, MiniTicker> {
  const [data, setData] = useState<Record<string, MiniTicker>>({});
  const key = pairs.map((p) => p.symbol).join(",");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let sim: ReturnType<typeof setInterval> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const startSim = () => {
      if (disposed || sim) return;
      sim = setInterval(() => {
        setData((prev) => {
          const next = { ...prev };
          for (const p of pairs) {
            const cur = next[p.symbol];
            if (cur?.live) continue;
            const base = cur?.price || p.simBase;
            const open = cur?.open || base;
            const price = base * (1 + (Math.random() - 0.5) * 0.002);
            next[p.symbol] = { price, open, change: ((price - open) / open) * 100, live: false };
          }
          return next;
        });
      }, 1500);
    };

    const stopSim = () => {
      if (sim) clearInterval(sim);
      sim = null;
    };

    const markStale = () => {
      setData((prev) => {
        const next: Record<string, MiniTicker> = {};
        for (const [k, v] of Object.entries(prev)) next[k] = { ...v, live: false };
        return next;
      });
      startSim();
    };

    const armWatchdog = (ms: number) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(markStale, ms);
    };

    function connect() {
      if (disposed) return;
      try {
        ws = new WebSocket(WS_COMBINED + pairs.map((p) => `${p.symbol.toLowerCase()}@miniTicker`).join("/"));
      } catch {
        startSim();
        return;
      }
      armWatchdog(4_000);
      ws.onopen = () => {
        attempts = 0;
      };
      ws.onmessage = (ev: MessageEvent<string>) => {
        try {
          const { data: d } = JSON.parse(ev.data);
          const price = parseFloat(d.c);
          const open = parseFloat(d.o);
          if (!d.s || !Number.isFinite(price) || !Number.isFinite(open)) return;
          armWatchdog(8_000);
          stopSim();
          setData((prev) => ({ ...prev, [d.s]: { price, open, change: ((price - open) / open) * 100, live: true } }));
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (disposed) return;
        markStale();
        reconnect = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++));
      };
    }

    connect();

    return () => {
      disposed = true;
      stopSim();
      if (watchdog) clearTimeout(watchdog);
      if (reconnect) clearTimeout(reconnect);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}
