# Demo Script — ShieldAI (3 minutes)

## Setup Before Demo
- Backend running on localhost:3001
- Python ML sidecar running on localhost:8000
- Frontend running on localhost:3000
- Migration 0005 applied (GlobalTex seed data in DB)
- `vendor_sanctions_demo.csv` and `transactions_demo.csv` ready to upload

---

## The Story

> "Let's say you're a small business owner. Your finance team flagged some unusual
> transactions from a new textile vendor you've been working with. You want to know
> if you have a compliance problem — in under 3 minutes, without a compliance department."

---

## Step 1 — Open the Dashboard (30 sec)

Point to the **Protection Score** gauge.

> "The moment you open ShieldAI, it auto-scans all your recent transactions.
> We're currently sitting at a 42/100 — that's HIGH RISK. Something is wrong."

Point to the **Flagged Transactions** panel.

> "Four transactions from GlobalTex Imports Ltd are all flagged HIGH risk.
> CVV mismatches, VPN use, high amounts — all from the same vendor."

---

## Step 2 — Anomaly Detection (45 sec)

Upload `transactions_demo.csv` to the Anomaly Detector. Click **Run Analysis**.

> "Let's run a deeper statistical analysis. Our Isolation Forest model scores
> every transaction for anomalous behavior."

Point to the results table showing TXN-D001 through TXN-D004 flagged.

> "All four GlobalTex transactions are statistical outliers — anomaly scores above 0.85.
> The two clean vendors? Normal."

Point to the Benford's Law card if visible.

> "We also run Benford's Law — a mathematical test used by forensic accountants.
> The digit distribution of these amounts is statistically inconsistent with legitimate
> business transactions."

---

## Step 3 — Sanctions Screening (45 sec)

Upload `vendor_sanctions_demo.csv` to the Sanctions Screener. Click **Scan Entities**.

> "Now let's check if any of these vendors appear on international watchlists."

Point to the GlobalTex match result.

> "GlobalTex Imports Ltd matches an entity on a major sanctions list with high
> confidence. The AI explanation tells us exactly why and what to do about it."

Point to Acme and Nordic showing clean.

> "Your legitimate vendors come back clean."

---

## Step 4 — Geopolitical Risk (30 sec)

Type `Iran, Russia, Myanmar` into the Geo Risk input. Click **Analyze Risk**.

> "That VPN traffic? It's routing through Iran. Let's see what that means geopolitically."

Point to Iran scoring CRITICAL.

> "Iran is under comprehensive OFAC sanctions. Any business transacting with
> Iran-based entities faces severe legal exposure."

---

## Step 5 — Entity Investigation (30 sec) *(if Phase 3 is complete)*

Type `GlobalTex Imports Ltd` into the Entity Investigator search bar.

> "But here's the real power — one search, three signals, one verdict."

Point to the composite risk card.

> "Fraud: HIGH. Sanctions: HIGH — 91% match on the EU Consolidated List.
> Geo Risk: CRITICAL — Iran operations. Composite score: 91/100 CRITICAL.
> Recommended action: Suspend account. File a Suspicious Activity Report within 30 days."

> "That's what would have taken a compliance department days — done in 30 seconds."

---

## Step 6 — Export (15 sec)

Click **Export PDF**.

> "One click generates an audit-ready compliance report. Timestamped, formatted,
> ready to hand to your legal team or regulators."

---

## Key Closing Line

> "ShieldAI gives small businesses the compliance intelligence that used to require
> an entire department — automated, AI-powered, and available in real time."
