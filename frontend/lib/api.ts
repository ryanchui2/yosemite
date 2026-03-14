const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

// ── Types matching the API contract ──────────────────────────────────────────

export interface SanctionsResult {
  uploaded_name: string;
  matched_name: string;
  confidence: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  sanctions_list: string;
  reason: string;
  ai_explanation: string;
  action: string;
}

export interface SanctionsResponse {
  scan_id: string;
  total_entities: number;
  flagged: number;
  results: SanctionsResult[];
}

export interface AnomalyResult {
  row_index: number;
  date: string;
  vendor: string;
  amount: number;
  anomaly_score: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  ai_explanation: string;
}

export interface AnomaliesResponse {
  scan_id: string;
  total_transactions: number;
  flagged: number;
  results: AnomalyResult[];
}

export interface GeoRiskResult {
  country: string;
  risk_score: number;
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  conflict_events_90d: number;
  fatalities_90d: number;
  ai_briefing: string;
}

export interface GeoRiskResponse {
  results: GeoRiskResult[];
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function scanSanctions(file: File): Promise<SanctionsResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BACKEND_URL}/api/sanctions`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Sanctions scan failed: ${res.status}`);
  return res.json();
}

export async function scanAnomalies(file: File): Promise<AnomaliesResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BACKEND_URL}/api/anomalies`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Anomaly scan failed: ${res.status}`);
  return res.json();
}

export async function analyzeGeoRisk(countries: string[]): Promise<GeoRiskResponse> {
  const res = await fetch(`${BACKEND_URL}/api/georisk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countries }),
  });
  if (!res.ok) throw new Error(`Geo risk analysis failed: ${res.status}`);
  return res.json();
}
