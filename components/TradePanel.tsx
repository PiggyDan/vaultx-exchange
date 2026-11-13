"use client";

import { useEffect, useRef, useState } from "react";
import { PAIRS, QUOTE, START_QUOTE_BALANCE, fmtNum, type PairConfig } from "@/lib/pairs";
import { api, type OrderView, type Portfolio } from "@/hooks/usePortfolio";
import CoinIcon from "@/components/CoinIcon";

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  message: string;
}

interface TradePanelProps {
  pair: PairConfig;
  price: number;
  portfolio: Portfolio | null;
  onRequireAuth: () => void;
  onChanged: () => void | Promise<void>;
  /** Converts a USD(T) amount to the selected display currency string. */
  formatFiat?: (usd: number) => string;
  /** Latest USD price per base asset, for wallet valuation. */
  prices?: Record<string, number>;
}

const PCTS = [25, 50, 75, 100];
const NUM_RE = /^\d*\.?\d*$/;
const floorTo = (n: number, d: number) => (Math.floor(n * 10 ** d) / 10 ** d).toFixed(d);
const decimalsFor = (base: string) => PAIRS.find((p) => p.base === base) ?? PAIRS[0];

function Field({
  label,
  value,
  onChange,
  suffix,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  suffix: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label
      className={`flex items-center rounded-md border border-transparent bg-[#2B3139] px-3 py-2 text-sm transition-colors focus-within:border-[#F0B90B] ${
        disabled ? "opacity-60" : "hover:border-[#474D57]"
      }`}
    >
      <span className="w-14 shrink-0 text-xs text-[#848E9C]">{label}</span>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => NUM_RE.test(e.target.value) && onChange?.(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-right font-mono tabular-nums text-[#EAECEF] outline-none placeholder:text-[#5E6673]"
      />
      <span className="ml-2 w-11 shrink-0 text-right text-xs text-[#EAECEF]">{suffix}</span>
    </label>
  );
}

function OrderRow({ o, onCancel }: { o: OrderView; onCancel?: () => void }) {
  const p = decimalsFor(o.base);
  const px = o.fillPrice ?? o.price ?? 0;
  return (
    <div className="flex items-center justify-between border-b border-[#2B3139] py-2 text-xs last:border-0">
      <div className="flex items-center gap-2">
        <CoinIcon base={o.base} size={18} />
        <div className="flex flex-col">
        <span className={o.side === "BUY" ? "text-[#0ECB81]" : "text-[#F6465D]"}>
          {o.side} {o.base} · {o.type.toLowerCase()}
        </span>
        <span className="font-mono text-[#848E9C]">
          {fmtNum(o.amount, p.amountDecimals)} @ {fmtNum(px, p.priceDecimals)}
        </span>
        </div>
      </div>
      {onCancel ? (
        <button onClick={onCancel} className="text-[#848E9C] hover:text-[#F0B90B]">
          Cancel
        </button>
      ) : (
        <div className="flex flex-col items-end">
          <span className={o.status === "FILLED" ? "text-[#EAECEF]" : "text-[#5E6673]"}>{o.status.toLowerCase()}</span>
          <span className="text-[10px] text-[#5E6673]">{new Date(o.filledAt ?? o.createdAt).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

export default function TradePanel({
  pair,
  price,
  portfolio,
  onRequireAuth,
  onChanged,
  formatFiat = (usd) => `$${fmtNum(usd, 2)}`,
  prices = {},
}: TradePanelProps) {
  const { symbol, base, quote, priceDecimals: pd, amountDecimals: ad } = pair;
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [limitPrice, setLimitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [activePct, setActivePct] = useState<number | null>(null);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seededFor, setSeededFor] = useState("");
  const idRef = useRef(1);
  const prevOpenIds = useRef<Set<string> | null>(null);

  // Reset the form to the live price when the pair changes (or the first price arrives).
  if (price > 0 && seededFor !== symbol) {
    setSeededFor(symbol);
    setLimitPrice(price.toFixed(pd));
    setAmount("");
    setActivePct(null);
  }

  const pushToast = (kind: Toast["kind"], title: string, message: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, kind, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  // Announce resting orders the server filled since the last poll.
  useEffect(() => {
    if (!portfolio) {
      prevOpenIds.current = null;
      return;
    }
    const prev = prevOpenIds.current;
    prevOpenIds.current = new Set(portfolio.openOrders.map((o) => o.id));
    if (!prev) return;
    const filled = portfolio.history.filter((o) => o.status === "FILLED" && prev.has(o.id));
    if (filled.length === 0) return;
    const t = setTimeout(() => {
      for (const o of filled) {
        const p = decimalsFor(o.base);
        pushToast("success", `Limit ${o.side.toLowerCase()} filled`, `${fmtNum(o.amount, p.amountDecimals)} ${o.base} @ ${fmtNum(o.fillPrice ?? 0, p.priceDecimals)}`);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [portfolio]);

  const loggedIn = !!portfolio;
  const balances = portfolio?.balances ?? {};
  const baseBal = balances[base]?.free ?? 0;
  const quoteBal = balances[quote]?.free ?? 0;
  const execPrice = orderType === "MARKET" ? price : parseFloat(limitPrice) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = amountNum * execPrice;
  const walletUsd = Object.entries(balances).reduce(
    (sum, [asset, b]) => sum + (b.free + b.locked) * (asset === QUOTE ? 1 : (prices[asset] ?? 0)),
    0,
  );
  const pnlPct = ((walletUsd - START_QUOTE_BALANCE) / START_QUOTE_BALANCE) * 100;

  const applyPct = (pct: number) => {
    if (!loggedIn) return onRequireAuth();
    setActivePct(pct);
    if (side === "BUY") {
      if (execPrice <= 0) return;
      // Leave a hair of headroom so a 100% market buy isn't rejected by price drift.
      const usable = orderType === "MARKET" ? quoteBal * 0.998 : quoteBal;
      setAmount(floorTo((usable * pct) / 100 / execPrice, ad));
    } else {
      setAmount(floorTo((baseBal * pct) / 100, ad));
    }
  };

  const onTotalChange = (v: string) => {
    setActivePct(null);
    const t = parseFloat(v);
    setAmount(Number.isFinite(t) && execPrice > 0 ? floorTo(t / execPrice, ad) : "");
  };

  const switchSide = (s: Side) => {
    setSide(s);
    setAmount("");
    setActivePct(null);
  };

  const submit = async () => {
    if (!loggedIn) return onRequireAuth();
    if (amountNum <= 0) return pushToast("error", "Invalid amount", `Enter an amount of ${base}.`);
    setBusy(true);
    const r = await api<{ order: { status: string; amount: number; fillPrice: number | null; price: number | null } }>(
      "POST",
      "/api/orders",
      { symbol, side, type: orderType, amount, ...(orderType === "LIMIT" ? { price: limitPrice } : {}) },
    );
    setBusy(false);
    if (!r.ok) return pushToast("error", "Order rejected", r.error);
    const o = r.data.order;
    if (o.status === "FILLED") {
      pushToast("success", `${side === "BUY" ? "Buy" : "Sell"} order filled`, `${fmtNum(o.amount, ad)} ${base} @ ${fmtNum(o.fillPrice ?? 0, pd)} ${quote}`);
    } else {
      pushToast("info", "Limit order placed", `${side} ${fmtNum(o.amount, ad)} ${base} @ ${fmtNum(o.price ?? 0, pd)}`);
      setTab("open");
    }
    setAmount("");
    setActivePct(null);
    await onChanged();
  };

  const cancel = async (o: OrderView) => {
    const r = await api("DELETE", `/api/orders/${o.id}`);
    if (!r.ok) pushToast("error", "Cancel failed", r.error);
    else pushToast("info", "Order cancelled", `${o.side} ${o.base} @ ${fmtNum(o.price ?? 0, decimalsFor(o.base).priceDecimals)}`);
    await onChanged();
  };

  const isBuy = side === "BUY";
  const accent = isBuy ? "#0ECB81" : "#F6465D";
  const list = tab === "open" ? (portfolio?.openOrders ?? []) : (portfolio?.history ?? []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2B3139] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[#EAECEF]">
          Spot · {base}/{quote}
        </h2>
        <span className="rounded bg-[#2B3139] px-2 py-0.5 text-[10px] text-[#F0B90B]">Paper trading</span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 rounded-md bg-[#2B3139] p-1">
          {(["BUY", "SELL"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => switchSide(s)}
              className={`rounded py-1.5 text-sm font-semibold transition-colors ${
                side === s ? (s === "BUY" ? "bg-[#0ECB81] text-white" : "bg-[#F6465D] text-white") : "text-[#848E9C] hover:text-[#EAECEF]"
              }`}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="flex gap-4 text-sm">
          {(["LIMIT", "MARKET"] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`capitalize transition-colors ${orderType === t ? "font-semibold text-[#F0B90B]" : "text-[#848E9C] hover:text-[#EAECEF]"}`}
            >
              {t.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-[#848E9C]">Avbl</span>
          <span className="font-mono tabular-nums text-[#EAECEF]">
            {loggedIn ? (isBuy ? `${fmtNum(quoteBal, 2)} ${quote}` : `${fmtNum(baseBal, ad)} ${base}`) : "—"}
          </span>
        </div>

        {orderType === "LIMIT" ? (
          <Field label="Price" value={limitPrice} onChange={setLimitPrice} suffix={quote} />
        ) : (
          <Field label="Price" value="" placeholder="Market Price" suffix={quote} disabled />
        )}

        <Field
          label="Amount"
          value={amount}
          onChange={(v) => {
            setActivePct(null);
            setAmount(v);
          }}
          suffix={base}
          placeholder={(0).toFixed(ad)}
        />

        <div className="grid grid-cols-4 gap-2">
          {PCTS.map((p) => (
            <button
              key={p}
              onClick={() => applyPct(p)}
              className="rounded border py-1 text-xs transition-colors"
              style={
                activePct === p
                  ? { borderColor: accent, color: accent, backgroundColor: `${accent}1A` }
                  : { borderColor: "#474D57", color: "#848E9C" }
              }
            >
              {p}%
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Field label="Total" value={total > 0 ? total.toFixed(2) : ""} onChange={onTotalChange} suffix={quote} placeholder="0.00" />
          <span className="text-right font-mono text-[11px] text-[#848E9C]">≈ {formatFiat(total)}</span>
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-1 rounded-md py-2.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          style={{ backgroundColor: loggedIn ? accent : "#F0B90B", color: loggedIn ? "#fff" : "#0B0E11" }}
        >
          {busy ? "Submitting…" : loggedIn ? `${isBuy ? "Buy" : "Sell"} ${base}` : "Log in / Sign up to trade"}
        </button>

        <div className="rounded-md bg-[#0B0E11] p-3 text-xs">
          {loggedIn ? (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[#848E9C]">Wallet</span>
                <span className="text-right">
                  <span className="font-mono text-sm font-semibold tabular-nums text-[#EAECEF]">≈ {formatFiat(walletUsd)}</span>
                  <span className={`ml-2 font-mono ${pnlPct >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[QUOTE, ...PAIRS.map((p) => p.base)].map((asset) => {
                  const p = PAIRS.find((x) => x.base === asset);
                  const b = balances[asset];
                  const qty = (b?.free ?? 0) + (b?.locked ?? 0);
                  return (
                    <div key={asset} className="flex justify-between" title={b?.locked ? `${fmtNum(b.locked, p ? p.amountDecimals : 2)} locked in orders` : undefined}>
                      <span className={`flex items-center gap-1.5 ${asset === base ? "font-semibold text-[#F0B90B]" : "text-[#848E9C]"}`}>
                        <CoinIcon base={asset} size={13} />
                        {asset}
                      </span>
                      <span className="font-mono tabular-nums text-[#EAECEF]">
                        {fmtNum(qty, p ? p.amountDecimals : 2)}
                        {b?.locked ? <span className="text-[#F0B90B]">*</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="leading-relaxed text-[#848E9C]">
              Create a free account to get <span className="text-[#F0B90B]">{fmtNum(START_QUOTE_BALANCE, 0)} USDT</span> of virtual
              funds. Trades are stored on the server and ranked on the leaderboard.
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-[#2B3139]">
        <div className="flex gap-4 px-4 py-2 text-xs">
          {(["open", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "font-semibold text-[#EAECEF]" : "text-[#848E9C] hover:text-[#EAECEF]"}
            >
              {t === "open" ? `Open Orders (${portfolio?.openOrders.length ?? 0})` : "History"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {list.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#5E6673]">{loggedIn ? (tab === "open" ? "No open orders" : "No trades yet") : "Log in to see your orders"}</p>
          ) : (
            list.map((o) => <OrderRow key={o.id} o={o} onCancel={tab === "open" ? () => cancel(o) : undefined} />)
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((t) => {
          const c = t.kind === "success" ? "#0ECB81" : t.kind === "error" ? "#F6465D" : "#F0B90B";
          return (
            <div
              key={t.id}
              className="pointer-events-auto animate-[toastIn_.25s_ease-out] rounded-md border-l-4 bg-[#1E2329] px-4 py-3 shadow-xl shadow-black/40"
              style={{ borderColor: c }}
            >
              <div className="text-sm font-semibold" style={{ color: c }}>
                {t.title}
              </div>
              <div className="mt-0.5 font-mono text-xs text-[#B7BDC6]">{t.message}</div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
