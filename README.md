# ARRT — AI-Powered Compliance Intelligence

**Built with Railtracks**

ARRT is a fraud detection and compliance intelligence platform for small businesses. Built for real-time detection of fraudulent transactions and financial anomalies, it combines rule-based scoring, machine learning anomaly detection, and **Railtracks** multi-agent AI (anomaly detection, Benford's Law, duplicate detection) to surface invoice fraud, sanctions exposure, and geopolitical risk. Uses Railtracks for multi-agent fraud analysis.

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
