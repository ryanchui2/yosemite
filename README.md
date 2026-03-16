# yosemite — AI-Powered Compliance Intelligence

**Built with [Railtracks](https://railtracks.ai)**

yosemite is a fraud detection and compliance intelligence platform for small businesses. It combines rule-based scoring, machine learning anomaly detection, and multi-agent AI to surface invoice fraud, sanctions exposure, and geopolitical risk.

## TD Best AI Hack — Real-Time Financial Fraud Detection

Built for the **TD Best AI Hack** track: real-time detection of fraudulent transactions, suspicious patterns, and financial anomalies. The AI fraud analysis pipeline is powered by **Railtracks** — multiple signals are orchestrated into a single structured report with risk level, summary, recommendations, and `duration_ms` latency. One click → full analysis.

## Architecture

```
frontend/        Next.js 14 dashboard (TypeScript + Tailwind)
backend/arrt/    Rust (Axum) REST API — fraud scoring, pipeline ingestion, sanctions
ai/              Python (FastAPI) ML sidecar + Railtracks agent pipelines
```

## Features

- **AI Fraud Analysis** — one-click pipeline fusing multiple signals into a structured `FraudReport`:
  - **Anomaly detection** — Isolation Forest on transaction patterns
  - **Benford's Law** — chi-squared test for manipulated amount distributions
  - **Duplicate invoice detection** — repeated order IDs and same customer/amount/date charges
  - **Graph analysis** — transaction graph heuristics (rings, bursty clusters)
  - **Behavioral velocity** — 24h vs 30d activity spikes per entity
  - **Document fraud** — Gemini Vision on uploaded invoices/PDFs
  - **Railtracks orchestration** — `fraud_analyst` (single-agent) and `fraud_coordinator` (multi-agent) fuse all signals into a structured `FraudReport` (risk level, summary, recommendations, `duration_ms`)
- **Sanctions Screening** — entity matching against the OpenSanctions dataset
- **Geopolitical Risk** — country-level risk briefings via LLM

## Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Frontend    | Next.js 14, TypeScript, Tailwind CSS          |
| Backend     | Rust, Axum, sqlx, PostgreSQL                  |
| ML Sidecar  | Python, FastAPI, scikit-learn, pandas         |
| AI Agents   | Railtracks, HuggingFace (openai/gpt-oss-120b) |
| Document AI | Google Gemini Vision                          |

## Getting Started

### 1. Python AI Sidecar

```bash
cd ai
./run_local.sh          # creates .venv, installs deps, starts on :8000
```

### 2. Rust Backend

```bash
cd backend/arrt
cargo run               # starts on :3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev             # starts on :3000
```

### Verify Railtracks Agents (optional)

```bash
cd ai
source .venv/bin/activate
python check_agents.py

# visualize execution trees
railtracks init
railtracks viz --port 8002
```

## Environment Variables

**`ai/.env`**
```
GEMINI_API_KEY=...      # optional, for document/vision analysis

# Required for "Run full AI fraud analysis" — set one of:
OPENAI_API_KEY=...      # OpenAI or any OpenAI-compatible endpoint
HF_API_KEY=...          # HuggingFace inference endpoint
```

**`backend/.env`**
```
DATABASE_URL=...
HF_API_KEY=...
HF_BASE_URL=...
GEMINI_API_KEY=...
AI_SERVICE_URL=http://localhost:8000
```
