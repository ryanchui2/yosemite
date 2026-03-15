"use client";

import dynamic from "next/dynamic";

const LiquidHexScene = dynamic(() => import("./LiquidHexScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <p className="text-xs text-muted-foreground animate-pulse font-mono">loading scene…</p>
    </div>
  ),
});

interface Props {
  score: number; // 0–100
}

export function ProtectionScore({ score }: Props) {
  const s     = Math.max(0, Math.min(100, score));
  const label = s >= 75 ? "PROTECTED" : s >= 50 ? "MODERATE" : "HIGH RISK";
  const accent = s >= 75 ? "#22c55e" : s >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
        Protection Score
      </p>

      {/* 3-D scene */}
      <div style={{ width: 340, height: 340 }}>
        <LiquidHexScene score={s} />
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-bold text-foreground tabular-nums">{s}</span>
        <span className="text-base text-muted-foreground font-mono">/ 100</span>
      </div>

      {/* Rating label */}
      <span
        className="text-[10px] font-medium px-3 py-1 border uppercase tracking-wider"
        style={{ borderColor: accent, color: accent }}
      >
        {label}
      </span>
    </div>
  );
}
