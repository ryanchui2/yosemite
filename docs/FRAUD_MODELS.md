# Fraud Detection Models (AI Fraud Analysis)

All of the following are part of ARRT’s **AI fraud analysis** pipeline: rule-based scoring, classical ML, and Railtracks-orchestrated signals for real-time financial fraud detection aimed at small businesses. The “Run full AI fraud analysis” flow in the dashboard runs this entire pipeline and returns one combined report.

## Core models (existing)

| Model / technique        | Purpose (small business)                                                                                                                                                                      | Where                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Isolation Forest**     | Unsupervised anomaly scoring on transaction features (amount, CVV, address, VPN, card-present, etc.). Surfaces statistical outliers without labels.                                           | `ai/model.py`; used by Railtracks tools and `/score` |
| **Benford's Law**        | Chi-squared test on leading digits of transaction amounts. Real financial data follows Benford; fabricated or manipulated amounts often do not. Forensic accounting technique.                | `ai/model.py`; `/benford`                            |
| **Duplicate detection**  | Groups by order_id and by (customer_id, amount, date). Flags repeated invoices and same-customer same-amount same-day charges—common small-business loss.                                     | `ai/model.py`; `/duplicates`                         |
| **Rule-based scoring**   | Round amounts, CVV/AVS mismatch, VPN, card-not-present, refunds, high amount, high-risk IP country, mobile+VPN. Weighted risk score and level.                                                | `backend/arrt/src/services/fraud_rules.rs`           |
| **Graph heuristics**     | Builds transaction graph from shared customer_id, order_id, customer+amount+date. Flags large/dense components and high-degree nodes (rings, bursty clusters).                                | `ai/invoice_fraud/graph_tool.py`; `/graph`           |
| **Document / VLM**       | Gemini Vision analysis of uploaded invoices and PDFs for tampering, missing fields, suspicious amounts.                                                                                       | `ai/invoice_fraud/document_tool.py`; Document agent  |
| **Railtracks pipelines** | Single-agent (`fraud_analyst`) and multi-agent (`fraud_coordinator`) orchestrate anomaly, Benford, duplicate, graph, velocity, and optional document tools into one structured `FraudReport`. | `ai/invoice_fraud/agent.py`, `multi_agent.py`        |

## Novel / innovative signals (TD Best AI Hack)

| Model / technique               | What it does                                                                                                                                                | Why it’s novel (small business)                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behavioral velocity**         | Per-entity (e.g. customer_id) aggregates: count and sum in last 24h vs trailing 30d from the batch. Flags when 24h activity is ≥3× baseline (configurable). | Industry-standard real-time signal; often underused in SMB. Interpretable (rule) with optional learned thresholds. Catches compromised accounts and burst fraud. |
| **Graph heuristics (pipeline)** | Same graph as above but exposed as a Railtracks tool and fused with other signals in one report.                                                            | Combines “who is connected” with anomaly, Benford, duplicates, and velocity for compound signals.                                                                |

### Innovation and research alignment

- **Multi-signal fusion**: Railtracks orchestrates Isolation Forest, Benford, duplicate detection, graph analysis, behavioral velocity, **GNN (2-layer GCN)**, and **BiLSTM sequence** into a single interpretable report (risk level, summary, recommendations). This mirrors the “compound signal” value of real compliance platforms.
- **Real-time and latency**: The agent-scan path returns `duration_ms` so speed is transparent; the pipeline is designed for one-click, real-time analysis.
- **Literature**: Velocity-style rules are standard in payment fraud (e.g. velocity checks, time-window aggregation). Graph-based and temporal methods are active research areas (e.g. FraudGT, GNNs for transaction networks; BiLSTM/transformers for sequences). Our graph and velocity signals are practical implementations suitable for small-business transaction and invoice fraud.

## Small-business use cases

- **Duplicate payments** — duplicate detection + Benford.
- **Forged or manipulated amounts** — Benford’s Law.
- **Outlier vendors or transactions** — Isolation Forest + rules.
- **Rings and bursty behavior** — graph analysis + velocity.
- **Compromised accounts / sudden spikes** — behavioral velocity.
- **Document fraud** — VLM document analysis when an invoice/PDF is uploaded.

## Where to find code

- **ML and velocity**: `ai/model.py` (Isolation Forest, Benford, duplicates, `velocity_analysis`).
- **Graph**: `ai/invoice_fraud/graph_tool.py`.
- **GNN**: `ai/gnn_model.py` (2-layer GCN on transaction graph).
- **BiLSTM sequence**: `ai/sequence_model.py` (per-entity temporal sequences).
- **Tools and agents**: `ai/invoice_fraud/tools.py`, `agent.py`, `multi_agent.py`.
- **API**: `ai/main.py` (`/score`, `/benford`, `/duplicates`, `/graph`, `/velocity`, `/gnn`, `/sequence`, `/agent-scan`).
- **Rules**: `backend/arrt/src/services/fraud_rules.rs`.
