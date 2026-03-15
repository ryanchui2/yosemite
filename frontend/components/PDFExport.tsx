"use client";

import type { SanctionsResponse, AnomaliesResponse, GeoRiskResponse } from "@/lib/api";

interface Props {
  sanctionsData: SanctionsResponse | null;
  anomaliesData: AnomaliesResponse | null;
  geoRiskData: GeoRiskResponse | null;
}

export function PDFExport({ sanctionsData, anomaliesData, geoRiskData }: Props) {
  function handleExport() {
    const lines: string[] = [
      "yosemite — Compliance Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
    ];

    if (sanctionsData) {
      lines.push("── SANCTIONS SCREENING ──────────────────────────────");
      lines.push(`Entities scanned: ${sanctionsData.total_entities}  |  Flagged: ${sanctionsData.flagged}`);
      for (const r of sanctionsData.results) {
        lines.push(`\n  ${r.uploaded_name} → ${r.matched_name || "No match"} (${r.confidence}% match)`);
        lines.push(`  Sanctions Risk: ${r.risk_level}  |  List: ${r.sanctions_list || "—"}`);
        if (r.geo_risk_level) {
          lines.push(`  Geo Risk: ${r.geo_risk_level} (score ${r.geo_risk_score ?? "—"}/100)`);
        }
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
      lines.push("── GEOPOLITICAL RISK ─────────────────────────────────");
      for (const r of geoRiskData.results) {
        lines.push(`\n  ${r.country} — ${r.risk_level} (score ${r.risk_score}/100)`);
        lines.push(`  Conflict events (90d): ${r.conflict_events_90d}  |  Fatalities: ${r.fatalities_90d}`);
      }
      lines.push("");
    }

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }

    doc.open();
    doc.write(`<pre style="font-family:monospace;padding:24px;white-space:pre-wrap">${lines.join("\n")}</pre>`);
    doc.close();

    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 1000);
    };
  }

  return (
    <button
      onClick={handleExport}
      className="px-4 py-1.5 text-[10px] tracking-wider border border-border hover:border-foreground/40 text-foreground transition-colors font-medium"
    >
    report
    </button>
  );
}
