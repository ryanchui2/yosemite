"use client";

import type { FraudResult } from "@/lib/api";
import { RiskBadge } from "@/components/RiskBadge";
import { AlertTriangle } from "lucide-react";

interface Props {
  results: FraudResult[];
}

export function FlaggedTransactions({ results }: Props) {
  const flagged = results.slice(0, 5); // show top 5 results

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
        Flagged Transactions
      </p>

      {flagged.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 opacity-20" />
          <p className="text-xs">No flagged transactions</p>
        </div>
      ) : (
        <ul className="flex-1 flex flex-col gap-2 overflow-auto">
          {flagged.map((r) => (
            <li
              key={r.transaction_id}
              className="flex items-start gap-3 rounded-2xl bg-background/50 shadow-inner px-3 py-2.5"
            >
              {/* Bullet indicator */}
              <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-orange-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {r.customer_name ?? r.transaction_id}
                  </p>
                  <RiskBadge level={r.risk_level} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r.amount != null ? `$${r.amount.toLocaleString()}` : "—"}
                  {r.triggered_rules[0] ? ` · ${r.triggered_rules[0]}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {results.length > 5 && (
        <p className="text-center text-xs text-muted-foreground">
          +{results.length - 5} more flagged
        </p>
      )}
    </div>
  );
}
