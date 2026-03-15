const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

// ── Types matching Rust backend ───────────────────────────────────────────────

export interface FraudResult {
  transaction_id: string;
  customer_name: string | null;
  amount: number | null;
  risk_score: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  triggered_rules: string[];
  ai_explanation: string | null;
  anomaly_score: number | null;
}

export interface FraudScanResponse {
  total_scanned: number;
  flagged: number;
  results: FraudResult[];
}

export interface FraudReportSummary {
  report_count: number;
  ai_generated: boolean;
  common_vulnerabilities: string[];
  potential_reasons: string[];
  improvement_advice: string[];
  disclaimer: string;
}

export interface Transaction {
  transaction_id: string;
  order_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  timestamp: string | null;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  card_last4: string | null;
  card_brand: string | null;
  transaction_status: string | null;
  merchant_id: string | null;
  refund_status: string | null;
  ip_country: string | null;
  ip_is_vpn: boolean | null;
  device_type: string | null;
  address_match: boolean | null;
  cvv_match: boolean | null;
  avs_result: string | null;
  card_present: boolean | null;
  entry_mode: string | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** Scan all transactions or a specific list for fraud */
export async function scanFraud(transactionIds?: string[]): Promise<FraudScanResponse> {
  const res = await fetch(`${BACKEND_URL}/api/fraud/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transactionIds ? { transaction_ids: transactionIds } : {}),
  });
  if (!res.ok) throw new Error(`Fraud scan failed: ${res.status}`);
  return res.json();
}

export async function fetchFraudReportSummary(): Promise<FraudReportSummary> {
  const res = await fetch(`${BACKEND_URL}/api/fraud/report/summary`);
  if (!res.ok) throw new Error(`Fraud report summary failed: ${res.status}`);
  return res.json();
}

/** Fetch all transactions from the database */
export async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch(`${BACKEND_URL}/api/transactions`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return res.json();
}

// ── Stubs for removed endpoints so old components don't crash ─────────────────

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

export async function scanSanctions(file: File): Promise<SanctionsResponse> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'api.ts:scanSanctions', message: 'STUB — not calling backend', data: { fileName: file.name, fileSize: file.size }, timestamp: Date.now(), hypothesisId: 'H-B' }) }).catch(() => { });
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'api.ts:scanSanctions:posting', message: 'posting to backend', data: { fileName: file.name, url: `${BACKEND_URL}/api/sanctions/scan` }, timestamp: Date.now(), hypothesisId: 'H-B-fix' }) }).catch(() => { });
  // #endregion
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BACKEND_URL}/api/sanctions/scan`, {
    method: "POST",
    body: form,
  });
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'api.ts:scanSanctions:response', message: 'got response', data: { status: res.status, ok: res.ok }, timestamp: Date.now(), hypothesisId: 'H-B-fix' }) }).catch(() => { });
  // #endregion
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sanctions scan failed: ${res.status} — ${err}`);
  }
  return res.json();
}

export async function scanAnomalies(file: File): Promise<AnomaliesResponse> {
  const res = await fetch(`${BACKEND_URL}/api/fraud/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Anomaly scan failed: ${res.status}`);
  const fraud: FraudScanResponse = await res.json();

  const results: AnomalyResult[] = fraud.results.map((r, i) => ({
    row_index: i,
    date: new Date().toISOString().split("T")[0],
    vendor: r.customer_name ?? r.transaction_id,
    amount: r.amount ?? 0,
    anomaly_score: r.anomaly_score ?? r.risk_score / 100,
    risk_level: r.risk_level,
    reasons: r.triggered_rules,
    ai_explanation: r.ai_explanation ?? "",
  }));

  return {
    scan_id: crypto.randomUUID(),
    total_transactions: fraud.total_scanned,
    flagged: fraud.flagged,
    results,
  };
}

export async function analyzeGeoRisk(countries: string[]): Promise<GeoRiskResponse> {
  return { results: [] };
}
