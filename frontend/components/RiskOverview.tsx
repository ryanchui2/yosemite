"use client";

import type { FraudReportSummary, FraudResult } from "@/lib/api";
import { AlertTriangle } from "lucide-react";

interface Props {
  results: FraudResult[];
  totalScanned: number;
  summary: FraudReportSummary | null;
}

function buildFallbackSummary(results: FraudResult[], totalScanned: number): FraudReportSummary {
  const flaggedPct = totalScanned > 0 ? ((results.length / totalScanned) * 100).toFixed(1) : "0.0";
  const topRules = Object.entries(
    results.reduce<Record<string, number>>((acc, result) => {
      for (const rule of result.triggered_rules) {
        acc[rule] = (acc[rule] ?? 0) + 1;
      }
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([rule]) => rule);

  return {
    report_count: 0,
    ai_generated: false,
    common_vulnerabilities: results.length
      ? [
          `${flaggedPct}% of scanned transactions are currently flagged for review.`,
          topRules.length
            ? `Recurring fraud signals include ${topRules.join(" and ")}.`
            : "Recurring fraud signals are present across the flagged transaction set.",
        ]
      : ["No suspicious transactions were detected in the latest fraud scan."],
    potential_reasons: results.length
      ? ["The current pattern suggests weak verification, risky payment context, or repeated rule-trigger combinations."]
      : ["No recent fraud indicators were available to infer likely causes."],
    improvement_advice: results.length
      ? ["Review the flagged cases, confirm fraud outcomes, and use those reports to refine controls and escalation rules."]
      : ["Continue monitoring transactions and recording confirmed fraud reports to generate a stronger trend summary."],
    disclaimer:
      "AI-generated summaries may be imprecise and should be validated by an analyst before acting on them.",
  };
}

function OverviewSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 bg-foreground" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RiskOverview({ results, totalScanned, summary }: Props) {
  const content = summary ?? buildFallbackSummary(results, totalScanned);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
        Risk Overview
      </p>

      <div className="border border-border px-3 py-2 text-[11px] text-muted-foreground font-mono">
        Based on {content.report_count > 0 ? `${content.report_count} flagged transaction${content.report_count > 1 ? "s" : ""} from the latest fraud scan` : "the latest fraud analysis"}
        {content.ai_generated ? " · AI summary" : " · fallback summary"}
      </div>

      <div className="flex-1 space-y-3 overflow-auto pr-1">
        <OverviewSection title="Common vulnerabilities" items={content.common_vulnerabilities} />
        <OverviewSection title="Potential reasons" items={content.potential_reasons} />
        <OverviewSection title="Advice for improvement" items={content.improvement_advice} />
      </div>

      <div className="border border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>{content.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
