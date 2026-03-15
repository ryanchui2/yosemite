"use client";

import { Button } from "@/components/ui/button";
import { FraudAgentProgress } from "@/components/FraudAgentProgress";
import type { AgentScanReport } from "@/lib/api";

interface AIFraudTabProps {
  agentScanDocument: File | null;
  setAgentScanDocument: (f: File | null) => void;
  agentScanLoading: boolean;
  onRunAgentScan: () => void;
  agentScanReport: AgentScanReport | null;
}

export function AIFraudTab({
  agentScanDocument,
  setAgentScanDocument,
  agentScanLoading,
  onRunAgentScan,
  agentScanReport,
}: AIFraudTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border p-6 space-y-4">
        <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
          Full AI fraud analysis
        </p>
        <p className="text-sm text-foreground/80">
          Run the full AI fraud analysis pipeline: anomaly detection, Benford&apos;s Law, duplicate detection, graph analysis, and behavioral velocity on all transactions in the database.
        </p>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Optional: attach a document (PDF/image) for VLM fraud analysis
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".pdf,image/*"
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:bg-muted file:text-xs"
              onChange={(e) => setAgentScanDocument(e.target.files?.[0] ?? null)}
            />
            {agentScanDocument && (
              <span className="text-xs text-muted-foreground">
                {agentScanDocument.name}
                <button
                  type="button"
                  className="ml-1 text-destructive hover:underline"
                  onClick={() => setAgentScanDocument(null)}
                >
                  clear
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-4 items-start">
          <div className="space-y-4">
            <Button
              onClick={onRunAgentScan}
              disabled={agentScanLoading}
              className="font-mono text-xs"
            >
              {agentScanLoading ? "Running analysis…" : "Run full AI fraud analysis"}
            </Button>

            {agentScanReport && (
              <AgentScanReportCard report={agentScanReport} />
            )}
          </div>
          <FraudAgentProgress loading={agentScanLoading} report={agentScanReport} />
        </div>
      </div>
    </div>
  );
}

function AgentScanReportCard({ report }: { report: AgentScanReport }) {
  return (
    <div className="border border-border mt-4 p-4 space-y-3 text-sm">
      <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
        Report
      </p>
      {report.duration_ms != null && (
        <p className="text-xs text-muted-foreground">
          Analysis completed in {report.duration_ms.toLocaleString()} ms
        </p>
      )}
      <p className="font-medium capitalize text-foreground">
        Risk level: {report.risk_level}
      </p>
      <p className="text-foreground/90 leading-relaxed">{report.summary}</p>
      {report.anomalous_transaction_ids.length > 0 && (
        <p className="text-xs font-mono text-muted-foreground">
          Anomalous IDs: {report.anomalous_transaction_ids.slice(0, 15).join(", ")}
          {report.anomalous_transaction_ids.length > 15 ? "…" : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {report.benford_suspicious && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            Benford suspicious
          </span>
        )}
        {report.duplicate_groups_count > 0 && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            {report.duplicate_groups_count} duplicate group(s)
          </span>
        )}
        {report.graph_flagged_ids && report.graph_flagged_ids.length > 0 && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            Graph: {report.graph_flagged_ids.length} flagged
          </span>
        )}
        {report.document_risk_level && report.document_risk_level !== "LOW" && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            Document (VLM): {report.document_risk_level}
          </span>
        )}
        {report.velocity_flagged_ids && report.velocity_flagged_ids.length > 0 && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            Velocity: {report.velocity_flagged_ids.length} flagged
          </span>
        )}
        {report.gnn_flagged_ids && report.gnn_flagged_ids.length > 0 && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            GNN: {report.gnn_flagged_ids.length} flagged
          </span>
        )}
        {report.sequence_flagged_ids && report.sequence_flagged_ids.length > 0 && (
          <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
            Sequence: {report.sequence_flagged_ids.length} flagged
          </span>
        )}
      </div>
      {report.graph_summary && (
        <p className="text-xs text-muted-foreground">{report.graph_summary}</p>
      )}
      {report.document_summary && (
        <p className="text-xs text-muted-foreground">{report.document_summary}</p>
      )}
      {report.velocity_summary && (
        <p className="text-xs text-muted-foreground">{report.velocity_summary}</p>
      )}
      {report.gnn_summary && (
        <p className="text-xs text-muted-foreground">{report.gnn_summary}</p>
      )}
      {report.sequence_summary && (
        <p className="text-xs text-muted-foreground">{report.sequence_summary}</p>
      )}
      {[
        report.velocity_summary,
        report.gnn_summary,
        report.sequence_summary,
      ].some(
        (s) =>
          s &&
          (s.includes("Insufficient") ||
            s.includes("no edges") ||
            s.includes("need at least 2") ||
            s.includes("graph too small")),
      ) && (
          <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
            <strong>Why some agents didn&apos;t flag:</strong> Velocity and Sequence need timestamps and multiple transactions per customer; Graph/GNN need transactions that share customer_id or order_id so the graph has edges. If your data has unique customers per row or missing timestamps, those agents report &quot;insufficient data&quot; instead of scores. Seed demo data (see migrations) or use a CSV with timestamp, customer_id, and order_id for full pipeline coverage.
          </p>
        )}
      {report.review_notes && (
        <p className="text-xs border-l-2 border-amber-500/50 pl-2 text-foreground/80 italic">
          Review: {report.review_notes}
        </p>
      )}
      {report.recommendations.length > 0 && (
        <ul className="list-disc list-inside space-y-1 text-foreground/80">
          {report.recommendations.map((rec, i) => (
            <li key={i}>{rec}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
