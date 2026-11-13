"use client";

import { useEffect, useState } from "react";
import { FIATS } from "@/lib/currencies";

export interface FxState {
  rates: Record<string, number>; // units per 1 USD
  live: boolean;
  updatedAt: number | null;
}

const FX_URL = "https://open.er-api.com/v6/latest/USD";
const REFRESH_MS = 30 * 60 * 1000;

const FALLBACK: FxState = {
  rates: Object.fromEntries(FIATS.map((f) => [f.code, f.fallbackRate])),
  live: false,
  updatedAt: null,
};

/** USD → fiat exchange rates (free, keyless API), refreshed every 30 min, with approximate fallbacks. */
export function useFxRates(): FxState {
  const [state, setState] = useState<FxState>(FALLBACK);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();

    const load = () =>
      fetch(FX_URL, { signal: abort.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: { result?: string; rates?: Record<string, number>; time_last_update_unix?: number }) => {
          if (disposed || d.result !== "success" || !d.rates) return;
          const rates = { ...FALLBACK.rates };
          for (const f of FIATS) {
            const r = d.rates[f.code];
            if (typeof r === "number" && r > 0) rates[f.code] = r;
          }
          setState({ rates, live: true, updatedAt: (d.time_last_update_unix ?? Date.now() / 1000) * 1000 });
        })
        .catch(() => {
          /* keep fallback / last good rates */
        });

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      abort.abort();
      clearInterval(id);
    };
  }, []);

  return state;
}
