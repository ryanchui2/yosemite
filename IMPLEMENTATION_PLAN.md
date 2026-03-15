# Implementation Plan — ShieldAI Hackathon Upgrades

> Follow this file top-to-bottom. Check off each step as completed. Do not skip ahead.

---

## Phase 1 — Demo Data Storytelling (1 hr)

**Goal:** Seed the database with a narrative that makes all three modules light up simultaneously during the demo.

### Step 1.1 — Create the demo narrative entities ✅

**Backend done:** `backend/arrt/migrations/0005_seed_demo_narrative.sql`
Run this migration against the DB to seed demo data. All 6 transactions use columns already defined in migration 0002.

**UI notes for later:**

- The dashboard auto-fetches fraud scan on load via `GET /api/transactions` + `POST /api/fraud/scan`
- After applying migration 0005, the Protection Score should drop (more HIGH-risk txns)
- The Flagged Transactions panel should show GlobalTex Imports Ltd at the top
- The demo CSV files live at `scripts/demo/` — use them for upload demos
- Demo script is at `scripts/demo/DEMO_SCRIPT.md`

Replace or augment the existing seed data (`0001_create_transactions.sql`) with transactions tied to a single vendor: **"GlobalTex Imports Ltd"**.

Plant the following signals across transactions:

- 4 transactions from GlobalTex Imports Ltd
  - High amounts (> $5,000) → fraud rule triggers
  - `ip_is_vpn = true` on 2 of them → fraud rule triggers
  - `cvv_match = false` on 2 of them → fraud rule triggers
  - `ip_country = 'IR'` (Iran) → high-risk country rule triggers
  - `address_match = false` on 1 → fraud rule triggers
- 2 normal transactions from other vendors for contrast

**Target outcome:** GlobalTex Imports Ltd scores HIGH risk (≥ 60 points) from fraud rules alone.

### Step 1.2 — Wire OpenSanctions API key ✅

**Backend done:** OpenSanctions now requires an API key.

Changes made:

- `state.rs` — added `opensanctions_api_key: String` to `AppState`
- `main.rs` — loads `OPENSANCTIONS_API_KEY` env var (defaults to empty string so server still starts without it)
- `services/open_sanctions.rs` — `search()` now accepts `api_key: &str` and sends `Authorization: ApiKey {key}` header when non-empty
- `routes/sanctions.rs` and `routes/risk.rs` — pass `&state.opensanctions_api_key` to all call sites
- `backend/arrt/.env` — added `OPENSANCTIONS_API_KEY=your_opensanctions_api_key_here` placeholder

**Action required:** Get a free API key at `opensanctions.org/api/` and set `OPENSANCTIONS_API_KEY` in `backend/arrt/.env`.

**Verify the demo vendor name produces a match** by testing after setting the key:

```text
GET https://api.opensanctions.org/search/default?q=GlobalTex+Imports&limit=5
Authorization: ApiKey YOUR_KEY
```

If no strong match comes back (score > 0.7), adjust the vendor name in `0005_seed_demo_narrative.sql` and the demo CSVs to a name that does match (e.g., a known sanctioned trading company).

### Step 1.3 — Create demo CSV files ✅

Created at `scripts/demo/vendor_sanctions_demo.csv` and `scripts/demo/transactions_demo.csv`.

### Step 1.4 — Create demo countries input

For the geo-risk demo, the preset countries string will be: `Iran, Russia, Myanmar, China, Nigeria`

These will produce CRITICAL/HIGH risk scores and make the geo-risk module impactful.

### Step 1.5 — Write a demo script ✅

Created at `scripts/demo/DEMO_SCRIPT.md`.

---

## Phase 2 — Wire Benford's Law + Duplicates to the UI (1–2 hrs)

**Goal:** Surface two already-built backend features that are completely invisible in the UI.

### Step 2.1 — Add Benford's Law card to the dashboard

In `frontend/app/page.tsx`:

1. Add state variables:

   ```typescript
   const [benfordData, setBenfordData] = useState<BenfordResponse | null>(null);
   const [benfordLoading, setBenfordLoading] = useState(false);
   ```

2. Add a `fetchBenford` call inside the initial `useEffect` alongside the existing fraud scan fetch.

3. Add a new card in the Fraud Detection section titled **"Benford's Law Analysis"** that shows:
   - `is_suspicious` → badge (SUSPICIOUS in red / NORMAL in green)
   - `chi_square` value → "χ² = {value}"
   - `total_transactions` → "Analyzed {n} transactions"
   - `flagged_digits` → list of digits with unexpected frequency
   - If `is_suspicious`: warning text — "Transaction amounts show statistically anomalous digit patterns, consistent with systematic manipulation."
   - If not suspicious: "Digit distribution matches expected Benford's Law profile."

