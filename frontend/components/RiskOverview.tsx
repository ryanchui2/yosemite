"use client";

import React from "react";
import type { FraudResult } from "@/lib/api";
import { ShieldCheck, ShieldAlert, Activity } from "lucide-react";

interface Props {
  results: FraudResult[];
  totalScanned: number;
}

function buildPhrases(results: FraudResult[], totalScanned: number): { icon: React.ReactNode; text: string; accent: string }[] {
  const highCount = results.filter((r) => r.risk_level === "HIGH").length;
  const medCount = results.filter((r) => r.risk_level === "MEDIUM").length;
  const flaggedPct = totalScanned > 0 ? ((results.length / totalScanned) * 100).toFixed(1) : "0";

  const phrases = [];

  if (results.length === 0) {
    phrases.push({
      icon: <ShieldCheck className="h-4 w-4" />,
      text: "No suspicious transactions detected.",
      accent: "text-green-600",
    });
  } else {
    if (highCount > 0) {
      phrases.push({
        icon: <ShieldAlert className="h-4 w-4" />,
        text: `${highCount} HIGH risk transaction${highCount > 1 ? "s" : ""} require immediate review.`,
        accent: "text-red-600",
      });
    }
    if (medCount > 0) {
      phrases.push({
        icon: <Activity className="h-4 w-4" />,
        text: `${medCount} MEDIUM risk transaction${medCount > 1 ? "s" : ""} flagged for monitoring.`,
        accent: "text-amber-600",
      });
    }
    phrases.push({
      icon: <Activity className="h-4 w-4" />,
      text: `${flaggedPct}% of scanned transactions are flagged.`,
      accent: "text-muted-foreground",
    });
  }

  // Top rule phrase
  const ruleCounts: Record<string, number> = {};
  for (const r of results) {
    for (const rule of r.triggered_rules) {
      ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1;
    }
  }
  const topRule = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])[0];
  if (topRule) {
    phrases.push({
      icon: <ShieldAlert className="h-4 w-4" />,
      text: `Most common risk: "${topRule[0]}" (×${topRule[1]}).`,
      accent: "text-orange-600",
    });
  }

  return phrases;
}

export function RiskOverview({ results, totalScanned }: Props) {
  const phrases = buildPhrases(results, totalScanned);

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
        Risk Overview
      </p>

      <ul className="flex-1 flex flex-col justify-center gap-3">
        {phrases.map((p, i) => (
          <li key={i} className={`flex items-start gap-2 text-xs font-medium ${p.accent}`}>
            <span className="mt-0.5 flex-shrink-0">{p.icon}</span>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
