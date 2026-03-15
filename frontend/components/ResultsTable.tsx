import { RiskBadge } from "@/components/RiskBadge";
import { AIExplanationCard } from "@/components/AIExplanationCard";
import type {
  SanctionsResponse,
  AnomaliesResponse,
  GeoRiskResponse,
} from "@/lib/api";

type Props =
  | { type: "sanctions"; data: SanctionsResponse }
  | { type: "anomalies"; data: AnomaliesResponse }
  | { type: "georisk"; data: GeoRiskResponse };

export function ResultsTable(props: Props) {
  if (props.type === "sanctions") {
    const { data } = props;
    return (
      <div className="border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-foreground uppercase tracking-wider">
            Sanctions Scan Results
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {data.flagged} of {data.total_entities} flagged
          </span>
        </div>
        {data.results.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No matches found.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-accent text-[10px] text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Uploaded Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Matched Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Confidence</th>
                <th className="px-4 py-2.5 text-left font-medium">Risk</th>
                <th className="px-4 py-2.5 text-left font-medium">List</th>
                <th className="px-4 py-2.5 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.results.map((r, i) => (
                <tr key={i} className="hover:bg-accent/50">
                  <td className="px-4 py-3 font-medium text-foreground">{r.uploaded_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.matched_name}</td>
                  <td className="px-4 py-3 font-mono">{r.confidence}%</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={r.risk_level} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sanctions_list}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-foreground/80">{r.action}</div>
                    <AIExplanationCard explanation={r.ai_explanation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  if (props.type === "anomalies") {
    const { data } = props;
    return (
      <div className="border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-foreground uppercase tracking-wider">
            Anomaly Detection Results
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {data.flagged} of {data.total_transactions} flagged
          </span>
        </div>
        {data.results.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No anomalies detected.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-accent text-[10px] text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 text-left font-medium">Score</th>
                <th className="px-4 py-2.5 text-left font-medium">Risk</th>
                <th className="px-4 py-2.5 text-left font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.results.map((r, i) => (
                <tr key={i} className="hover:bg-accent/50">
                  <td className="px-4 py-3 text-muted-foreground font-mono">{r.date}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{r.vendor}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${r.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-accent h-px relative">
                        <div
                          className="bg-foreground h-px absolute top-0 left-0"
                          style={{ width: `${r.anomaly_score * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{(r.anomaly_score * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge level={r.risk_level} />
                  </td>
                  <td className="px-4 py-3">
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {r.reasons.map((reason, j) => (
                        <li key={j}>— {reason}</li>
                      ))}
                    </ul>
                    <AIExplanationCard explanation={r.ai_explanation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // georisk
  const { data } = props;
  return (
    <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
      {data.results.map((r, i) => (
        <div key={i} className="bg-card p-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-foreground">{r.country}</h3>
            <RiskBadge level={r.risk_level} />
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">
              <span>Risk score</span>
              <span className="font-mono text-foreground">{r.risk_score}/100</span>
            </div>
            <div className="w-full bg-accent h-px relative">
              <div
                className="bg-foreground h-px absolute top-0 left-0"
                style={{ width: `${r.risk_score}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conflict events (90d)</p>
              <p className="font-mono text-foreground">{r.conflict_events_90d}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fatalities (90d)</p>
              <p className="font-mono text-foreground">{r.fatalities_90d}</p>
            </div>
          </div>
          <AIExplanationCard explanation={r.ai_briefing} />
        </div>
      ))}
    </div>
  );
}
