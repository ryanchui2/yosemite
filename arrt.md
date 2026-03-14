# ShieldAI — GenAI Genesis 2026 (FINAL PLAN)

> **Compliance intelligence for small businesses.** Sanctions screening, transaction anomaly detection, and geopolitical risk monitoring — powered by AI, built for the businesses that can't afford a compliance department.

---

## Tech Stack (Updated)

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind | Fast to build, you know it cold |
| **Backend** | Rust (Axum) | Performance flex, impressive to judges, strong type safety |
| **Database** | Render (hosted Postgres) | Reliable hosted Postgres, easy env var config |
| **ML/Anomaly** | Python micro-service OR Rust `smartcore` crate | Isolation Forest for anomaly detection |
| **Fuzzy Matching** | `strsim` crate (Rust) | Jaro-Winkler / Levenshtein for sanctions name matching |
| **AI Explanations** | Gemini API (Google AI Studio, free tier) | 15 RPM free, 1M tokens/day |
| **Sanctions Data** | OpenSanctions (`default` dataset) | 300K+ sanctioned entities, free download |
| **Conflict Data** | UCDP API (Uppsala) | Free REST API, no key needed, clean JSON |
| **Deployment** | Vercel (frontend) + Railway/Shuttle (Rust backend) | Free tier, fast |

### Key Change: Rust Backend

Rust is a bold call for a hackathon. Here's how to make it work without slowing down:

**Use these crates:**
- `axum` — HTTP server (fast, ergonomic Rust web framework built on Tokio)
- `serde` / `serde_json` — JSON serialization
- `csv` — CSV parsing
- `strsim` — fuzzy string matching (Jaro-Winkler, Levenshtein)
- `reqwest` — HTTP client for Gemini API + UCDP API calls
- `tokio` — async runtime
- `sqlx` — async Postgres driver (connects to Render Postgres)
- `uuid` — scan IDs
- `chrono` — timestamps
- `smartcore` — ML (Isolation Forest) OR call a Python sidecar

**Realistic assessment:** The Rust backend person needs to be comfortable with Rust. If the team has one strong Rust dev, this works and is a huge differentiator. If nobody is confident in Rust, the Isolation Forest ML piece can be a tiny Python FastAPI sidecar that the Rust backend calls — judges won't penalize a polyglot architecture, they'll respect it.

---

## Architecture (Updated)

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js + Tailwind)         │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Sanctions │  │   Anomaly    │  │  Geopolitical     │ │
│  │ Screener  │  │  Detector    │  │  Monitor (stretch)│ │
│  └─────┬─────┘  └──────┬───────┘  └────────┬──────────┘ │
│        │               │                   │            │
│  ┌─────┴───────────────┴───────────────────┴──────────┐ │
│  │     Dashboard Shell (upload, summary, PDF export)   │ │
│  └─────────────────────┬───────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │ REST API
┌─────────────────────────┼───────────────────────────────┐
│                  RUST BACKEND (Axum)                     │
│                                                         │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────┐ │
│  │ /api/sanctions│ │ /api/anomalies│ │ /api/georisk   │ │
│  │  POST upload  │ │  POST upload  │ │ POST analyze   │ │
│  └──────┬───────┘ └───────┬───────┘ └───────┬────────┘ │
│         │                 │                  │          │
│  ┌──────┴─────┐   ┌──────┴───────┐  ┌──────┴───────┐  │
│  │ strsim     │   │ smartcore OR │  │ UCDP API     │  │
│  │ fuzzy match│   │ Python sidecar│  │ client       │  │
│  └────────────┘   └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │    Gemini API Client (reqwest → ai.google.dev)      │ │
│  │    Generates plain-English explanations for all flags│ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│                    ┌─────┴─────┐                         │
│                    │  Render   │                         │
│                    │ Postgres  │                         │
│                    │           │                         │
│                    └───────────┘                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Sources (Updated)

| Source | What | Access | Setup Time |
|--------|------|--------|-----------|
| **OpenSanctions** | 300K+ sanctioned entities (OFAC, EU, UN, UK, AU) | Download JSON from opensanctions.org/datasets — use `default` dataset | 2 min download, load into memory or at startup |
| **UCDP** | Georeferenced conflict events, state-based violence, fatalities | REST API: `https://ucdpapi.pcr.uu.se/api/` — free, no key, returns JSON | Zero setup, query on the fly |
| **Gemini** | AI-generated risk explanations | API key from ai.google.dev (free tier: 15 RPM) | 1 min to get key |
| **Render Postgres** | Hosted Postgres DB | Use connection string from Render dashboard | Set DATABASE_URL env var |

---

## Team Roles (Updated for Rust + Render Postgres)

### Person 1 — Frontend Lead (You)

Owns the entire Next.js frontend + backend API integration.

