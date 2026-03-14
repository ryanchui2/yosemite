# Fraud Pipeline Data Flow

This document outlines the data flow and the Rust types used at each stage of the ingestion process within `routes/pipeline.rs`.

## 1. Request Ingestion

**Endpoint:** `POST /api/fraud/pipeline`
**Input Type:** `axum::extract::Multipart`

The client uploads a file. The file is read into memory.
- `file_bytes` : `Vec<u8>`
- `mime_type` : `String`

## 2. Normalization to Transaction Input

Depending on the `mime_type`, the file is parsed into a flat, option-heavy representation of a transaction.

**Target Type:** `Result<Vec<TransactionInput>, Error>`

```rust
pub struct TransactionInput {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    // ...other fields
}
```

- **CSV (`text/csv`)**: Processed directly via the `csv` crate.
- **PDF/Image (`application/pdf`, `image/*`)**: Processed via Gemini using `ai_parser::parse_document_to_csv()`.
  - *Simultaneously*, `gemini_vision::analyze_document()` is run to get a `DocumentFraudResponse` whose summary is appended later.
- **Other text** (e.g., email): Processed via Gemini using `ai_parser::parse_document_to_csv()`.

## 3. Conversion to Scoreable Type

Each parsed row is converted into the strict database model for scoring.

**Input Type:** `TransactionInput`
**Output Type:** `Transaction`

```rust
pub struct Transaction {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    // ...other fields align with DB schema
}
```

## 4. Algorithmic Scoring

The structured `Transaction` is passed to the rules engine.

**Function:** `fraud_rules::score(&Transaction)`
**Return Type:** `(u32, Vec<String>)`
- `u32`: The numerical risk score (0-100+)
- `Vec<String>`: The specific text rules that were triggered (e.g., "CVV mismatch", "VPN or proxy detected")

## 5. Score Routing and AI Deep Review

The score dictates the required action and whether a fraud report is generated.

- **Clean (Score < 20)**
  - No database action.
  - Generates: `PipelineOutcome::Clean`

- **High-Risk Fraud (Score > 70)**
  - Immediately persists to `fraud_reports` table (with `ai_reviewed=false`).
  - Generates: `PipelineOutcome::FraudReportSaved`

- **Ambiguous (Score 20-70)**
  - Passes triggered rules and score to `llm::explain_fraud()` for deep analysis.
  - Returns `ai_notes: String`.
  - Persists to `fraud_reports` table (with `ai_reviewed=true` and `ai_review_notes=ai_notes`).
  - Generates: `PipelineOutcome::DeepReviewAndReportSaved`

## 6. Output Construction

The results for all grouped transactions are assembled into the API response.

**Output Type:** `PipelineResponse`

```rust
pub struct PipelineResponse {
    pub source_type: String, // "csv", "pdf", or "document"
    pub transactions_processed: usize,
    pub results: Vec<PipelineResult>,
}

pub struct PipelineResult {
    pub transaction_id: String,
    pub risk_score: u32,
    pub outcome: PipelineOutcome, // Clean | FraudReportSaved | DeepReviewAndReportSaved
    pub triggered_rules: Vec<String>,
    pub ai_review_notes: Option<String>, // Present only on deep reviews
    pub vision_summary: Option<String>, // Present for PDFs
}
```
