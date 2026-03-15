# ShieldAI — Compliance Intelligence Platform

> **Fraud detection and compliance intelligence for small businesses.** Transaction fraud scoring, sanctions screening, anomaly detection, document analysis, and geopolitical risk monitoring — powered by AI, built for businesses that can't afford a compliance department.

---

## Tech Stack

| Layer | Technology | Notes |
| ----- | ---------- | ----- |
| **Frontend** | Next.js 19 (App Router) + TypeScript + Tailwind CSS | Single-page dashboard with report tabs |
| **Backend** | Rust (Axum 0.8) + Tokio | Port 3001, REST API |
| **Database** | Render (hosted Postgres) + SQLx | Transactions + fraud reports |
| **ML Microservice** | Python FastAPI + scikit-learn | Port 8000, Isolation Forest, Benford's Law, duplicate detection |
| **LLM** | HuggingFace endpoint (GPT-OSS-120b) | Fraud explanations, geo risk briefings, report summaries |
| **Vision AI** | Google Gemini API | Document fraud analysis (PDF/images) |
| **Sanctions Data** | OpenSanctions API (`api.opensanctions.org`) | Live search, no pre-loaded dataset |
| **Conflict Data** | UCDP API (Uppsala) | Client implemented, not actively used in scoring |
| **UI Components** | Radix UI + lucide-react | Accessible primitives |

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                 FRONTEND (Next.js 19)                    │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Single Dashboard Page (app/page.tsx)               │ │
│  │                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │ │
│  │  │ Fraud Score  │ │   Scanners   │ │   Reports   │ │ │
│  │  │ ProtScore    │ │ AnomalyUpload│ │ Anomaly Tab │ │ │
│  │  │ FlaggedTxns  │ │ SanctionsCSV│ │ Sanctions   │ │ │
│  │  │ RiskOverview │ │ GeoRisk Input│ │ GeoRisk Tab │ │ │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │ REST API (localhost:3001)
┌─────────────────────────┼───────────────────────────────┐
│               RUST BACKEND (Axum)                        │
│                                                          │
│  /api/fraud/scan        /api/sanctions/scan              │
│  /api/fraud/georisk     /api/fraud/document              │
│  /api/fraud/pipeline    /api/fraud/benford               │
│  /api/fraud/duplicates  /api/fraud/report[/summary]      │
│  /api/transactions      /api/risk/business               │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ fraud_rules │  │anomaly_svc   │  │ llm.rs         │  │
│  │ (rule-based │  │(calls Python │  │ (HuggingFace   │  │
│  │  scoring)   │  │  sidecar)    │  │  GPT-OSS)      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │open_sanction│  │gemini_vision │  │ ucdp.rs        │  │
│  │(API search) │  │(doc analysis)│  │ (conflict data)│  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                          │                               │
│                    ┌─────┴─────┐                         │
│                    │  Render   │                         │
│                    │ Postgres  │                         │
│                    └───────────┘                         │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP (localhost:8000)
┌─────────────────────────┼───────────────────────────────┐
│           PYTHON ML SIDECAR (FastAPI)                    │
│                                                          │
│  POST /score     → Isolation Forest anomaly scoring      │
│  POST /benford   → Benford's Law chi-squared analysis    │
│  POST /duplicates → Duplicate invoice detection          │
└─────────────────────────────────────────────────────────┘
```

---

## File Structure

```text
arrt/
├── arrt.md                          # This document
├── .gitignore
├── RENDER_DEPLOY.md
├── AXUM_SETUP.md
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Main dashboard (~800+ lines)
│   │   └── globals.css
│   ├── components/
│   │   ├── ProtectionScore.tsx      # SVG circular gauge (0–100)
│   │   ├── FlaggedTransactions.tsx  # Top 5 flagged txns
│   │   ├── RiskOverview.tsx         # Summary stats card
│   │   ├── ResultsTable.tsx         # Unified results table (anomaly/sanctions/geo)
│   │   ├── CSVDataTable.tsx         # Inline editable transaction table
│   │   ├── AIExplanationCard.tsx    # Expandable AI explanation
│   │   ├── RiskBadge.tsx            # HIGH/MEDIUM/LOW badge
│   │   ├── PDFExport.tsx            # Export button (skeleton only)
│   │   └── ui/                      # Radix UI primitives
│   ├── lib/
│   │   └── api.ts                   # API client + TypeScript types
│   ├── public/
│   │   └── yosemite_logo.png
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── .env                         # NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
│
├── backend/arrt/
│   ├── Cargo.toml
│   ├── .env                         # DB, API keys, service URLs
│   ├── migrations/
│   │   ├── 0001_create_transactions.sql  # Schema + 8 seed transactions
│   │   ├── 0002_add_missing_columns.sql
│   │   ├── 0003_create_fraud_reports.sql
│   │   └── 0004_add_ai_review_to_fraud_reports.sql
│   └── src/
│       ├── main.rs                  # Router setup, CORS, port 3001
│       ├── lib.rs
│       ├── state.rs                 # AppState (db pool + HTTP client)
│       ├── models/
│       │   ├── fraud.rs             # ScoringTx, FraudResult, ScanResponse, etc.
│       │   ├── sanctions.rs         # SanctionsScanResult, SanctionsScanResponse
│       │   ├── transaction.rs       # Transaction (full DB record)
│       │   ├── risk.rs              # SanctionsHit, ConflictEvent, BusinessRiskReport
│       │   └── mod.rs
│       ├── routes/
│       │   ├── mod.rs
│       │   ├── fraud.rs             # POST /api/fraud/scan
│       │   ├── fraud_report.rs      # POST/GET /api/fraud/report*
│       │   ├── sanctions.rs         # POST /api/sanctions/scan
│       │   ├── georisk.rs           # POST /api/fraud/georisk
│       │   ├── advanced.rs          # GET /api/fraud/{benford,duplicates}
│       │   ├── document.rs          # POST /api/fraud/document
│       │   ├── pipeline.rs          # POST /api/fraud/pipeline
│       │   ├── risk.rs              # POST /api/risk/business
│       │   └── transactions.rs      # GET /api/transactions
│       └── services/
│           ├── mod.rs
│           ├── fraud_rules.rs       # Rule-based scoring engine
│           ├── anomaly_service.rs   # Python sidecar client
│           ├── llm.rs               # HuggingFace GPT-OSS calls
│           ├── gemini_vision.rs     # Gemini Vision API (document analysis)
│           ├── ai_parser.rs         # Document → structured transaction CSV
│           ├── open_sanctions.rs    # OpenSanctions API client
│           └── ucdp.rs              # UCDP conflict data client
│
├── ai/                              # Python ML microservice
│   ├── main.py                      # FastAPI app (3 endpoints)
│   ├── model.py                     # Isolation Forest, Benford's Law, duplicates
│   ├── requirements.txt             # fastapi, uvicorn, scikit-learn, pandas, gunicorn
│   ├── run.sh                       # Production startup (port 8000)
│   └── run_local.sh                 # Local dev startup
│
├── scripts/
│   └── generate_demo_data.py
│
└── tasks/                           # Task tracking & design notes
    ├── ai-1.md / ai-2.md
    ├── backend-1.md / backend-2.md
    ├── fraudFeatures.md
    └── tasks2/
