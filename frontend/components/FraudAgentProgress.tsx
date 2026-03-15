"use client";

import { useEffect, useState } from "react";
import type { AgentScanReport } from "@/lib/api";
import {
  Activity,
  BarChart3,
  Copy,
  FileSearch,
  GitBranch,
  Layers,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";

export type AgentStatus = "pending" | "running" | "done";

export interface AgentStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const AGENTS: AgentStep[] = [
  { id: "coordinator", name: "FraudCoordinator", description: "Orchestrates specialist agents", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "anomaly", name: "AnomalyAgent", description: "Isolation Forest outlier scoring", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "benford", name: "BenfordAgent", description: "Benford's Law digit distribution", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "duplicate", name: "DuplicateAgent", description: "Duplicate invoice detection", icon: <Copy className="h-3.5 w-3.5" /> },
  { id: "document", name: "DocumentAgent", description: "VLM document fraud analysis", icon: <FileSearch className="h-3.5 w-3.5" /> },
  { id: "graph", name: "GraphAgent", description: "Graph-based fraud heuristics", icon: <GitBranch className="h-3.5 w-3.5" /> },
  { id: "reviewer", name: "FraudReviewer", description: "Second-pass review notes", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
];

function getAgentOutcome(id: string, report: AgentScanReport): string | null {
  switch (id) {
    case "anomaly":
      return report.anomalous_transaction_ids?.length
        ? `${report.anomalous_transaction_ids.length} flagged`
        : "None flagged";
    case "benford":
      return report.benford_suspicious ? "Suspicious" : "OK";
    case "duplicate":
      return report.duplicate_groups_count
        ? `${report.duplicate_groups_count} group(s)`
        : "0 groups";
    case "document":
      return report.document_risk_level ?? "Skipped";
    case "graph": {
      const n = report.graph_flagged_ids?.length ?? 0;
      return n > 0 ? `${n} flagged` : "0 flagged";
    }
    case "reviewer":
      return report.review_notes ? "Note added" : "Skipped (disabled)";
    case "coordinator":
      return report.risk_level;
    default:
      return null;
  }
}

/** Why an agent shows Skipped or unavailable; or extra detail (e.g. graph summary). For tooltips. */
function getAgentOutcomeHint(id: string, report: AgentScanReport): string | null {
  switch (id) {
    case "document":
      return report.document_risk_level
        ? null
        : "No document was uploaded with this run. Upload a PDF/image in the AI fraud flow to run document (VLM) analysis.";
    case "graph":
      if (report.graph_summary?.toLowerCase().includes("networkx not installed"))
        return "Install networkx in the AI environment: pip install networkx (see ai/requirements.txt).";
      return report.graph_summary ?? null;
    case "reviewer":
      return report.review_notes
        ? null
        : "FraudReviewer is disabled. Set FRAUD_REVIEWER_ENABLED=true in the AI service .env (e.g. ai/.env) and restart the AI service to enable.";
    default:
      return null;
  }
}

interface FraudAgentProgressProps {
  loading: boolean;
  report: AgentScanReport | null;
}

export function FraudAgentProgress({ loading, report }: FraudAgentProgressProps) {
  const [runningIndex, setRunningIndex] = useState(0);

  // Cycle through agents every 1.5s while loading to show progress
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setRunningIndex((i) => (i + 1) % AGENTS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  const getStatus = (index: number): AgentStatus => {
    if (report) return "done";
    if (!loading) return "pending";
    return index === runningIndex ? "running" : index < runningIndex ? "done" : "pending";
  };

  return (
    <div className="border border-border bg-muted/30 p-4 rounded-md">
      <div className="flex items-center gap-2 mb-3">
        <ScanSearch className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
          Agent pipeline
        </p>
      </div>
      <ul className="space-y-2">
        {AGENTS.map((agent, index) => {
          const status = getStatus(index);
          return (
            <li
              key={agent.id}
              className={`flex items-center gap-3 py-1.5 px-2 rounded transition-colors ${status === "running" ? "bg-primary/10" : ""
                }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded border shrink-0 ${status === "done"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : status === "running"
                    ? "border-primary/50 bg-primary/20 text-primary animate-pulse"
                    : "border-border text-muted-foreground"
                  }`}
              >
                {status === "done" ? (
                  <span className="text-[10px] font-bold">✓</span>
                ) : (
                  agent.icon
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{agent.description}</p>
              </div>
              {status === "running" && (
                <span className="text-[10px] text-primary font-medium shrink-0">Running…</span>
              )}
              {status === "done" && report && getAgentOutcome(agent.id, report) && (
                <span
                  className="text-[10px] text-muted-foreground font-mono shrink-0 capitalize"
                  title={getAgentOutcomeHint(agent.id, report) ?? undefined}
                >
                  {getAgentOutcome(agent.id, report)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
