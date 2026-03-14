import type { SanctionsResponse, AnomaliesResponse, GeoRiskResponse } from "@/lib/api";

interface Props {
  sanctionsData: SanctionsResponse | null;
  anomaliesData: AnomaliesResponse | null;
  geoRiskData: GeoRiskResponse | null;
}

export function RiskSummary({ sanctionsData, anomaliesData, geoRiskData }: Props) {
  const hasData = sanctionsData || anomaliesData || geoRiskData;
  if (!hasData) return null;

  const cards = [
    sanctionsData && {
      label: "Entities Scanned",
      value: sanctionsData.total_entities,
      sub: `${sanctionsData.flagged} flagged`,
      alert: sanctionsData.flagged > 0,
    },
    anomaliesData && {
      label: "Transactions Scanned",
      value: anomaliesData.total_transactions,
      sub: `${anomaliesData.flagged} anomalies`,
      alert: anomaliesData.flagged > 0,
    },
    geoRiskData && {
      label: "Countries Analyzed",
      value: geoRiskData.results.length,
      sub: `${geoRiskData.results.filter((r) => r.risk_level === "CRITICAL" || r.risk_level === "HIGH").length} high risk`,
      alert: geoRiskData.results.some((r) => r.risk_level === "CRITICAL"),
    },
  ].filter(Boolean) as { label: string; value: number; sub: string; alert: boolean }[];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className={`bg-white border rounded-lg px-4 py-3 ${
            card.alert ? "border-orange-200" : "border-gray-200"
          }`}
        >
          <p className="text-xs text-gray-500">{card.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{card.value.toLocaleString()}</p>
          <p className={`text-xs mt-0.5 ${card.alert ? "text-orange-600 font-medium" : "text-gray-400"}`}>
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