```

---

## API Endpoints

```text
GET  /health                          → "ok"

# Fraud Detection
POST /api/fraud/scan                  → ScanResponse
GET  /api/fraud/report/summary        → FraudReportSummaryResponse
POST /api/fraud/report                → FraudReportResponse
GET  /api/fraud/benford               → BenfordResponse
GET  /api/fraud/duplicates            → DuplicatesResponse
POST /api/fraud/document              → DocumentFraudResponse
POST /api/fraud/pipeline              → PipelineResponse
POST /api/fraud/georisk               → GeoRiskResponse

# Sanctions
POST /api/sanctions/scan              → SanctionsScanResponse

# Transactions
GET  /api/transactions                → Transaction[]

# Risk (partial)
POST /api/risk/business               → BusinessRiskReport
```

### Key Request/Response Shapes

```typescript
// POST /api/fraud/scan
// Body: { transaction_ids?: string[] }  (empty = scan all in DB)
{
  scan_id: string,
  total_transactions: number,
  flagged: number,
  results: [{
    transaction_id: string,
    customer_name: string,
    amount: number,
    risk_score: number,          // 0–255
    risk_level: "HIGH" | "MEDIUM" | "LOW",
    triggered_rules: string[],
    anomaly_score: number,       // 0.0–1.0 from Isolation Forest
    ai_explanation: string
  }]
}

// POST /api/sanctions/scan
// Content-Type: multipart/form-data (CSV file)
// CSV must have column: description | name | entity_name | company | vendor
{
  scan_id: string,
  total_entities: number,
  flagged: number,
  results: [{
    uploaded_name: string,
    matched_name: string,
    confidence: number,          // 0–100
    risk_level: "HIGH" | "MEDIUM" | "LOW",
    sanctions_list: string,
    reason: string,
    ai_explanation: string,
    action: string
  }]
}

// POST /api/fraud/georisk
// Body: { countries: string[] }
{
  results: [{
    country: string,
    risk_score: number,          // 0–100
    risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    conflict_events_90d: number,
    fatalities_90d: number,
    ai_briefing: string
  }]
}

// POST /api/fraud/document
// Content-Type: multipart/form-data (PDF or image)
{
  risk_level: "HIGH" | "MEDIUM" | "LOW",
  risk_score: number,
  fraud_signals: string[],
  legitimate_indicators: string[],
  summary: string,
  recommended_action: string
}

