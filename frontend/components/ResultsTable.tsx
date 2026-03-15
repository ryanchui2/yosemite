import { RiskBadge } from "@/components/RiskBadge";
import { AIExplanationCard } from "@/components/AIExplanationCard";
import type {
  SanctionsResponse,
  AnomaliesResponse,
} from "@/lib/api";

type Props =
  | { type: "sanctions"; data: SanctionsResponse }
  | { type: "anomalies"; data: AnomaliesResponse };

export function ResultsTable(props: Props) {
  if (props.type === "sanctions") {
    const { data } = props;
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            Sanctions Scan Results
          </span>
          <span className="text-xs text-gray-500">
            {data.flagged} of {data.total_entities} flagged
          </span>
        </div>
        {data.results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No matches found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Uploaded Name</th>
                <th className="px-4 py-2 text-left">Matched Name</th>
                <th className="px-4 py-2 text-left">Confidence</th>
                <th className="px-4 py-2 text-left">Risk</th>
                <th className="px-4 py-2 text-left">List</th>
                <th className="px-4 py-2 text-left">Geo Risk</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.results.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.uploaded_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.matched_name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">{r.matched_name ? `${r.confidence}%` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={r.risk_level} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.sanctions_list || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {r.geo_risk_level ? (
                      <div className="space-y-1">
                        <RiskBadge level={r.geo_risk_level === "CRITICAL" ? "HIGH" : r.geo_risk_level} />
                        {r.geo_risk_score != null && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-14 bg-gray-100 rounded-full h-1">
                              <div
                                className="bg-red-400 h-1 rounded-full"
                                style={{ width: `${r.geo_risk_score}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">{r.geo_risk_score}/100</span>
                          </div>
                        )}
                        {r.geo_briefing && (
                          <AIExplanationCard explanation={r.geo_briefing} />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">No country</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-700">{r.action}</div>
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

  // anomalies
  const { data } = props;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">
          Anomaly Detection Results
        </span>
        <span className="text-xs text-gray-500">
          {data.flagged} of {data.total_transactions} flagged
        </span>
      </div>
      {data.results.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">No anomalies detected.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-left">Score</th>
              <th className="px-4 py-2 text-left">Risk</th>
              <th className="px-4 py-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.results.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs">{r.date}</td>
                <td className="px-4 py-3 font-medium">{r.vendor}</td>
                <td className="px-4 py-3 text-right font-mono">
                  ${r.amount.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-orange-500 h-1.5 rounded-full"
                        style={{ width: `${r.anomaly_score * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{(r.anomaly_score * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RiskBadge level={r.risk_level} />
                </td>
                <td className="px-4 py-3">
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {r.reasons.map((reason, j) => (
                      <li key={j}>• {reason}</li>
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
