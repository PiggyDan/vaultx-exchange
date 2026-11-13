"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PricePoint } from "@/hooks/useBinanceTicker";

import { fmtNum } from "@/lib/pairs";

interface LiveChartProps {
  history: PricePoint[];
  decimals?: number;
  className?: string;
}

const GREEN = "#0ECB81";
const RED = "#F6465D";
const PAD = { l: 8, r: 76, t: 12, b: 22 };

const timeFmt = (t: number) =>
  new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export default function LiveChart({ history, decimals = 2, className = "" }: LiveChartProps) {
  const fmt = { format: (n: number) => fmtNum(n, decimals) };
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { w, h } = size;
    if (!canvas || w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    const pts = history;
    if (pts.length < 2) {
      ctx.fillStyle = "#5E6673";
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Waiting for market data…", w / 2, h / 2);
      return;
    }

    const n = pts.length;
    const cw = w - PAD.l - PAD.r;
    const ch = h - PAD.t - PAD.b;
    let min = Infinity;
    let max = -Infinity;
    for (const pt of pts) {
      if (pt.p < min) min = pt.p;
      if (pt.p > max) max = pt.p;
    }
    const range = max - min || max * 0.001 || 1;
    min -= range * 0.12;
    max += range * 0.12;

    const x = (i: number) => PAD.l + (i / (n - 1)) * cw;
    const y = (p: number) => PAD.t + (1 - (p - min) / (max - min)) * ch;
    const last = pts[n - 1].p;
    const color = last >= pts[0].p ? GREEN : RED;

    ctx.font = font;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(43,49,57,0.8)";
    ctx.fillStyle = "#848E9C";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const gy = Math.round(PAD.t + (g / 4) * ch) + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, gy);
      ctx.lineTo(PAD.l + cw, gy);
      ctx.stroke();
      ctx.fillText(fmt.format(max - (g / 4) * (max - min)), PAD.l + cw + 8, gy);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let g = 0; g < 4; g++) {
      const i = Math.round((g / 3) * (n - 1));
      const lx = Math.min(Math.max(x(i), PAD.l + 28), PAD.l + cw - 28);
      ctx.fillText(timeFmt(pts[i].t), lx, PAD.t + ch + 6);
    }

    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ch);
    grad.addColorStop(0, rgba(color, 0.32));
    grad.addColorStop(1, rgba(color, 0));
    ctx.beginPath();
    ctx.moveTo(x(0), y(pts[0].p));
    for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(pts[i].p));
    ctx.lineTo(x(n - 1), PAD.t + ch);
    ctx.lineTo(x(0), PAD.t + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x(0), y(pts[0].p));
    for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(pts[i].p));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const ly = y(last);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = rgba(color, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.l, ly);
    ctx.lineTo(PAD.l + cw, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.fillRect(PAD.l + cw + 2, ly - 9, PAD.r - 4, 18);
    ctx.fillStyle = "#0B0E11";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fmt.format(last), PAD.l + cw + 7, ly);

    ctx.beginPath();
    ctx.arc(x(n - 1), ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 0.25);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x(n - 1), ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (hover !== null && hover >= 0 && hover < n) {
      const hx = x(hover);
      const hy = y(pts[hover].p);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#5E6673";
      ctx.beginPath();
      ctx.moveTo(hx, PAD.t);
      ctx.lineTo(hx, PAD.t + ch);
      ctx.moveTo(PAD.l, hy);
      ctx.lineTo(PAD.l + cw, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#EAECEF";
      ctx.fill();

      const label = `${fmt.format(pts[hover].p)}  ${timeFmt(pts[hover].t)}`;
      const tw = ctx.measureText(label).width + 16;
      const tx = Math.min(Math.max(hx - tw / 2, PAD.l), PAD.l + cw - tw);
      const ty = hy - 30 < PAD.t ? hy + 10 : hy - 30;
      ctx.fillStyle = "#2B3139";
      ctx.fillRect(tx, ty, tw, 20);
      ctx.fillStyle = "#EAECEF";
      ctx.textAlign = "left";
      ctx.fillText(label, tx + 8, ty + 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, size, hover, decimals]);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const n = history.length;
      if (n < 2 || size.w === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cw = size.w - PAD.l - PAD.r;
      const rel = (e.clientX - rect.left - PAD.l) / cw;
      setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
    },
    [history.length, size.w],
  );

  return (
    <div ref={wrapRef} className={`relative h-full min-h-[180px] w-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}