// POST /api/fraud/pipeline
// Content-Type: multipart/form-data (any document)
// Outcomes: "Clean" | "FraudReportSaved" | "AmbiguousReview"
// Auto-routes based on risk score: Clean < 20, Fraud > 70, Ambiguous 20–70
```

---

## Fraud Scoring Rules (`fraud_rules.rs`)

| Rule | Points |
| ---- | ------ |
| CVV mismatch | +35 |
| VPN/proxy detected | +30 |
| AVS address verification failed | +25 |
| Address mismatch | +20 |
| High-risk country (NG, RU, CN, KP, IR, VE) | +20 |
| Card not present + manually keyed | +20 |
| Round amount (structuring signal) | +15 |
| High amount (> $5,000) | +15 |
| Refund requested or completed | +15 |
| Mobile device + VPN | +15 |

**Risk Levels:** HIGH ≥ 60 · MEDIUM ≥ 30 · LOW < 30

Anomaly scores from the Python Isolation Forest are blended in separately and displayed alongside the rule-based score.

---

## Database Schema

```sql
-- Seed data: 8 sample transactions (TXN-001 to TXN-008)
CREATE TABLE transactions (
  transaction_id  TEXT PRIMARY KEY,
  customer_name   TEXT,
  amount          NUMERIC(12,2),
  cvv_match       BOOLEAN,
  avs_result      TEXT,
  address_match   BOOLEAN,
  ip_is_vpn       BOOLEAN,
  ip_country      TEXT,
  device_type     TEXT,
  card_present    BOOLEAN,
  entry_mode      TEXT,
  refund_status   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fraud_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   TEXT,
  confirmed_fraud  BOOLEAN,
  reported_by      TEXT,
  notes            TEXT,
  ai_reviewed      BOOLEAN,
  ai_review_notes  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Python ML Sidecar (`ai/`)

**Endpoints:**

- `POST /score` — Isolation Forest (5% contamination), returns `{transaction_id, anomaly_score}[]` (scores 0.0–1.0)
- `POST /benford` — Chi-squared test against Benford's Law (critical value 15.507 at df=8, p=0.05)
- `POST /duplicates` — Groups by `(customer_id, amount, date)` or `order_id`

**Stack:** FastAPI · Gunicorn + Uvicorn · scikit-learn · pandas

---

## External Services

| Service | Used For | Key |
| ------- | -------- | --- |
| Render Postgres | Data persistence | `DATABASE_URL` env var |
| HuggingFace endpoint | LLM (GPT-OSS-120b) fraud explanations + geo briefings | `HF_BASE_URL` + `HF_API_KEY` |
| Google Gemini API | Document fraud vision analysis + AI CSV parsing | `GEMINI_API_KEY` |
| OpenSanctions API | Live entity sanctions search | No key required |
| UCDP API | Conflict event data | No key required |

---

## Environment Variables

```bash
# backend/arrt/.env
DATABASE_URL=postgresql://...@render.com/...
GEMINI_API_KEY=...
HF_BASE_URL=https://...aws.endpoints.huggingface.cloud/v1
HF_API_KEY=...
RUST_LOG=info
PORT=3001                          # default
AI_SERVICE_URL=http://localhost:8000   # Python sidecar

# frontend/.env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## Feature Status

| Feature | Status | Notes |
| ------- | ------ | ----- |
| Rule-based fraud scoring | ✓ Done | 10 rules, weighted points |
| Isolation Forest anomaly detection | ✓ Done | Python sidecar |
| Benford's Law analysis | ✓ Done | Chi-squared, chi-sq test |
| Duplicate invoice detection | ✓ Done | Composite key grouping |
| Sanctions screening | ✓ Done | OpenSanctions live API search |
| Document fraud analysis | ✓ Done | Gemini Vision (PDF/image) |
| AI document → transaction parsing | ✓ Done | Gemini Vision extracts CSV |
| Universal pipeline endpoint | ✓ Done | Auto-routes by risk score |
| LLM explanations | ✓ Done | HuggingFace GPT-OSS |
| Fraud report persistence | ✓ Done | Postgres with AI review flag |
| Dashboard UI | ✓ Done | Protection score, flagged txns, risk overview |
| CSV upload + manual entry | ✓ Done | Drag-drop + inline table editor |
| Report tabs (Anomaly/Sanctions/Geo) | ✓ Done | Bottom tab panels |
| Geopolitical risk (LLM-based) | ✓ Done | Per-country risk briefing |
| Geopolitical risk (UCDP-based) | ✗ Incomplete | Client exists, not wired into scoring |
| PDF export | ✗ Skeleton | `PDFExport.tsx` exists, no library integrated |
| Business risk assessment | ✗ Skeleton | Endpoint exists, not fully featured |
| Authentication | ✗ None | Open access |
| Rate limiting | ✗ None | Relevant for Gemini/HF calls |
