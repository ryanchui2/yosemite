# ARRT — AI-Powered Compliance Intelligence

**Built with Railtracks**

ARRT is a fraud detection and compliance intelligence platform for small businesses. It combines rule-based scoring, machine learning anomaly detection, and multi-agent AI pipelines to surface invoice fraud, sanctions exposure, and geopolitical risk in real time.

## Architecture

```
frontend/        Next.js 14 dashboard (TypeScript + Tailwind)
backend/arrt/    Rust (Axum) REST API — fraud scoring, pipeline ingestion, sanctions
ai/              Python (FastAPI) ML sidecar + Railtracks agent pipelines
```

## Features

- **Transaction Fraud Scoring** — weighted rule engine + Isolation Forest anomaly detection
- **Benford's Law Analysis** — chi-squared test to detect manipulated amount distributions
- **Duplicate Invoice Detection** — catches repeated order IDs and same customer/amount/date charges
- **Document Fraud** — Gemini Vision analysis of uploaded invoices and PDFs
- **Railtracks Agent Pipelines** — single-agent (`fraud_analyst`) and multi-agent (`fraud_coordinator`) pipelines that orchestrate all three fraud signals and return a structured `FraudReport`
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
GEMINI_API_KEY=...
HF_API_KEY=...
```

**`backend/.env`**
```
DATABASE_URL=...
HF_API_KEY=...
HF_BASE_URL=...
GEMINI_API_KEY=...
AI_SERVICE_URL=http://localhost:8000
```