| Block | Hours | Deliverable |
|-------|-------|-------------|
| Setup | 0–2 | Next.js scaffold + Tailwind + tab layout (3 tabs) |
| Module 1 UI | 2–5 | Sanctions tab: CSV drag-drop upload → trigger backend scan → results table with risk badges + expandable AI explanation cards |
| Module 2 UI | 5–8 | Anomaly tab: transaction CSV upload → results table with anomaly scores + bar/heat visualization |
| Dashboard | 8–10 | Summary card (total scans, flags, risk level), PDF export button, header/branding |
| Integration | 10–12 | Wire all API calls to Rust backend, loading states, error handling, empty states |
| Stretch | 12–14 | Module 3 UI: country input, risk score cards, mini risk indicators |
| Polish | 14–16 | Animations, responsive, dark mode, loading skeletons |
| Demo | 16–18 | End-to-end demo flow verified, screenshot capture |

### Person 2 — Rust Backend Lead

Owns the Axum server, all API endpoints, Render Postgres integration.

| Block | Hours | Deliverable |
|-------|-------|-------------|
| Setup | 0–2 | `cargo init`, Axum scaffold, Render Postgres connection via `sqlx`, CORS middleware, folder structure |
| Sanctions Engine | 2–6 | OpenSanctions JSON loader → in-memory HashMap, `strsim` Jaro-Winkler fuzzy matching, `/api/sanctions` endpoint (accept CSV, parse with `csv` crate, match, return JSON) |
| Anomaly Engine | 6–10 | Feature engineering in Rust OR Python sidecar for Isolation Forest, `/api/anomalies` endpoint |
| DB Models | 10–12 | `sqlx` migrations: scans table, flagged_entities table, flagged_transactions table |
| API Polish | 12–14 | Input validation, proper error types, rate limiting on Gemini calls |
| Stretch | 14–16 | `/api/georisk` endpoint: UCDP API client via `reqwest`, risk scoring |
| Deploy | 16–18 | Deploy to Railway or Shuttle.rs, env vars, final testing |

### Person 3 — ML / AI / Data Engineer

Owns anomaly detection model, ALL Gemini prompt engineering, sample data generation.

| Block | Hours | Deliverable |
|-------|-------|-------------|
| Data Prep | 0–2 | Download OpenSanctions `default` dataset, generate sample vendor CSV (200 entities, 5–10 planted sanctioned names) + transaction CSV (1000 rows, planted anomalies) with Python Faker |
| Anomaly Model | 2–6 | Python script or Rust `smartcore`: Isolation Forest pipeline — feature engineering (amount stats, frequency, vendor patterns) → model → anomaly scores. If Python: wrap in tiny FastAPI sidecar the Rust backend calls |
| Gemini Prompts | 6–10 | Write + test all 3 prompt templates: sanctions explanation, anomaly explanation, geopolitical briefing. Iterate until outputs are crisp and specific |
| AI Service | 10–12 | Help P2 build the Gemini API client in Rust (`reqwest` POST to `generativelanguage.googleapis.com`), structured prompt formatting, response parsing |
| UCDP Integration | 12–14 | UCDP API client: query conflict events by country, parse JSON, compute composite risk score (event count + fatalities + intensity weighted) |
| Demo Data | 14–16 | Craft the perfect demo CSVs that produce impressive, realistic results. Test full pipeline |
| Polish | 16–18 | Final prompt tuning, help with demo prep |

### Person 4 — DevOps / Integration / Pitch

Owns deployment, PDF export, Devpost, demo video, pitch.

| Block | Hours | Deliverable |
|-------|-------|-------------|
| Setup | 0–3 | GitHub repo + branch strategy, Render Postgres setup, `.env.example`, README |
| Infra | 3–6 | Get Gemini API key, help P2 with Render Postgres connection, test OpenSanctions data loading |
| Deploy v1 | 6–9 | Vercel deploy for frontend, Railway/Shuttle for Rust backend, DATABASE_URL in env vars |
| PDF Export | 9–12 | Build PDF compliance report generator (frontend-side with `jsPDF` or `@react-pdf/renderer`) |
| Integration Test | 12–14 | Full end-to-end flow on deployed URLs, fix any issues |
| Devpost | 14–16 | Write Devpost page, take screenshots, record 2-min demo video |
| Pitch | 16–18 | 5-slide pitch deck, rehearse 3-min demo, backup plans ready |

---

## 36-Hour Timeline

### Phase 1: Foundation (Hours 0–6) — TONIGHT