### Step 2.2 — Add Duplicate Invoices card to the dashboard

In `frontend/app/page.tsx`:

1. Add state variables:

   ```typescript
   const [duplicatesData, setDuplicatesData] = useState<DuplicatesResponse | null>(null);
   const [duplicatesLoading, setDuplicatesLoading] = useState(false);
   ```

2. Add a `fetchDuplicates` call in the same `useEffect`.

3. Add a card titled **"Duplicate Invoice Detection"** that shows:
   - Total duplicate groups count with badge
   - For each group: vendor name, amount, date, count of duplicates
   - If none: "No duplicate invoices detected."

### Step 2.3 — Handle loading and error states

Both cards should show a loading skeleton while fetching and a graceful error state if the backend is unreachable. Reuse the existing loading patterns already in `page.tsx`.

---

## Phase 3 — Unified Entity Risk Profile (4–6 hrs)

**Goal:** A single search that cross-references a vendor/entity across all three modules and returns one composite risk verdict.

### Step 3.1 — Add backend endpoint `POST /api/entity/investigate` ✅

**Backend done:** `backend/arrt/src/routes/entity.rs`

Create `backend/arrt/src/routes/entity.rs`:

**Request:**

```json
{ "entity_name": "GlobalTex Imports Ltd" }
```

**Response:**

```json
{
  "entity_name": "GlobalTex Imports Ltd",
  "composite_risk_score": 91,
  "composite_risk_level": "CRITICAL",
  "fraud": {
    "transaction_count": 4,
    "flagged_count": 4,
    "highest_risk_score": 105,
    "risk_level": "HIGH",
    "top_triggered_rules": ["CVV mismatch", "VPN detected", "High-risk country"]
  },
  "sanctions": {
    "match_found": true,
    "matched_name": "Global Textile Imports LLC",
    "confidence": 91,
    "sanctions_list": "EU Consolidated List",
    "reason": "Trade sanctions violation",
    "risk_level": "HIGH"
  },
  "geo_risk": {
    "country": "IR",
    "risk_score": 88,
    "risk_level": "CRITICAL",
    "ai_briefing": "Iran is subject to comprehensive OFAC sanctions..."
  },
  "ai_summary": "GlobalTex Imports Ltd presents a CRITICAL composite risk...",
  "recommended_action": "Suspend all transactions immediately. File a Suspicious Activity Report (SAR) within 30 days. Do not notify the entity."
}
```

**Implementation logic in the route:**

1. Query the `transactions` table for rows where `customer_name` matches (case-insensitive, partial match)
2. For each matched transaction, run `fraud_rules::score()` to get risk scores
3. Call `open_sanctions::search()` with the entity name
4. Extract the `ip_country` from the matched transactions (most common country)
5. Call `llm::analyze_geo_risk()` for that country
6. Compute composite score:

   ```text
   composite = (fraud_score_normalized * 0.4) + (sanctions_confidence * 0.35) + (geo_score * 0.25)
   ```

   Where `fraud_score_normalized = min(highest_fraud_score / 100.0, 1.0) * 100`

7. Call Gemini/LLM to generate the `ai_summary` and `recommended_action`

### Step 3.2 — Register the new route in `main.rs` ✅

**Backend done:** Route registered in `main.rs` and module declared in `routes/mod.rs`.

Add to the router:

```rust
.route("/api/entity/investigate", post(entity::investigate))
```

Add the module in `routes/mod.rs`.

### Step 3.3 — Add TypeScript type and API function (UI)

In `frontend/lib/api.ts`, add:

```typescript
export interface EntityInvestigationResponse {
  entity_name: string;
  composite_risk_score: number;
  composite_risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  fraud: {
    transaction_count: number;
    flagged_count: number;
    highest_risk_score: number;
    risk_level: string;
    top_triggered_rules: string[];
  };
  sanctions: {
    match_found: boolean;
    matched_name: string | null;
    confidence: number | null;
    sanctions_list: string | null;
    reason: string | null;
    risk_level: string | null;
  };
  geo_risk: {
    country: string | null;
    risk_score: number | null;
    risk_level: string | null;
    ai_briefing: string | null;
  };
  ai_summary: string;
  recommended_action: string;
}

export async function investigateEntity(entityName: string): Promise<EntityInvestigationResponse> {
  const res = await fetch(`${BACKEND_URL}/api/entity/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_name: entityName }),
  });
  if (!res.ok) throw new Error("Entity investigation failed");
  return res.json();
}
```

### Step 3.4 — Build the Entity Investigator UI component

Create `frontend/components/EntityInvestigator.tsx`:

**Design:**

- Search bar with placeholder: "Enter vendor or entity name..."
- Submit button: "Investigate"
- Loading state: spinner + "Scanning fraud records, sanctions lists, and geopolitical risk..."
- Result: a prominent risk verdict card with four sections:

```text
┌──────────────────────────────────────────────────────┐
│  GlobalTex Imports Ltd          [CRITICAL RISK: 91]  │
├──────────────┬───────────────┬──────────────────────-┤
│ FRAUD        │ SANCTIONS     │ GEO RISK              │
│ HIGH         │ HIGH          │ CRITICAL              │
│ 4/4 flagged  │ 91% match     │ Iran — 88/100         │
│ CVV, VPN,    │ EU Consol.    │ Comprehensive OFAC    │
│ High-risk    │ List          │ sanctions regime      │
│ country      │               │                       │
├──────────────┴───────────────┴───────────────────────┤
│ AI Summary: This vendor presents a CRITICAL risk...  │
├──────────────────────────────────────────────────────┤
│ Recommended Action:                                  │
│ Suspend all transactions immediately. File SAR...    │
└──────────────────────────────────────────────────────┘
```

Use color coding:

- CRITICAL → red-700 background, white text
- HIGH → orange-600
- MEDIUM → yellow-500
- LOW → green-600

### Step 3.5 — Integrate EntityInvestigator into the dashboard

In `frontend/app/page.tsx`:

- Add the `EntityInvestigator` component at the top of the page, above the three module cards
- It should be the first thing a judge sees

---

## Phase 4 — Real PDF Compliance Report (2–3 hrs)

**Goal:** Replace the browser print dialog with a properly styled, downloadable PDF.

### Step 4.1 — Install PDF library

```bash
cd frontend && npm install @react-pdf/renderer
```

### Step 4.2 — Design the PDF document structure

Create `frontend/components/ComplianceReportPDF.tsx` using `@react-pdf/renderer`:

**Document sections:**

1. **Cover page**
   - ShieldAI logo (use `/public/yosemite_logo.png`)
   - "Compliance Risk Report"
   - Generated date + time
   - Scan metadata (total entities scanned, total flagged)

2. **Executive Summary**
   - Protection Score (text representation: "Overall Protection Score: 42/100 — HIGH RISK")
   - Total flags across all modules
   - AI-generated risk overview text (from `fraudSummary.potential_reasons`)

3. **Fraud Detection Findings** *(if data exists)*
   - Table: Transaction ID, Customer, Amount, Risk Level, Triggered Rules
   - Only include HIGH and MEDIUM risk rows

4. **Sanctions Screening Findings** *(if data exists)*
   - Table: Uploaded Name, Matched Name, Confidence %, Sanctions List, Action

5. **Geopolitical Risk Assessment** *(if data exists)*
   - Table: Country, Risk Score, Risk Level, Conflict Events (90d), Fatalities (90d)
   - AI briefing per country (truncated to 2 sentences)

6. **Recommendations**
   - Bullet list of recommended actions derived from the highest-risk findings
   - Standard disclaimer text

7. **Footer on every page**
   - "Generated by ShieldAI | Confidential Compliance Report | {date}"

### Step 4.3 — Replace PDFExport.tsx

Rewrite `frontend/components/PDFExport.tsx` to:

1. Accept all scan data as props (`fraudData`, `sanctionsData`, `anomaliesData`, `geoRiskData`)
2. Use `@react-pdf/renderer`'s `PDFDownloadLink` component
3. Render the `ComplianceReportPDF` document
4. Button text: "Export PDF" → while generating: "Generating..." → ready: "Download Report"

### Step 4.4 — Wire props in page.tsx

Update the `PDFExport` usage in `page.tsx` to pass all current scan state as props.

---

## Phase 5 — AI Copilot Chat Panel (5–6 hrs, do if time allows)

**Goal:** A chat interface with full context of the current scan results, powered by the existing HuggingFace LLM endpoint.

### Step 5.1 — Add backend endpoint `POST /api/chat` ✅

**Backend done:** `backend/arrt/src/routes/chat.rs` + `llm::chat_with_context()`

**Design note:** The frontend sends context as three plain-text summary strings
(`fraud_summary`, `sanctions_summary`, `geo_summary`) — not raw JSON. This keeps the
LLM prompt clean and avoids the model having to parse nested JSON. The frontend
is responsible for serializing its current scan state before sending.

Create `backend/arrt/src/routes/chat.rs`:

**Request:**

```json
{
  "message": "Which vendor should I investigate first?",
  "context": {
    "fraud_results": [],
    "sanctions_results": [],
    "geo_risk_results": []
  }
}
```

**Implementation:**

1. Serialize the context into a structured prompt:

   ```text
   You are a compliance AI assistant. Here is the current scan context:

   FRAUD SCAN: {n} transactions flagged. Top risks: {top_3_fraud_results}
   SANCTIONS: {n} entities flagged. Top match: {top_sanctions_match}
   GEO RISK: Countries analyzed: {countries_with_risk_levels}

   User question: {message}

   Answer concisely in 2-3 sentences. Be specific to the data above.
   ```

2. Call `llm::call_hf()` with this prompt
3. Return `{ "response": "..." }`

### Step 5.2 — Add TypeScript type and API function (UI)

**Important — context serialization contract:**
The backend expects plain-text summaries, NOT raw JSON objects. Before calling
`chatWithCopilot`, the frontend must serialize current scan state like this:

```typescript
// Build context strings from current state
const fraudSummary = fraudData
  ? `${fraudData.flagged} of ${fraudData.total_scanned} flagged. ` +
    fraudData.results.slice(0, 3).map(r =>
      `${r.customer_name ?? r.transaction_id}: $${r.amount}, score ${r.risk_score} (${r.risk_level})`
    ).join("; ")
  : undefined;

