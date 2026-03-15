import { getAccessToken, refreshAccessToken, setAccessToken } from "@/lib/auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token = getAccessToken();
  // #region agent log
  const path = typeof input === "string" ? input.replace(/^.*\/api/, "/api") : "";
  fetch("http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "api.ts:apiFetch",
      message: "apiFetch entry",
      data: { path, hasToken: !!token },
      timestamp: Date.now(),
      hypothesisId: "H1",
    }),
  }).catch(() => { });
  // #endregion
  // If no token in memory, try refresh once so we send Authorization when the session cookie is valid
  if (!token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      setAccessToken(newToken);
      token = newToken;
    }
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "api.ts:apiFetch-after-refresh",
        message: "after refresh attempt",
        data: { path, hadNoToken: true, refreshGotToken: !!newToken },
        timestamp: Date.now(),
        hypothesisId: "H2",
      }),
    }).catch(() => { });
    // #endregion
  }
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // #region agent log
  const hasAuth = headers.has("Authorization");
  fetch("http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "api.ts:apiFetch-before-fetch",
      message: "request headers before fetch",
      data: { path, hasAuthHeader: hasAuth },
      timestamp: Date.now(),
      hypothesisId: "H3",
    }),
  }).catch(() => { });
  // #endregion

  const res = await fetch(input, { ...init, headers, credentials: "include" });

  if (res.status === 401) {
    // Try refresh once (e.g. token expired)
    const newToken = await refreshAccessToken();
    if (newToken) {
      setAccessToken(newToken);
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(input, { ...init, headers, credentials: "include" });
    }
    // Refresh failed — redirect to landing page only if not already there (avoids reload loop)
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/";
    }
  }

  return res;
}

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

/** Agent-scan result (FraudReport from AI sidecar). */
export interface AgentScanReport {
  risk_level: "low" | "medium" | "high" | "critical";
  summary: string;
  anomalous_transaction_ids: string[];
  benford_suspicious: boolean;
  duplicate_groups_count: number;
  recommendations: string[];
  /** Transaction IDs flagged by graph analysis (ensemble pipeline). */
  graph_flagged_ids?: string[];
  /** One-line summary from the graph/GNN agent. */
  graph_summary?: string | null;
  /** Risk level from VLM document analysis. */
  document_risk_level?: string | null;
  /** Fraud signals from VLM document analysis. */
  document_signals?: string[];
  /** Summary from VLM document analysis. */
  document_summary?: string | null;
  /** Optional second-pass review notes from the reviewer agent. */
  review_notes?: string | null;
  /** Scan duration in milliseconds (real-time latency). */
  duration_ms?: number;
  /** Transaction IDs flagged by behavioral velocity (24h spike vs 30d baseline). */
  velocity_flagged_ids?: string[];
  /** One-line summary from velocity analysis. */
  velocity_summary?: string | null;
  /** Transaction IDs flagged by GNN (2-layer GCN) on transaction graph. */
  gnn_flagged_ids?: string[];
  /** One-line summary from GNN analysis. */
  gnn_summary?: string | null;
  /** Transaction IDs flagged by BiLSTM sequence (temporal) analysis. */
  sequence_flagged_ids?: string[];
  /** One-line summary from sequence analysis. */
  sequence_summary?: string | null;
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

/** GET cached fraud scan (used on page load; does not re-run scan). */
export async function fetchCachedFraudScan(): Promise<FraudScanResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/scan`);
  if (!res.ok) throw new Error(`Fraud scan failed: ${res.status}`);
  return res.json();
}

/** Scan all transactions or a specific list for fraud (POST; runs scan and updates cache). */
export async function scanFraud(
  transactionIds?: string[],
): Promise<FraudScanResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      transactionIds ? { transaction_ids: transactionIds } : {},
    ),
  });
  if (!res.ok) throw new Error(`Fraud scan failed: ${res.status}`);
  return res.json();
}

export async function fetchFraudReportSummary(): Promise<FraudReportSummary> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/report/summary`);
  if (!res.ok) throw new Error(`Fraud report summary failed: ${res.status}`);
  return res.json();
}