```
HOUR 0-1  ★ EVERYONE DOES THIS SIMULTANEOUSLY ★
├── P1:  npx create-next-app + Tailwind
├── P2:  cargo init + axum + sqlx + strsim + reqwest in Cargo.toml
├── P3:  Download OpenSanctions default.json + start Faker script
├── P4:  GitHub repo + Render Postgres + .env files
└── ALL:  Get Gemini API key (one person, share with team)

HOUR 1-3
├── P1:  Tab layout + FileUpload component + ResultsTable (dummy data)
├── P2:  Axum server running + /health endpoint + Render Postgres connected
├── P3:  Sample CSVs generated (vendors + transactions with planted flags)
├── P4:  Docker/local dev working for everyone, help P2 with setup
└── ★ SYNC @ Hour 3: Everyone can run frontend + backend locally ★

HOUR 3-6
├── P1:  Sanctions tab UI complete (upload → loading → results table → AI cards)
├── P2:  OpenSanctions loaded into memory + /api/sanctions endpoint returning matches
├── P3:  Isolation Forest pipeline v1 working on sample data
├── P4:  First Vercel + Railway deploy attempt
└── ★ MILESTONE: Upload a CSV → get fuzzy match results back ★
```

### Phase 2: Core Features (Hours 6–12) — OVERNIGHT

```
HOUR 6-9
├── P1:  Anomaly tab UI + risk visualization (score bars/indicators)
├── P2:  /api/anomalies endpoint integrated with P3's model
├── P3:  Gemini prompt templates written + tested for sanctions + anomalies
├── P4:  Deployment live on public URLs
└── ★ SYNC @ Hour 9: Both modules returning real data + AI explanations ★

HOUR 9-12
├── P1:  Dashboard summary card + wire all real API calls (replace dummy data)
├── P2:  DB persistence (save scan results to Render Postgres) + error handling
├── P3:  Gemini client in Rust working + prompt quality iteration
├── P4:  PDF export working + integration testing on deployed version
└── ★ MILESTONE: Both core modules fully working end-to-end ★
```

### 😴 SLEEP BREAK — Hours 12–15 (3 hours)

Seriously. Sleep. You will write buggy code and make bad decisions without it. Set alarms.

### Phase 3: Stretch + Polish (Hours 15–21) — SATURDAY

```
HOUR 15-18
├── P1:  Module 3 UI (stretch) OR polish animations/responsive/dark mode
├── P2:  /api/georisk endpoint (stretch) OR harden existing endpoints
├── P3:  UCDP API client + risk scorer (stretch) OR perfect demo data
├── P4:  Devpost draft + screenshots started
└── DECISION @ Hour 15: "Are both core modules solid?" → Yes = build M3, No = polish

HOUR 18-21
├── P1:  Final UI polish, every edge case handled (empty state, error, loading)
├── P2:  Final deploy, all endpoints tested on production URLs
├── P3:  Demo data finalized — produces impressive output every time
├── P4:  Demo video recorded, Devpost complete, pitch rehearsed
└── ★ MILESTONE: SUBMISSION READY ★
```

### Phase 4: Buffer (Hours 21–24+)

```
├── Fix any last-minute bugs
├── Re-record demo video if needed
├── Submit to Devpost
├── Rehearse pitch one more time
└── ★ DONE ★
```

---

## API Contract (Lock this in at Hour 0)

```rust
// POST /api/sanctions
// Content-Type: multipart/form-data (CSV file)
// Response 200:
{
  "scan_id": "uuid",
  "total_entities": 150,
  "flagged": 7,
  "results": [
    {
      "uploaded_name": "Acme Trading Ltd",
      "matched_name": "ACME Trading Limited",
      "confidence": 92,
      "risk_level": "HIGH",
      "sanctions_list": "OFAC SDN",
      "reason": "Narcotics trafficking",
      "ai_explanation": "This entity closely matches...",
      "action": "Do not transact — verify identity immediately"
    }
  ]
}

// POST /api/anomalies
// Content-Type: multipart/form-data (CSV file)
// Response 200:
{
  "scan_id": "uuid",
  "total_transactions": 1200,
  "flagged": 23,
  "results": [
    {
      "row_index": 847,
      "date": "2024-03-15",
      "vendor": "Unknown Supplier Co",
      "amount": 47500.00,
      "anomaly_score": 0.92,
      "risk_level": "HIGH",
      "reasons": ["4.7x above vendor avg", "first transaction with vendor"],
      "ai_explanation": "This transaction stands out because..."
    }
  ]
}

// POST /api/georisk  (STRETCH)
// Body: { "countries": ["Myanmar", "Nigeria", "Turkey"] }
// Response 200:
{
  "results": [
    {
      "country": "Myanmar",
      "risk_score": 87,
      "risk_level": "CRITICAL",
      "conflict_events_90d": 342,
      "fatalities_90d": 891,
      "ai_briefing": "Myanmar continues to experience..."
    }
  ]
}
```

