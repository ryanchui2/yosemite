"use client";

import type { SanctionsResponse, AnomaliesResponse, GeoRiskResponse } from "@/lib/api";

interface Props {
  sanctionsData: SanctionsResponse | null;
  anomaliesData: AnomaliesResponse | null;
  geoRiskData: GeoRiskResponse | null;
}

export function PDFExport({ sanctionsData, anomaliesData, geoRiskData }: Props) {
  function handleExport() {
    // Build plain-text report, then trigger browser print-to-PDF
    const lines: string[] = [
      "yosemite — Compliance Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
    ];

    if (sanctionsData) {
      lines.push("── SANCTIONS SCREENING ──────────────────────────────");
      lines.push(`Entities scanned: ${sanctionsData.total_entities}  |  Flagged: ${sanctionsData.flagged}`);
      for (const r of sanctionsData.results) {
        lines.push(`\n  ${r.uploaded_name} → ${r.matched_name} (${r.confidence}% match)`);
        lines.push(`  Risk: ${r.risk_level}  |  List: ${r.sanctions_list}`);
        lines.push(`  Action: ${r.action}`);
      }
      lines.push("");
    }

    if (anomaliesData) {
      lines.push("── ANOMALY DETECTION ────────────────────────────────");
      lines.push(`Transactions scanned: ${anomaliesData.total_transactions}  |  Flagged: ${anomaliesData.flagged}`);
      for (const r of anomaliesData.results) {
        lines.push(`\n  ${r.date}  ${r.vendor}  $${r.amount.toLocaleString()}`);
        lines.push(`  Risk: ${r.risk_level}  |  Score: ${(r.anomaly_score * 100).toFixed(0)}%`);
        lines.push(`  Reasons: ${r.reasons.join("; ")}`);
      }
      lines.push("");
    }

    if (geoRiskData) {
      lines.push("── GEOPOLITICAL RISK ────────────────────────────────");
      for (const r of geoRiskData.results) {
        lines.push(`\n  ${r.country}  —  ${r.risk_level} (score ${r.risk_score}/100)`);
        lines.push(`  Conflict events (90d): ${r.conflict_events_90d}  |  Fatalities: ${r.fatalities_90d}`);
      }
      lines.push("");
    }

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<pre style="font-family:monospace;padding:24px;white-space:pre-wrap">${lines.join("\n")}</pre>`);
    win.document.close();
    win.print();
  }

  return (
    <button
      onClick={handleExport}
      className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
    >
      Export PDF
    </button>
  );
}