/** Run full AI fraud analysis (Railtracks pipeline) on a transaction batch. */
export async function agentScan(
  transactions: Array<{
    transaction_id: string;
    order_id?: string | null;
    customer_id?: string | null;
    amount?: number | null;
    cvv_match?: boolean | null;
    address_match?: boolean | null;
    ip_is_vpn?: boolean | null;
    card_present?: boolean | null;
    timestamp?: string | null;
  }>,
  options?: {
    /** Optional base64-encoded document (PDF/image) for VLM document fraud analysis. */
    document_base64?: string | null;
    /** MIME type of the document, e.g. application/pdf or image/jpeg. */
    mime_type?: string | null;
  },
): Promise<AgentScanReport> {
  const body: {
    transactions: typeof transactions;
    document_base64?: string;
    mime_type?: string;
  } = { transactions };
  if (options?.document_base64 && options?.mime_type) {
    body.document_base64 = options.document_base64;
    body.mime_type = options.mime_type;
  }
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/agent-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const o = err as { error?: string; detail?: string };
    throw new Error(
      o.detail || o.error || `Agent scan failed: ${res.status}`,
    );
  }
  return res.json();
}

/** Dashboard stats (transactions, volume, cash flow, top vendors). */
export interface StatsResponse {
  total_transactions: number;
  total_volume: number;
  last_scan_at: string | null;
  volume_this_month: number;
  volume_last_month: number;
  top_vendors: { name: string; volume: number; transaction_count: number }[];
}

/** GET /api/stats — key metrics for Overview. */
export async function fetchStats(): Promise<StatsResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/stats`);
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
  return res.json();
}

/** Fetch all transactions from the database (optionally with limit for agent scan to get full set). */
export async function fetchTransactions(options?: { limit?: number }): Promise<Transaction[]> {
  const params = options?.limit != null ? `?limit=${Math.min(options.limit, 500)}` : "";
  const res = await apiFetch(`${BACKEND_URL}/api/transactions${params}`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return res.json();
}

/** Load demo transactions from scripts/demo/transactions_agent_scan_demo.csv into the DB. */
export async function seedDemoTransactions(): Promise<{ loaded: number; path?: string }> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/seed-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `Seed demo failed: ${res.status}`);
  }
  return res.json();
}

// ── Benford's Law ─────────────────────────────────────────────────────────────

export interface DigitAnalysis {
  digit: number;
  expected_pct: number;
  observed_pct: number;
  deviation: number;
  flagged: boolean;
}

export interface BenfordResponse {
  sufficient_data: boolean;
  total_transactions: number;
  chi_square: number | null;
  is_suspicious: boolean | null;
  digit_analysis: DigitAnalysis[];
  flagged_digits: number[];
  ai_explanation: string | null;
}

export async function fetchBenford(): Promise<BenfordResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/benford`);
  if (!res.ok) throw new Error(`Benford analysis failed: ${res.status}`);
  return res.json();
}

// ── Duplicate Invoice Detection ───────────────────────────────────────────────

export interface DuplicateGroup {
  type: string;
  customer_id: string | null;
  amount: number | null;
  date: string | null;
  order_id: string | null;
  transaction_ids: string[];
  count: number;
}

export interface DuplicatesResponse {
  total_duplicate_groups: number;
  duplicate_groups: DuplicateGroup[];
  ai_explanation: string | null;
}

export async function fetchDuplicates(): Promise<DuplicatesResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/duplicates`);
  if (!res.ok) throw new Error(`Duplicate detection failed: ${res.status}`);
  return res.json();
}

// ── Document Fraud Analysis ───────────────────────────────────────────────────

export interface DocumentFraudResponse {
  document_type: string;
  risk_level: string;
  risk_score: number;
  fraud_signals: string[];
  legitimate_indicators: string[];
  summary: string;
  recommended_action: string;
}

export async function analyzeDocument(
  file: File,
): Promise<DocumentFraudResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/document`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Document analysis failed: ${res.status}`);
  return res.json();
}

// ── Ingestion Pipeline ────────────────────────────────────────────────────────

export type PipelineOutcome =
  | "clean"
  | "fraud_report_saved"
  | "deep_review_and_report_saved";

export interface PipelineResult {
  transaction_id: string;
  customer_name: string | null;
  amount: number | null;
  timestamp: string | null;
  risk_score: number;
  outcome: PipelineOutcome;
  triggered_rules: string[];
  ai_review_notes: string | null;
  vision_summary: string | null;
}

export interface PipelineResponse {
  source_type: string;
  transactions_processed: number;
  results: PipelineResult[];
}

export async function ingestPipeline(file: File): Promise<PipelineResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/pipeline`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Pipeline ingestion failed: ${res.status}`);
  return res.json();
}

// ── Fraud Report Submission ───────────────────────────────────────────────────

export interface FraudReportRequest {
  transaction_id: string;
  confirmed_fraud: boolean;
  reported_by?: string;
  notes?: string;
}

export interface FraudReportResponse {
  success: boolean;
  transaction_id: string;
  message: string;
}

export async function submitFraudReport(
  data: FraudReportRequest,
): Promise<FraudReportResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Fraud report submission failed: ${res.status}`);
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
  geo_risk_score: number | null;
  geo_risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  geo_briefing: string | null;
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

