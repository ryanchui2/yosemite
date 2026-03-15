# Railtracks — Verifying the Invoice Fraud Agent Pipeline

## What you're verifying

The `ai/invoice_fraud/` module contains two Railtracks agent pipelines:

```
fraud_analyst          (single agent)
  ├── run_anomaly_scoring    — Isolation Forest on the full batch
  ├── run_benford_analysis   — chi-squared test on amounts
  └── run_duplicate_detection — group-by customer + amount + date / order_id

fraud_coordinator      (multi-agent)
  ├── AnomalyAgent    → run_anomaly_scoring
  ├── BenfordAgent    → run_benford_analysis
  └── DuplicateAgent  → run_duplicate_detection
```

Both return a structured `FraudReport` Pydantic object with `risk_level`, `summary`, `anomalous_transaction_ids`, `benford_suspicious`, `duplicate_groups_count`, and `recommendations`.

---

## Prerequisites

1. Python 3.11+ and the `ai/` venv set up:

```bash
cd ai
./run_local.sh   # creates .venv and installs requirements, then starts uvicorn
# Ctrl-C once the server is up — you just needed the venv
```

Or create it manually:

```bash
cd ai
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -q
```

2. `railtracks` and `railtracks-cli` installed in the venv:

```bash
.venv/bin/pip install railtracks railtracks-cli
```

3. `GEMINI_API_KEY` available — either exported in your shell or added to `ai/.env`:

```bash
# Option A — shell export (single session)
export GEMINI_API_KEY=<your-key>

# Option B — ai/.env file (persistent, loaded automatically by check_agents.py)
echo "GEMINI_API_KEY=<your-key>" > ai/.env
```

---

## Step 1 — Run `check_agents.py`

This script exercises both pipelines against a crafted batch of 11 transactions built to trigger all three fraud signals:

| Signal                         | Transactions                                | Expected result                                                     |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| Anomaly outliers               | t06, t07 ($48k–$52k + all suspicious flags) | appear in `anomalous_transaction_ids`                               |
| Duplicate order_id             | t08, t09 (both `ORD-999`)                   | `duplicate_groups_count >= 1`                                       |
| Duplicate customer+amount+date | t10, t11 (C9 / $450 / 2024-03-02)           | `duplicate_groups_count >= 1`                                       |
| Benford's Law                  | only 11 amounts (needs 50+)                 | agent reports `sufficient_data: false`, `benford_suspicious: false` |

```bash
cd ai
source .venv/bin/activate
python check_agents.py
```

### What valid output looks like

```
check_agents.py — Railtracks invoice_fraud pipeline verification
Transactions in batch : 11
Expected signals      : anomaly outliers (t06, t07) | duplicate order_id (t08, t09) | duplicate charge (t10, t11)

============================================================
SINGLE AGENT  →  fraud_analyst
============================================================
  risk_level             : high
  anomalous_tx_ids       : ['t06', 't07']
  benford_suspicious     : false
  duplicate_groups_count : 2
  summary                : Two transactions (t06, t07) scored well above the anomaly threshold ...
  recommendations:
    - Freeze transactions t06 and t07 pending manual review
    - ...
  [PASS] all FraudReport fields valid

============================================================
MULTI-AGENT   →  fraud_coordinator
============================================================
  risk_level             : high
  ...
  [PASS] all FraudReport fields valid

============================================================
ALL CHECKS PASSED
============================================================
```

The script calls `assert` on every `FraudReport` field — if any agent fails to populate a field or returns an unexpected `risk_level`, it will raise with a clear error message.

---

## Step 2 — Watch execution in the Railtracks Visualizer

Open a second terminal while `check_agents.py` runs (or re-run it) and start the visualizer:

```bash
cd ai
source .venv/bin/activate
railtracks init          # one-time — downloads the UI assets
railtracks viz --port 8002
```

Open **http://localhost:8002** in your browser.

### What to look for

**For `fraud_analyst` (single agent):**
- One root node (`FraudAnalyst`) with three tool-call children
- All three tools appear: `run_anomaly_scoring`, `run_benford_analysis`, `run_duplicate_detection`
- Each shows its input JSON and output JSON
- Timing: the three tool calls are sequential (the agent decides order)

**For `fraud_coordinator` (multi-agent):**
- Root node `FraudCoordinator` with three agent-call children: `AnomalyAgent`, `BenfordAgent`, `DuplicateAgent`
- Each specialist shows its own tool call underneath
- Coordinator's final message synthesizes all three specialist summaries into a `FraudReport`

---

## Step 3 — Backend end-to-end smoke test

Once both the Rust backend (`cargo run` in `backend/arrt`) and the Python sidecar (`./run_local.sh` in `ai/`) are running:

```bash
curl -s -X POST http://localhost:3001/api/fraud/agent-scan \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {"transaction_id":"t06","amount":48000,"cvv_match":false,"address_match":false,"ip_is_vpn":true,"card_present":false},
      {"transaction_id":"t07","amount":52500,"cvv_match":false,"address_match":false,"ip_is_vpn":true,"card_present":false},
      {"transaction_id":"t08","order_id":"ORD-999","customer_id":"C8","amount":199,"timestamp":"2024-03-01T15:00:00"},
      {"transaction_id":"t09","order_id":"ORD-999","customer_id":"C8","amount":199,"timestamp":"2024-03-01T15:05:00"},
      {"transaction_id":"t01","amount":120},
      {"transaction_id":"t02","amount":250},
      {"transaction_id":"t03","amount":90}
    ]
  }' | jq .
```

Expected: a JSON object with `risk_level`, `summary`, `anomalous_transaction_ids`, `benford_suspicious`, `duplicate_groups_count`, and `recommendations`.

---

## Done when

- `check_agents.py` prints `ALL CHECKS PASSED` with no assertion errors
- The Railtracks visualizer shows three tool calls under `fraud_analyst` and three agent delegations under `fraud_coordinator`
- `/api/fraud/agent-scan` returns a valid `FraudReport` JSON object
