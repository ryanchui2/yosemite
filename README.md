# ARRT — AI-Powered Compliance Intelligence

**Built with Railtracks**

ARRT is a fraud detection and compliance intelligence platform for small businesses. Built for real-time detection of fraudulent transactions and financial anomalies, it combines rule-based scoring, machine learning anomaly detection, and **Railtracks** multi-agent AI (anomaly detection, Benford's Law, duplicate detection) to surface invoice fraud, sanctions exposure, and geopolitical risk. Uses Railtracks for multi-agent fraud analysis.

## TD Best AI Hack — Real-Time Financial Fraud Detection

ARRT is built for the **TD Best AI Hack** track: real-time detection of fraudulent transactions, suspicious patterns, and financial anomalies. The **AI fraud analysis** pipeline is the **Railtracks**-driven pipeline: multiple signals (Isolation Forest, Benford's Law, duplicate detection, graph analysis, behavioral velocity, document/VLM) are orchestrated into a single structured report with risk level, summary, and recommendations. One click → full analysis; latency is exposed as `duration_ms` for speed transparency.

## Architecture

```
frontend/        Next.js 14 dashboard (TypeScript + Tailwind)
backend/arrt/    Rust (Axum) REST API — fraud scoring, pipeline ingestion, sanctions
ai/              Python (FastAPI) ML sidecar + Railtracks agent pipelines
```

## Features

- **AI fraud analysis** — one pipeline that runs and combines:
  - **Transaction fraud scoring** — rule engine + Isolation Forest anomaly detection
  - **Benford's Law** — chi-squared test for manipulated amount distributions
  - **Duplicate invoice detection** — repeated order IDs and same customer/amount/date charges
  - **Graph analysis** — transaction graph heuristics (rings, bursty clusters)
  - **Behavioral velocity** — 24h vs 30d activity spikes per entity
  - **Document fraud** — Gemini Vision on uploaded invoices/PDFs
  - **Railtracks orchestration** — single-agent (`fraud_analyst`) and multi-agent (`fraud_coordinator`) fuse all signals into a structured `FraudReport` (risk level, summary, recommendations, `duration_ms`)
- **Sanctions Screening** — entity matching against the OpenSanctions dataset
- **Geopolitical Risk** — country-level risk briefings via LLM

**Docs:** [AI fraud analysis — models](docs/FRAUD_MODELS.md) (all signals: anomaly, Benford, duplicate, graph, velocity, document) · [Datasets](docs/DATASETS.md) (demo data and public synthetic fraud datasets)

## Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Frontend    | Next.js 14, TypeScript, Tailwind CSS          |
| Backend     | Rust, Axum, sqlx, PostgreSQL                  |
| ML Sidecar  | Python, FastAPI, scikit-learn, pandas         |
| AI Agents   | Railtracks, HuggingFace (openai/gpt-oss-120b) |
| Document AI | Google Gemini Vision                          |
| LLM         | HuggingFace (openai/gpt-oss-120b)             |

## Getting Started

### Python AI Sidecar

```bash
cd ai
./run_local.sh          # creates .venv, installs deps, starts on :8000
```

### Rust Backend

```bash
cd backend/arrt
cargo run               # starts on :3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # starts on :3000
```

### Railtracks Agent Verification

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
GEMINI_API_KEY=...   # optional, for document/vision analysis
# For "Run full AI fraud analysis" (Railtracks), set one of:
OPENAI_API_KEY=...   # OpenAI (or any OpenAI-compatible endpoint)
HF_API_KEY=...       # or HuggingFace inference endpoint (hack-provided)
# Optional: if one HF endpoint is slow, try the other (default: old)
# HF_BASE_URL=https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1
# HF_BASE_URL=https://qyt7893blb71b5d3.us-east-2.aws.endpoints.huggingface.cloud/v1
```

**`backend/.env`**
```
DATABASE_URL=...
HF_API_KEY=...
HF_BASE_URL=...
GEMINI_API_KEY=...
AI_SERVICE_URL=http://localhost:8000
```
