"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderView } from "@/lib/server/trading";

export type { OrderView };

export interface Portfolio {
  user: { id: string; username: string; createdAt: string };
  balances: Record<string, { free: number; locked: number }>;
  openOrders: OrderView[];
  history: OrderView[];
  totalValueUsd: number | null;
  startingValueUsd: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: data.error ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: "Network error — check your connection" };
  }
}

/** Logged-in user's portfolio, polled while the tab is visible. `portfolio` is null when logged out. */
export function usePortfolio(pollMs = 10_000) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await api<Portfolio | { user: null }>("GET", "/api/portfolio");
    if (r.ok) setPortfolio(r.data.user ? (r.data as Portfolio) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, pollMs);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pollMs]);

  return { portfolio, loading, refresh };
}
