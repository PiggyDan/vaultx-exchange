"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, usePortfolio } from "@/hooks/usePortfolio";
import { START_QUOTE_BALANCE, fmtNum } from "@/lib/pairs";

interface Leader {
  rank: number;
  username: string;
  valueUsd: number;
  pnlPct: number;
  trades: number;
  joined: string;
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [error, setError] = useState("");
  const { portfolio } = usePortfolio(30_000);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api<{ leaders: Leader[] }>("GET", "/api/leaderboard");
      if (!alive) return;
      if (r.ok) {
        setLeaders(r.data.leaders);
        setError("");
      } else setError(r.error);
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0B0E11] text-[#EAECEF]">
      <header className="flex h-14 items-center justify-between border-b border-[#2B3139] bg-[#181A20] px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-[#F0B90B]">
          VaultX
        </Link>
        <Link href="/" className="text-sm text-[#B7BDC6] hover:text-[#F0B90B]">
          ← Back to trading
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="mt-1 text-sm text-[#848E9C]">
          Every trader starts with {fmtNum(START_QUOTE_BALANCE, 0)} USDT of paper money. Ranked by live portfolio value. Refreshes every 15s.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-[#2B3139] bg-[#181A20]">
          <table className="w-full text-sm">
            <thead className="bg-[#1E2329] text-left text-xs text-[#848E9C]">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Trader</th>
                <th className="px-4 py-3 text-right font-medium">Portfolio</th>
                <th className="px-4 py-3 text-right font-medium">P&amp;L</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Trades</th>
              </tr>
            </thead>
            <tbody>
              {leaders === null && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#5E6673]">
                    Loading…
                  </td>
                </tr>
              )}
              {error && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#F6465D]">
                    {error}
                  </td>
                </tr>
              )}
              {leaders?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#5E6673]">
                    No traders yet. <Link href="/" className="text-[#F0B90B]">Be the first →</Link>
                  </td>
                </tr>
              )}
              {leaders?.map((l) => {
                const me = portfolio?.user.username === l.username;
                return (
                  <tr key={l.username} className={`border-t border-[#2B3139] ${me ? "bg-[#F0B90B]/10" : ""}`}>
                    <td className="px-4 py-3 font-mono text-[#848E9C]">
                      {l.rank <= 3 ? ["🥇", "🥈", "🥉"][l.rank - 1] : l.rank}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {l.username}
                      {me && <span className="ml-2 text-xs font-normal text-[#F0B90B]">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">${fmtNum(l.valueUsd, 2)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${l.pnlPct >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                      {l.pnlPct >= 0 ? "+" : ""}
                      {l.pnlPct.toFixed(2)}%
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-[#848E9C] sm:table-cell">{l.trades}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
