# Backend Person 2 — Fraud Scan Endpoint

## Your job

Build `POST /api/fraud/scan` — takes transaction IDs, runs fraud scoring, returns flagged results with risk levels.

Depends on: **Backend Person 1** finishing the Render Postgres connection + `AppState`.

---

## Step 1 — Add `reqwest` to `Cargo.toml` (for Gemini calls)

```toml
reqwest = { version = "0.12", features = ["json"] }
```

---

## Step 2 — Create `src/models/fraud.rs`

Request and response shapes for the fraud scan endpoint. Also contains a stub `Transaction` (used until `models::transaction::Transaction` is wired in):

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// Stub — swap for models::transaction::Transaction once Backend 1 is done.
// Only the fields used by scoring logic are needed here.
#[derive(FromRow)]
pub struct Transaction {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    pub avs_result: Option<String>,
    pub address_match: Option<bool>,
    pub ip_is_vpn: Option<bool>,
    pub card_present: Option<bool>,
    pub entry_mode: Option<String>,
    pub refund_status: Option<String>,
}

#[derive(Deserialize)]
pub struct ScanRequest {
    /// Pass specific IDs, or leave empty to scan all
    pub transaction_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct FraudResult {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub risk_score: u32,
    pub risk_level: String, // "HIGH", "MEDIUM", "LOW"
    pub triggered_rules: Vec<String>,
    pub ai_explanation: Option<String>,
}

#[derive(Serialize)]
pub struct ScanResponse {
    pub total_scanned: usize,
    pub flagged: usize,
    pub results: Vec<FraudResult>,
}
```

---

## Step 3 — Create `src/routes/fraud.rs`

The scoring logic is inlined here (mirroring `services::fraud_rules::score`). Risk classification delegates to `fraud_rules::risk_level()`.

```rust
use axum::{extract::State, Json};

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse, Transaction};
use crate::services::{fraud_rules, gemini};
use crate::state::AppState;

fn score_transaction(tx: &Transaction) -> (u32, Vec<String>) {
    let mut score: u32 = 0;
    let mut rules: Vec<String> = Vec::new();

    if tx.cvv_match == Some(false) {
        score += 35;
        rules.push("CVV mismatch".to_string());
    }

    if let Some(ref avs) = tx.avs_result {
        if avs.to_lowercase().contains("no match") || avs.to_lowercase() == "n" {
            score += 25;
            rules.push("AVS address verification failed".to_string());
        }
    }

    if tx.address_match == Some(false) {
        score += 20;
        rules.push("Billing and shipping address mismatch".to_string());
    }

    if tx.ip_is_vpn == Some(true) {
        score += 30;
        rules.push("VPN or proxy detected".to_string());
    }

    if tx.card_present == Some(false) {
        if let Some(ref mode) = tx.entry_mode {
            if mode.to_lowercase().contains("key") {
                score += 20;
                rules.push("Card not present + manually keyed entry".to_string());
            }
        }
    }

    if let Some(ref refund) = tx.refund_status {
        if refund.to_lowercase().contains("requested") || refund.to_lowercase().contains("completed") {
            score += 15;
            rules.push(format!("Refund status: {}", refund));
        }
    }

    if let Some(amt) = tx.amount {
        if amt > 5000.0 {
            score += 15;
            rules.push(format!("High transaction amount: ${:.2}", amt));
        }
    }

    (score, rules)
}

pub async fn scan(
    State(state): State<AppState>,
    Json(payload): Json<ScanRequest>,
) -> Json<ScanResponse> {
    let transactions: Vec<Transaction> = if let Some(ids) = &payload.transaction_ids {
        sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions WHERE transaction_id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
    };

    let total_scanned = transactions.len();
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in transactions {
        let (risk_score, triggered_rules) = score_transaction(&tx);
        if risk_score == 0 {
            continue;
        }

        let risk_level = fraud_rules::risk_level(risk_score).to_string();

        let ai_explanation = gemini::explain_fraud(&triggered_rules, &tx.transaction_id, risk_score)
            .await
            .ok();

        results.push(FraudResult {
            transaction_id: tx.transaction_id,
            customer_name: tx.customer_name,
            amount: tx.amount,
            risk_score,
            risk_level,
            triggered_rules,
            ai_explanation,
        });
    }

    results.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    let flagged = results.len();

    Json(ScanResponse {
        total_scanned,
        flagged,
        results,
    })
}
```

---

## Step 4 — Register routes in `main.rs`

Coordinate with Backend Person 1. The router already has both routes:

```rust
.route("/api/transactions", get(routes::transactions::list))
.route("/api/fraud/scan", post(routes::fraud::scan))
```

---

## Done when

```bash
curl -X POST http://localhost:3001/api/fraud/scan \
  -H "Content-Type: application/json" \
  -d '{}'
```

Returns a `ScanResponse` JSON with flagged transactions, risk scores, triggered rules, and AI explanations.