export async function scanSanctions(file: File): Promise<SanctionsResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${BACKEND_URL}/api/sanctions/scan`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sanctions scan failed: ${res.status} — ${err}`);
  }
  return res.json();
}

// ── Geopolitical Risk ─────────────────────────────────────────────────────────

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

export async function analyzeGeoRisk(countries: string[]): Promise<GeoRiskResponse> {
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/georisk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countries }),
  });
  if (!res.ok) throw new Error(`Geo risk analysis failed: ${res.status}`);
  return res.json();
}

export async function scanAnomalies(file: File): Promise<AnomaliesResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${BACKEND_URL}/api/fraud/pipeline`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anomaly scan failed: ${res.status}${detail ? ` — ${detail}` : ""}`);
  }
  const pipeline: PipelineResponse = await res.json();

  const mapped: AnomalyResult[] = pipeline.results.map((r, i) => ({
    row_index: i,
    date: r.timestamp ?? new Date().toISOString().split("T")[0],
    vendor: r.customer_name ?? r.transaction_id,
    amount: r.amount ?? 0,
    anomaly_score: Math.min(1, r.risk_score / 100),
    risk_level:
      r.risk_score >= 70 ? "HIGH" : r.risk_score >= 40 ? "MEDIUM" : "LOW",
    reasons: r.triggered_rules,
    ai_explanation: r.ai_review_notes ?? r.vision_summary ?? "",
  }));

  return {
    scan_id: crypto.randomUUID(),
    total_transactions: pipeline.transactions_processed,
    flagged: pipeline.results.filter((r) => r.outcome !== "clean").length,
    results: mapped,
  };
}

// ── Saved CSV data (before/after scan) ───────────────────────────────────────

export interface SaveCsvRequest {
  name?: string;
  stage: "before_scan" | "after_scan";
  file_name?: string;
  headers: string[];
  rows: Record<string, string>[];
  scan_id?: string;
  scan_summary?: { total_transactions: number; flagged: number };
  scan_results?: AnomalyResult[];
}

export interface SavedCsvData {
  id: string;
  name: string | null;
  stage: string;
  file_name: string | null;
  headers: unknown;
  rows: unknown;
  scan_id: string | null;
  scan_summary: unknown;
  scan_results: unknown;
  created_at: string;
}

export async function saveCsvData(
  data: SaveCsvRequest,
): Promise<SavedCsvData> {
  const res = await apiFetch(`${BACKEND_URL}/api/csv-saves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Save failed: ${res.status}${err ? ` — ${err}` : ""}`);
  }
  return res.json();
}

export async function fetchSavedCsvList(): Promise<SavedCsvData[]> {
  const res = await apiFetch(`${BACKEND_URL}/api/csv-saves`);
  if (!res.ok) throw new Error(`Failed to fetch saved CSV list: ${res.status}`);
  return res.json();
}

export async function deleteSavedCsv(id: string): Promise<void> {
  const res = await apiFetch(`${BACKEND_URL}/api/csv-saves/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Delete failed: ${res.status}${err ? ` — ${err}` : ""}`);
  }
}

// ── Saved entity lists (Geo & Sanctions) ─────────────────────────────────────

export interface EntityRow {
  description: string;
  country: string;
}

export interface SaveEntityRequest {
  name?: string;
  entities: EntityRow[];
  sanctions_results?: SanctionsResponse | null;
  geo_results?: GeoRiskResponse | null;
}

export interface SavedEntityData {
  id: string;
  name: string | null;
  entities: unknown;
  sanctions_results: unknown;
  geo_results: unknown;
  created_at: string;
}

export async function saveEntityList(
  data: SaveEntityRequest,
): Promise<SavedEntityData> {
  const res = await apiFetch(`${BACKEND_URL}/api/entity-saves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Save failed: ${res.status}${err ? ` — ${err}` : ""}`);
  }
  return res.json();
}

export async function fetchSavedEntityList(): Promise<SavedEntityData[]> {
  const res = await apiFetch(`${BACKEND_URL}/api/entity-saves`);
  if (!res.ok) throw new Error(`Failed to fetch saved entity list: ${res.status}`);
  return res.json();
}

export async function deleteSavedEntity(id: string): Promise<void> {
  const res = await apiFetch(`${BACKEND_URL}/api/entity-saves/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Delete failed: ${res.status}${err ? ` — ${err}` : ""}`);
  }
}

