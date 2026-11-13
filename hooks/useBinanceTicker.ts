"use client";

import { useEffect, useRef, useState } from "react";

export type PriceDirection = "up" | "down";
export type FeedStatus = "connecting" | "live" | "simulated";

export interface PricePoint {
  t: number;
  p: number;
}

export interface TickerState {
  price: number;
  direction: PriceDirection;
  history: PricePoint[];
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  status: FeedStatus;
}

const WS_BASE = "wss://data-stream.binance.vision/ws";
const REST_KLINES = "https://data-api.binance.vision/api/v3/klines";
const SIM_BASE_PRICE = 67_500;
const STALE_MS = 5_000;

const INITIAL: TickerState = {
  price: 0,
  direction: "up",
  history: [],
  change24h: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
  status: "connecting",
};

export interface TickerOptions {
  simBasePrice?: number;
  decimals?: number;
  maxHistory?: number;
}

export function useBinanceTicker(symbol = "BTCUSDT", options: TickerOptions = {}): TickerState {
  const { simBasePrice = SIM_BASE_PRICE, decimals = 2, maxHistory = 150 } = options;
  const [state, setState] = useState<TickerState>(INITIAL);
  const [activeSymbol, setActiveSymbol] = useState(symbol);
  const priceRef = useRef(0);

  // Reset immediately when the pair changes so stale prices never render against the new pair.
  if (activeSymbol !== symbol) {
    setActiveSymbol(symbol);
    setState(INITIAL);
  }

  useEffect(() => {
    let ws: WebSocket | null = null;
    let simTimer: ReturnType<typeof setInterval> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;
    let simOpen = 0;
    const abort = new AbortController();

    priceRef.current = 0;

    const apply = (p: number, extra: Partial<TickerState> = {}) => {
      priceRef.current = p;
      setState((prev) => {
        const direction: PriceDirection =
          prev.price === 0 ? prev.direction : p > prev.price ? "up" : p < prev.price ? "down" : prev.direction;
        const history = [...prev.history, { t: Date.now(), p }].slice(-maxHistory);
        return {
          ...prev,
          ...extra,
          price: p,
          direction,
          history,
          high24h: extra.high24h ?? Math.max(prev.high24h || p, p),
          low24h: extra.low24h ?? Math.min(prev.low24h || p, p),
        };
      });
    };

    const seedSimHistory = (end: number) => {
      const pts: PricePoint[] = [];
      const now = Date.now();
      let p = end;
      for (let i = 0; i < 60; i++) {
        pts.unshift({ t: now - i * 1000, p });
        p = p * (1 + (Math.random() - 0.5) * 0.0018);
      }
      return pts;
    };

    const stopSim = () => {
      if (simTimer) clearInterval(simTimer);
      simTimer = null;
    };

    const startSim = () => {
      if (disposed || simTimer) return;
      if (priceRef.current === 0) {
        priceRef.current = simBasePrice;
        const seed = seedSimHistory(simBasePrice);
        setState((prev) => ({
          ...prev,
          price: simBasePrice,
          history: prev.history.length ? prev.history : seed,
          high24h: Math.max(...seed.map((s) => s.p)),
          low24h: Math.min(...seed.map((s) => s.p)),
          volume24h: ((18_000 + Math.random() * 6_000) * SIM_BASE_PRICE) / simBasePrice,
        }));
      }
      simOpen = priceRef.current;
      setState((prev) => ({ ...prev, status: "simulated" }));
      simTimer = setInterval(() => {
        const last = priceRef.current || simBasePrice;
        const next = +(last * (1 + (Math.random() - 0.5) * 0.0016)).toFixed(decimals);
        setState((prev) => ({ ...prev, volume24h: prev.volume24h + (Math.random() * 2.5 * SIM_BASE_PRICE) / simBasePrice }));
        apply(next, {
          status: "simulated",
          change24h: simOpen ? ((next - simOpen) / simOpen) * 100 : 0,
        });
      }, 1000);
    };

    const armWatchdog = (ms: number) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(startSim, ms);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(30_000, 1000 * 2 ** attempts++);
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        startSim();
        return;
      }
      try {
        ws = new WebSocket(`${WS_BASE}/${symbol.toLowerCase()}@ticker`);
      } catch {
        startSim();
        scheduleReconnect();
        return;
      }
      armWatchdog(4_000);

      ws.onopen = () => {
        attempts = 0;
      };

      ws.onmessage = (ev: MessageEvent<string>) => {
        try {
          const d = JSON.parse(ev.data);
          const p = parseFloat(d.c);
          if (!Number.isFinite(p)) return;
          armWatchdog(STALE_MS);
          stopSim();
          apply(p, {
            status: "live",
            change24h: parseFloat(d.P),
            high24h: parseFloat(d.h),
            low24h: parseFloat(d.l),
            volume24h: parseFloat(d.v),
          });
        } catch {
          /* ignore malformed frame */
        }
      };

      ws.onerror = () => ws?.close();

      ws.onclose = () => {
        if (disposed) return;
        startSim();
        scheduleReconnect();
      };
    }

    const handleOffline = () => startSim();
    const handleOnline = () => {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      attempts = 0;
      connect();
    };

    fetch(`${REST_KLINES}?symbol=${symbol}&interval=1m&limit=${Math.min(maxHistory, 120)}`, {
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((rows: unknown[][]) => {
        if (disposed || !Array.isArray(rows) || rows.length === 0) return;
        const seed: PricePoint[] = rows.map((k) => ({ t: Number(k[6]), p: parseFloat(String(k[4])) }));
        setState((prev) => {
          if (prev.status === "simulated") return prev;
          const firstLive = prev.history[0]?.t ?? Infinity;
          const merged = [...seed.filter((s) => s.t < firstLive), ...prev.history].slice(-maxHistory);
          const price = prev.price || seed[seed.length - 1].p;
          if (!priceRef.current) priceRef.current = price;
          return { ...prev, history: merged, price };
        });
      })
      .catch(() => {
        /* REST seed is optional */
      });

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    connect();

    return () => {
      disposed = true;
      abort.abort();
      stopSim();
      if (watchdog) clearTimeout(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol, maxHistory, simBasePrice, decimals]);

  return state;
}
