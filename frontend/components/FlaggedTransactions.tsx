"use client";

import type { FraudResult } from "@/lib/api";
import { RiskBadge } from "@/components/RiskBadge";
import { AlertTriangle } from "lucide-react";

interface Props {
  results: FraudResult[];
}

export function FlaggedTransactions({ results }: Props) {
  const flagged = results.slice(0, 5);

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
        Flagged Transactions
      </p>

      {flagged.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 opacity-20" />
          <p className="text-xs">No flagged transactions</p>
        </div>
      ) : (
        <ul className="flex-1 flex flex-col gap-1 overflow-auto">
          {flagged.map((r) => (
            <li
              key={r.transaction_id}
              className="flex items-start gap-3 border border-border px-3 py-2.5"
            >
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 bg-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground truncate">
                    {r.customer_name ?? r.transaction_id}
                  </p>
                  <RiskBadge level={r.risk_level} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  {r.amount != null ? `$${r.amount.toLocaleString()}` : "—"}
                  {r.triggered_rules[0] ? ` · ${r.triggered_rules[0]}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {results.length > 5 && (
        <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wider">
          +{results.length - 5} more flagged
        </p>
      )}
    </div>
  );
}