**Frontend calls these endpoints. Backend returns these shapes. No deviation. Lock it in.**

---

## Database Setup — Render Postgres (Person 4 does this at Hour 0)

1. Create a Postgres database on render.com
2. Copy the external connection string from the Render dashboard
3. Set `DATABASE_URL` in `backend/arrt/.env`
4. Run these SQL migrations:

```sql
-- Scan history
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type TEXT NOT NULL CHECK (scan_type IN ('sanctions', 'anomalies', 'georisk')),
  file_name TEXT,
  total_records INT,
  flagged_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flagged entities (sanctions)
CREATE TABLE flagged_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id),
  uploaded_name TEXT NOT NULL,
  matched_name TEXT,
  confidence INT,
  risk_level TEXT CHECK (risk_level IN ('HIGH', 'MEDIUM', 'LOW')),
  sanctions_list TEXT,
  reason TEXT,
  ai_explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flagged transactions (anomalies)
CREATE TABLE flagged_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id),
  row_index INT,
  transaction_date DATE,
  vendor TEXT,
  amount NUMERIC(12,2),
  anomaly_score NUMERIC(5,4),
  risk_level TEXT CHECK (risk_level IN ('HIGH', 'MEDIUM', 'LOW')),
  reasons TEXT[],
  ai_explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Gemini API Call Pattern (Rust)

```rust
use reqwest::Client;
use serde_json::json;

async fn call_gemini(prompt: &str, api_key: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );
    
    let body = json!({
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    });
    
    let resp = client.post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;
    
    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No explanation available")
        .to_string();
    
    Ok(text)
}
```

---

## UCDP API Query Pattern

```
GET https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=100&Country=Myanmar
```

Returns JSON with `Result` array containing:
- `date_start`, `date_end`
- `country`, `region`
- `type_of_violence` (1=state-based, 2=non-state, 3=one-sided)
- `deaths_a`, `deaths_b`, `deaths_civilians`, `best` (best estimate total deaths)
- `latitude`, `longitude`

Composite risk score formula:
```
risk = 0.4 * normalize(event_count) + 0.4 * normalize(fatalities) + 0.2 * normalize(violence_type_diversity)
```

---

## Risk Mitigation (Updated)

| Risk | Mitigation |
|------|-----------|
| Rust compilation too slow during iteration | Use `cargo watch -x run` for hot reload. Pre-write struct definitions at Hour 0 so the type system helps instead of fights |
| `smartcore` Isolation Forest too painful in Rust | Fallback: tiny Python FastAPI sidecar (~30 lines) that wraps scikit-learn. Rust backend calls it via HTTP. Polyglot architecture is fine |
| Render Postgres connection issues | Fallback: SQLite file locally, deploy with the file. `sqlx` works identically with either |
| Gemini rate limit hit during demo | Pre-cache explanations for demo data in DB. Serve cached responses during live demo |
| OpenSanctions dataset too large for memory | Filter to top-5 lists (OFAC, EU, UN, UK, AU) — reduces to ~50K entities |
| UCDP API slow or down | Pre-fetch data for demo countries at build time, cache in DB |
| Team member burns out | 3-hour sleep break is mandatory between Phase 2 and 3 |

---

## File Structure

```
shieldai/
├── README.md
├── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── FileUpload.tsx
│   │   ├── ResultsTable.tsx
│   │   ├── RiskBadge.tsx
│   │   ├── AIExplanationCard.tsx
│   │   ├── RiskSummary.tsx
│   │   └── PDFExport.tsx
│   ├── lib/
│   │   └── api.ts
│   ├── package.json
│   └── tailwind.config.ts
├── backend/
│   ├── arrt/
│   │   ├── Cargo.toml
│   │   ├── Cargo.lock
│   │   └── src/
│   │       ├── main.rs
│   │       ├── routes/
│   │       │   ├── mod.rs
│   │       │   ├── sanctions.rs
│   │       │   ├── anomalies.rs
│   │       │   └── georisk.rs
│   │       ├── services/
│   │       │   ├── mod.rs
│   │       │   ├── sanctions_matcher.rs
│   │       │   ├── anomaly_detector.rs
│   │       │   ├── gemini_client.rs
│   │       │   ├── ucdp_client.rs
│   │       │   └── risk_scorer.rs
│   │       ├── models/
│   │       │   ├── mod.rs
│   │       │   └── schemas.rs
│   │       └── data/
│   │           └── (OpenSanctions JSON goes here)
│   └── .env
├── ml-sidecar/               # ONLY if Rust ML is too painful
│   ├── main.py               # FastAPI, ~50 lines
│   ├── requirements.txt
│   └── model.py              # Isolation Forest
├── scripts/
│   └── generate_demo_data.py
└── docs/
    └── PROJECT_PLAN.md
```
