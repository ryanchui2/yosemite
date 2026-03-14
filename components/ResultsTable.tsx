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
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.results.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.uploaded_name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.matched_name}</td>
                  <td className="px-4 py-3">{r.confidence}%</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={r.risk_level} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.sanctions_list}</td>
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

  if (props.type === "anomalies") {
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

  // georisk
  const { data } = props;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.results.map((r, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-gray-900">{r.country}</h3>
            <RiskBadge level={r.risk_level} />
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Risk score</span>
              <span className="font-medium text-gray-900">{r.risk_score}/100</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full"
                style={{ width: `${r.risk_score}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
            <div>
              <p className="text-gray-400">Conflict events (90d)</p>
              <p className="font-medium text-gray-900">{r.conflict_events_90d}</p>
            </div>
            <div>
              <p className="text-gray-400">Fatalities (90d)</p>
              <p className="font-medium text-gray-900">{r.fatalities_90d}</p>
            </div>
          </div>
          <AIExplanationCard explanation={r.ai_briefing} />
        </div>
      ))}
    </div>
  );
}