const sanctionsSummary = sanctionsData
  ? `${sanctionsData.flagged} of ${sanctionsData.total_entities} entities matched. ` +
    sanctionsData.results.filter(r => r.matched_name).slice(0, 3).map(r =>
      `${r.uploaded_name} → ${r.matched_name} (${r.confidence}% confidence, ${r.sanctions_list})`
    ).join("; ")
  : undefined;

const geoSummary = geoRiskData
  ? geoRiskData.results.map(r =>
      `${r.country}: ${r.risk_level} (${r.risk_score}/100)`
    ).join(", ")
  : undefined;
```

In `frontend/lib/api.ts`:

```typescript
export async function chatWithCopilot(
  message: string,
  context: { fraudData?: FraudScanResponse; sanctionsData?: SanctionsResponse; geoRiskData?: GeoRiskResponse }
): Promise<{ response: string }> {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
  });
  if (!res.ok) throw new Error("Chat failed");
  return res.json();
}
```

### Step 5.3 — Build the Copilot Chat component

Create `frontend/components/CopilotChat.tsx`:

**Design:**

- Collapsible panel, anchored to the bottom-right corner
- "Ask ShieldAI" button to open/close
- Message list with user and AI bubbles
- Input field + send button
- Suggested prompts shown before first message:

  - "Which vendor should I investigate first?"
  - "Summarize the highest-risk findings"
  - "Draft a SAR memo for the top flagged entity"
  - "What should I do about the sanctions matches?"

### Step 5.4 — Integrate into page.tsx

Add `CopilotChat` at the bottom of the page layout, passing current scan data as context props.

---

## Completion Checklist

- [x] Phase 1.1 — Seed data updated with GlobalTex narrative
- [x] Phase 1.2 — OpenSanctions API key wired + placeholder in .env
- [x] Phase 1.3 — Demo CSV files created
- [ ] Phase 1.4 — Geo-risk demo countries confirmed
- [x] Phase 1.5 — Demo script written
- [ ] Phase 2.1 — Benford's Law card wired to UI
- [ ] Phase 2.2 — Duplicate Invoices card wired to UI
- [ ] Phase 2.3 — Loading/error states for both cards
- [x] Phase 3.1 — `/api/entity/investigate` backend endpoint
- [x] Phase 3.2 — Route registered in main.rs
- [ ] Phase 3.3 — TypeScript type + API function
- [ ] Phase 3.4 — EntityInvestigator component built
- [ ] Phase 3.5 — EntityInvestigator added to dashboard
- [ ] Phase 4.1 — @react-pdf/renderer installed
- [ ] Phase 4.2 — ComplianceReportPDF document designed
- [ ] Phase 4.3 — PDFExport.tsx rewritten
- [ ] Phase 4.4 — PDF props wired in page.tsx
- [x] Phase 5.1 — `/api/chat` backend endpoint
- [ ] Phase 5.2 — Chat API function (UI)
- [ ] Phase 5.3 — CopilotChat component (UI)
- [ ] Phase 5.4 — CopilotChat integrated into dashboard (UI)
