# yosemite — AI-Powered Compliance Intelligence

yosemite is a fraud detection and compliance intelligence platform for small businesses. It combines rule-based scoring, machine learning anomaly detection, and multi-agent AI to surface invoice fraud, sanctions exposure, and geopolitical risk — all from a single dashboard.

> Forked from [anthonytoyco/arrt](https://github.com/anthonytoyco/arrt) — originally built for [GenAI Genesis 2026](https://devpost.com/software/arrt).

[ITS SPINNING](https://youtube.com/shorts/ZYSaP3N9WGs)

## Features

- **AI Fraud Analysis** — one-click pipeline fusing multiple signals into a structured risk report (risk level, summary, recommendations):
  - **Anomaly detection** — Isolation Forest on transaction feature vectors
  - **Benford's Law** — chi-squared test for statistically manipulated amount distributions
  - **Duplicate invoice detection** — repeated order IDs and same customer/amount/date charges
  - **Graph analysis** — transaction graph heuristics (rings, bursty clusters)
  - **Behavioral velocity** — 24h vs 30d activity spikes per entity
  - **Document fraud** — Gemini Vision on uploaded invoices/PDFs
- **Sanctions Screening** — entity matching against the OpenSanctions dataset
- **Geopolitical Risk** — country-level risk briefings via LLM

## Architecture

```
frontend/        Next.js 14 dashboard (TypeScript + Tailwind)
backend/arrt/    Rust (Axum) REST API — fraud scoring, pipeline ingestion, sanctions
ai/              Python (FastAPI) ML sidecar + agent pipelines
```

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

## Environment Variables

**`ai/.env`**
```
GEMINI_API_KEY=...      # optional, for document/vision analysis

# Required for AI fraud analysis — set one of:
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



