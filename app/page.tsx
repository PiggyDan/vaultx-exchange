"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useBinanceTicker } from "@/hooks/useBinanceTicker";
import { useMiniTickers } from "@/hooks/useMiniTickers";
import { useFxRates } from "@/hooks/useFxRates";
import { api, usePortfolio } from "@/hooks/usePortfolio";
import Link from "next/link";
import AuthDialog, { type AuthMode } from "@/components/AuthDialog";
import CoinIcon from "@/components/CoinIcon";
import BrandLink from "@/components/BrandLink";
import { PAIRS, fmtNum, getPair } from "@/lib/pairs";
import { FIATS, fmtFiat, getFiat } from "@/lib/currencies";
import OrderBook from "@/components/OrderBook";
import LiveChart from "@/components/LiveChart";
import TradePanel from "@/components/TradePanel";

const CryptoScene3D = dynamic(() => import("@/components/CryptoScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[260px] items-center justify-center text-xs text-[#5E6673]">
      <span className="animate-pulse">Loading 3D scene…</span>
    </div>
  ),
});

const fmtCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const STORAGE_KEY = "vaultx:pair";
const FIAT_KEY = "vaultx:fiat";


function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex shrink-0 flex-col">
      <span className="text-[10px] text-[#848E9C]">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${className || "text-[#EAECEF]"}`}>{value}</span>
    </div>
  );
}


export default function Page() {
  const [symbol, setSymbol] = useState(PAIRS[0].symbol);
  const pair = getPair(symbol);
  const ticker = useBinanceTicker(pair.symbol, { simBasePrice: pair.simBase, decimals: pair.priceDecimals });
  const market = useMiniTickers(PAIRS);
  const { portfolio, loading: portfolioLoading, refresh } = usePortfolio();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const openAuth = useCallback((m: AuthMode) => {
    setAuthMode(m);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const logout = async () => {
    await api("POST", "/api/auth/logout");
    await refresh();
  };

  const fx = useFxRates();
  const [fiatCode, setFiatCode] = useState("USD");
  const fiat = getFiat(fiatCode);
  const rate = fx.rates[fiat.code] ?? fiat.fallbackRate;
  const formatFiat = useCallback((usd: number) => fmtFiat(usd * rate, fiat), [rate, fiat]);

  const up = ticker.direction === "up";
  const has = ticker.price > 0;
  const pd = pair.priceDecimals;

  const prices = useMemo(
    () =>
      Object.fromEntries(
        PAIRS.map((p) => [p.base, p.symbol === pair.symbol && has ? ticker.price : (market[p.symbol]?.price ?? 0)]),
      ),
    [market, pair.symbol, has, ticker.price],
  );

  // Restore last pair + currency after hydration (deferred so SSR markup stays consistent).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && PAIRS.some((p) => p.symbol === saved)) setSymbol(saved);
        const savedFiat = localStorage.getItem(FIAT_KEY);
        if (savedFiat && FIATS.some((f) => f.code === savedFiat)) setFiatCode(savedFiat);
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const selectFiat = (code: string) => {
    setFiatCode(code);
    try {
      localStorage.setItem(FIAT_KEY, code);
    } catch {
      /* storage unavailable */
    }
  };

  const selectPair = (s: string) => {
    setSymbol(s);
    try {
      localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    if (has) document.title = `${fmtNum(ticker.price, pd)} | ${pair.base}/${pair.quote} · VaultX`;
  }, [ticker.price, has, pd, pair.base, pair.quote]);

  const statusStyle =
    ticker.status === "live"
      ? { dot: "bg-[#0ECB81]", text: "text-[#0ECB81]", label: "Live" }
      : ticker.status === "simulated"
        ? { dot: "bg-[#F0B90B]", text: "text-[#F0B90B]", label: "Simulated" }
        : { dot: "bg-[#848E9C]", text: "text-[#848E9C]", label: "Connecting" };

  return (
    <div className="min-h-screen w-full bg-[#0B0E11] text-[#EAECEF] antialiased">
      <header className="sticky top-0 z-40 border-b border-[#2B3139] bg-[#181A20]/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4">
          <BrandLink />

          <div className="hidden h-8 w-px bg-[#2B3139] md:block" />

          <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto">
            <div className="flex shrink-0 items-center gap-2">
              <CoinIcon base={pair.base} size={26} />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {pair.base}/{pair.quote}
                </span>
                <span className="text-[10px] text-[#848E9C]">{pair.name}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col">
              <span className={`font-mono text-base font-semibold tabular-nums transition-colors ${up ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                {has ? fmtNum(ticker.price, pd) : "—"}
              </span>
              <span className="font-mono text-[10px] text-[#848E9C]">{has ? `≈ ${formatFiat(ticker.price)}` : "—"}</span>
            </div>
            <Stat
              label="24h Change"
              value={has ? `${ticker.change24h >= 0 ? "+" : ""}${ticker.change24h.toFixed(2)}%` : "—"}
              className={ticker.change24h >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}
            />
            <div className="hidden shrink-0 gap-6 sm:flex">
              <Stat label="24h High" value={ticker.high24h ? fmtNum(ticker.high24h, pd) : "—"} />
              <Stat label="24h Low" value={ticker.low24h ? fmtNum(ticker.low24h, pd) : "—"} />
              <Stat label={`24h Vol(${pair.base})`} value={ticker.volume24h ? fmtCompact.format(ticker.volume24h) : "—"} />
            </div>
            <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${statusStyle.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot} ${ticker.status === "live" ? "animate-pulse" : ""}`} />
              {statusStyle.label}
            </span>
          </div>

          <label className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#2B3139] bg-[#1E2329] px-2 py-1 text-sm hover:border-[#474D57]">
            <span aria-hidden>{fiat.flag}</span>
            <select
              value={fiat.code}
              onChange={(e) => selectFiat(e.target.value)}
              aria-label="Display currency"
              className="cursor-pointer bg-transparent font-semibold text-[#EAECEF] outline-none"
            >
              {FIATS.map((f) => (
                <option key={f.code} value={f.code} className="bg-[#1E2329]">
                  {f.code} · {f.name}
                </option>
              ))}
            </select>
          </label>

          <Link
            href="/leaderboard"
            className="hidden shrink-0 text-sm font-medium text-[#B7BDC6] transition-colors hover:text-[#F0B90B] md:block"
          >
            Leaderboard
          </Link>

          {portfolioLoading ? (
            <span className="h-8 w-24 shrink-0 animate-pulse rounded-md bg-[#2B3139]" />
          ) : portfolio ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-2 rounded-md border border-[#2B3139] bg-[#1E2329] px-3 py-1.5 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full bg-[#0ECB81]" />
                {portfolio.user.username}
              </span>
              <button onClick={logout} className="text-xs text-[#848E9C] hover:text-[#F6465D]">
                Log out
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => openAuth("login")} className="px-2 text-sm font-semibold text-[#EAECEF] hover:text-[#F0B90B]">
                Log in
              </button>
              <button
                onClick={() => openAuth("register")}
                className="rounded-md bg-[#F0B90B] px-3 py-1.5 text-sm font-semibold text-[#0B0E11] hover:brightness-110"
              >
                Sign up
              </button>
            </div>
          )}
        </div>

        <nav className="flex h-10 items-center gap-1 overflow-x-auto border-t border-[#2B3139] px-2" aria-label="Markets">
          {PAIRS.map((p) => {
            const m = market[p.symbol];
            const active = p.symbol === symbol;
            const chg = m?.change ?? 0;
            return (
              <button
                key={p.symbol}
                onClick={() => selectPair(p.symbol)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-2 rounded px-3 py-1 text-xs transition-colors ${
                  active ? "bg-[#2B3139]" : "hover:bg-[#1E2329]"
                }`}
              >
                <CoinIcon base={p.base} size={16} />
                <span className={`font-semibold ${active ? "text-[#F0B90B]" : "text-[#EAECEF]"}`}>{p.base}</span>
                <span className="font-mono tabular-nums text-[#B7BDC6]">{m ? formatFiat(m.price) : "—"}</span>
                <span className={`font-mono tabular-nums ${chg >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                  {m ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : ""}
                </span>
              </button>
            );
          })}
          {fiat.code !== "USD" && (
            <span
              className="ml-auto shrink-0 pl-4 font-mono text-[11px] text-[#848E9C]"
              title={fx.live && fx.updatedAt ? `Updated ${new Date(fx.updatedAt).toLocaleString()}` : "Approximate offline rate"}
            >
              1 USD = {fmtFiat(rate, fiat)} · {fx.live ? "live rate" : "approx."}
            </span>
          )}
        </nav>
      </header>

      <main className="grid gap-1 p-1 lg:h-[calc(100vh-96px)] lg:grid-cols-[minmax(260px,300px)_1fr_minmax(280px,320px)]">
        <section className="order-2 min-h-[640px] overflow-hidden rounded bg-[#181A20] lg:order-1 lg:min-h-0">
          <OrderBook
            key={pair.symbol}
            price={ticker.price}
            direction={ticker.direction}
            base={pair.base}
            quote={pair.quote}
            priceDecimals={pd}
            amountDecimals={pair.amountDecimals}
            fiatValue={has ? formatFiat(ticker.price) : undefined}
          />
        </section>

        <section className="order-1 flex min-h-0 flex-col gap-1 lg:order-2">
          <div className="relative h-[320px] overflow-hidden rounded bg-[#181A20] lg:h-auto lg:min-h-0 lg:flex-[3]">
            <CryptoScene3D direction={ticker.direction} price={ticker.price} color={pair.color} label={pair.base} />
          </div>
          <div className="flex h-[280px] flex-col overflow-hidden rounded bg-[#181A20] lg:h-auto lg:min-h-0 lg:flex-[2]">
            <div className="flex items-center justify-between border-b border-[#2B3139] px-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold">Price Chart</span>
                <span className="text-xs text-[#848E9C]">
                  {pair.base}/{pair.quote} · {ticker.history.length} pts
                </span>
              </div>
              <span className={`font-mono text-xs tabular-nums ${up ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                {has ? fmtNum(ticker.price, pd) : "—"}
              </span>
            </div>
            <div className="min-h-0 flex-1 p-2">
              <LiveChart history={ticker.history} decimals={pd} />
            </div>
          </div>
        </section>

        <section className="order-3 overflow-hidden rounded bg-[#181A20] lg:min-h-0">
          <TradePanel
            pair={pair}
            price={ticker.price}
            portfolio={portfolio}
            onRequireAuth={() => openAuth("register")}
            onChanged={refresh}
            formatFiat={formatFiat}
            prices={prices}
          />
        </section>
      </main>

      <AuthDialog
        open={authOpen}
        mode={authMode}
        onModeChange={setAuthMode}
        onClose={closeAuth}
        onSuccess={async () => {
          setAuthOpen(false);
          await refresh();
        }}
      />
    </div>
  );
}
