"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/hooks/usePortfolio";
import { START_QUOTE_BALANCE, fmtNum } from "@/lib/pairs";

export type AuthMode = "login" | "register";

interface AuthDialogProps {
  open: boolean;
  mode: AuthMode;
  onModeChange: (m: AuthMode) => void;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthDialog({ open, mode, onModeChange, onClose, onSuccess }: AuthDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => userRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("POST", mode === "login" ? "/api/auth/login" : "/api/auth/register", { username, password });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPassword("");
    onSuccess();
  };

  const switchMode = (m: AuthMode) => {
    setError("");
    onModeChange(m);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-sm rounded-xl border border-[#2B3139] bg-[#181A20] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="auth-title" className="text-lg font-semibold text-[#EAECEF]">
            {mode === "login" ? "Log in" : "Create account"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-[#848E9C] hover:text-[#EAECEF]">
            ×
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-md bg-[#2B3139] p-1 text-sm">
          {(["login", "register"] as AuthMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded py-1.5 font-semibold transition-colors ${mode === m ? "bg-[#F0B90B] text-[#0B0E11]" : "text-[#848E9C] hover:text-[#EAECEF]"}`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-[#848E9C]">
            Username
            <input
              ref={userRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="rounded-md border border-transparent bg-[#2B3139] px-3 py-2 text-sm text-[#EAECEF] outline-none focus:border-[#F0B90B]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#848E9C]">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              className="rounded-md border border-transparent bg-[#2B3139] px-3 py-2 text-sm text-[#EAECEF] outline-none focus:border-[#F0B90B]"
            />
          </label>

          {error && <p className="rounded bg-[#F6465D]/10 px-3 py-2 text-xs text-[#F6465D]">{error}</p>}

          <button
            disabled={busy}
            className="mt-1 rounded-md bg-[#F0B90B] py-2.5 text-sm font-semibold text-[#0B0E11] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-[11px] leading-relaxed text-[#5E6673]">
          Paper trading only: no real money, no deposits. New accounts start with {fmtNum(START_QUOTE_BALANCE, 0)} USDT of
          virtual funds. Your username appears on the public leaderboard.
        </p>
      </div>
    </div>
  );
}
