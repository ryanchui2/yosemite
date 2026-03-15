const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

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
export async function scanFraud(
  transactionIds?: string[],
): Promise<FraudScanResponse> {
  const res = await fetch(`${BACKEND_URL}/api/fraud/scan`, {
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
  const res = await fetch(`${BACKEND_URL}/api/fraud/benford`);
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
  const res = await fetch(`${BACKEND_URL}/api/fraud/duplicates`);
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
  const res = await fetch(`${BACKEND_URL}/api/fraud/document`, {
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
  const res = await fetch(`${BACKEND_URL}/api/fraud/pipeline`, {
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
  const res = await fetch(`${BACKEND_URL}/api/fraud/report`, {
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
  const res = await fetch(`${BACKEND_URL}/api/sanctions/scan`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sanctions scan failed: ${res.status} — ${err}`);
  }
  return res.json();
}

export async function scanAnomalies(file: File): Promise<AnomaliesResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BACKEND_URL}/api/fraud/pipeline`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Anomaly scan failed: ${res.status}`);
  const pipeline: PipelineResponse = await res.json();

  const mapped: AnomalyResult[] = pipeline.results.map((r, i) => ({
    row_index: i,
    date: r.timestamp ?? new Date().toISOString().split("T")[0],
    vendor: r.customer_name ?? r.transaction_id,
    amount: r.amount ?? 0,
    anomaly_score: r.risk_score / 100,
    risk_level:
      r.risk_score >= 70 ? "HIGH" : r.risk_score >= 40 ? "MEDIUM" : "LOW",
    reasons: r.triggered_rules,
    ai_explanation: r.ai_review_notes ?? "",
  }));

  return {
    scan_id: crypto.randomUUID(),
    total_transactions: pipeline.transactions_processed,
    flagged: pipeline.results.filter((r) => r.outcome !== "clean").length,
    results: mapped,
  };
}

