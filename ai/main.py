import json
import os
import traceback
from typing import List, Optional

import railtracks as rt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from model import benford_analysis, find_duplicates, score_transactions

from invoice_fraud.graph_tool import graph_analysis

# Load .env from ai/ so HF_API_KEY etc. are set regardless of cwd
_ai_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_ai_dir, ".env"))
load_dotenv()

app = FastAPI()


# ── Railtracks agent pipeline (lazy import to avoid circular deps) ─────────────

# Threshold above which a transaction is considered anomalous (normalized 0–1 score).
ANOMALY_SCORE_THRESHOLD = 0.5


def _get_fraud_synthesizer():
    from invoice_fraud.agent import fraud_synthesizer
    return fraud_synthesizer


def _get_fraud_coordinator():
    from invoice_fraud.multi_agent import fraud_coordinator
    return fraud_coordinator


def _synthesize_report_from_tools(
    *,
    anomalous_ids: list,
    benford_suspicious: bool,
    duplicate_groups_count: int,
    dup_result: dict,
    graph_flagged_ids: Optional[list] = None,
    graph_summary: Optional[str] = None,
) -> "FraudReport":
    """Build a FraudReport from tool results when the LLM is unavailable."""
    from invoice_fraud.agent import FraudReport

    graph_flagged_ids = graph_flagged_ids or []
    has_anomalies = len(anomalous_ids) > 0
    has_duplicates = duplicate_groups_count > 0
    has_graph = len(graph_flagged_ids) > 0
    signal_count = sum([has_anomalies, benford_suspicious, has_duplicates, has_graph])

    if signal_count == 0:
        risk_level = "low"
    elif has_anomalies and (benford_suspicious or has_duplicates or has_graph):
        risk_level = "critical"
    elif signal_count >= 2 or has_anomalies:
        risk_level = "high"
    else:
        risk_level = "medium"

    parts = []
    if has_anomalies:
        parts.append(f"Anomaly scoring flagged {len(anomalous_ids)} transaction(s).")
    if benford_suspicious:
        parts.append("Benford's Law indicated a suspicious digit distribution.")
    if has_duplicates:
        parts.append(f"Duplicate detection found {duplicate_groups_count} group(s).")
    if has_graph:
        parts.append(f"Graph analysis flagged {len(graph_flagged_ids)} transaction(s).")
    if not parts:
        parts.append("No anomalies, Benford deviation, duplicate groups, or graph signals were detected.")
    summary = " ".join(parts)

    recommendations = []
    if has_anomalies:
        recommendations.append("Review the flagged transactions for manual investigation.")
    if benford_suspicious:
        recommendations.append("Consider forensic review of amount distributions.")
    if has_duplicates:
        recommendations.append("Investigate duplicate invoice groups.")
    if has_graph:
        recommendations.append("Review transactions in suspicious graph components.")
    if not recommendations:
        recommendations.append("Continue routine monitoring.")

    return FraudReport(
        risk_level=risk_level,
        summary=summary,
        anomalous_transaction_ids=anomalous_ids,
        benford_suspicious=benford_suspicious,
        duplicate_groups_count=duplicate_groups_count,
        recommendations=recommendations,
        graph_flagged_ids=graph_flagged_ids,
        graph_summary=graph_summary or "",
    )


class Transaction(BaseModel):
    transaction_id: str
    amount: Optional[float] = None
    customer_name: Optional[str] = None
    cvv_match: Optional[bool] = None
    address_match: Optional[bool] = None
    ip_is_vpn: Optional[bool] = None
    card_present: Optional[bool] = None


class ScoreRequest(BaseModel):
    transactions: List[Transaction]


@app.post("/score")
def score(req: ScoreRequest):
    results = score_transactions([t.model_dump() for t in req.transactions])
    return {"scores": results}


# ── Benford's Law ─────────────────────────────────────────────────────────────

class BenfordRequest(BaseModel):
    amounts: List[float]


@app.post("/benford")
def benford(req: BenfordRequest):
    return benford_analysis(req.amounts)


# ── Duplicate Invoice Detection ───────────────────────────────────────────────

class DuplicateTx(BaseModel):
    transaction_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Optional[float] = None
    timestamp: Optional[str] = None


class DuplicatesRequest(BaseModel):
    transactions: List[DuplicateTx]


@app.post("/duplicates")
def duplicates(req: DuplicatesRequest):
    return find_duplicates([t.model_dump() for t in req.transactions])


# ── Graph analysis (GNN-style) ───────────────────────────────────────────────

class GraphTx(BaseModel):
    transaction_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Optional[float] = None
    timestamp: Optional[str] = None


class GraphRequest(BaseModel):
    transactions: List[GraphTx]


@app.post("/graph")
def graph(req: GraphRequest):
    """Run graph-based fraud heuristics on the transaction batch."""
    return graph_analysis([t.model_dump() for t in req.transactions])


# ── Railtracks agent scan ─────────────────────────────────────────────────────

class AgentScanTransaction(BaseModel):
    transaction_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Optional[float] = None
    cvv_match: Optional[bool] = None
    address_match: Optional[bool] = None
    ip_is_vpn: Optional[bool] = None
    card_present: Optional[bool] = None
    timestamp: Optional[str] = None


class AgentScanRequest(BaseModel):
    transactions: List[AgentScanTransaction]
    document_base64: Optional[str] = None
    mime_type: Optional[str] = None


def _use_ensemble_pipeline() -> bool:
    return os.environ.get("FRAUD_PIPELINE", "synthesizer").lower() in ("ensemble", "multi")


@app.post("/agent-scan")
async def agent_scan(req: AgentScanRequest):
    """Run fraud detection tools (anomaly, Benford, duplicates, graph) then synthesize a FraudReport.

    When FRAUD_PIPELINE=ensemble or multi, uses the multi-agent coordinator (incl. Graph and optional Document agents).
    Otherwise uses the synthesizer with precomputed tool results.
    Optional document_base64 + mime_type enable VLM document analysis in ensemble mode.
    """
    try:
        tx_list = [t.model_dump() for t in req.transactions]

        # 1. Run all tools so we can override report with deterministic results.
        score_result = score_transactions(tx_list)
        amounts = [t.amount for t in req.transactions if t.amount is not None]
        benford_result = benford_analysis(amounts)
        dup_result = find_duplicates(tx_list)
        graph_result = graph_analysis(tx_list)

        anomalous_ids = [
            r["transaction_id"]
            for r in score_result
            if r.get("anomaly_score", 0) >= ANOMALY_SCORE_THRESHOLD
        ]
        benford_suspicious = bool(
            benford_result.get("sufficient_data") and benford_result.get("is_suspicious")
        )
        duplicate_groups_count = dup_result.get("total_duplicate_groups", 0)
        graph_flagged_ids = list(graph_result.get("flagged_transaction_ids", []))
        graph_summary = graph_result.get("summary") or ""

        use_ensemble = _use_ensemble_pipeline()
        report = None

        if use_ensemble:
            # Ensemble path: coordinator delegates to Anomaly, Benford, Duplicate, Document (if doc provided), Graph agents.
            prompt = (
                "Analyse this batch of transactions for fraud. Use your specialist agents "
                "(Anomaly, Benford, Duplicate, Graph) and, if a document is provided below, Document agent.\n\n"
                "Transaction batch (JSON):\n"
                + json.dumps(tx_list, indent=2)
            )
            if req.document_base64 and req.mime_type:
                prompt += (
                    f"\n\nDocument for vision analysis (call DocumentAgent with these):\n"
                    f"document_base64={req.document_base64}\nmime_type={req.mime_type}"
                )
            try:
                coordinator = _get_fraud_coordinator()
                result = await rt.call(coordinator, prompt)
                report = result.structured
            except Exception:
                report = _synthesize_report_from_tools(
                    anomalous_ids=anomalous_ids,
                    benford_suspicious=benford_suspicious,
                    duplicate_groups_count=duplicate_groups_count,
                    dup_result=dup_result,
                    graph_flagged_ids=graph_flagged_ids,
                    graph_summary=graph_summary,
                )
        else:
            # Synthesizer path: precomputed tool results (incl. graph) passed to LLM.
            prompt = (
                "Synthesize a FraudReport from these precomputed tool results.\n\n"
                "Anomaly scoring (Isolation Forest):\n"
                + json.dumps({"scores": score_result}, indent=2)
                + "\n\nBenford's Law:\n"
                + json.dumps(
                    {
                        "sufficient_data": benford_result.get("sufficient_data"),
                        "is_suspicious": benford_result.get("is_suspicious"),
                        "chi_square": benford_result.get("chi_square"),
                    },
                    indent=2,
                )
                + "\n\nDuplicate detection:\n"
                + json.dumps(
                    {
                        "total_duplicate_groups": dup_result.get("total_duplicate_groups", 0),
                        "duplicate_groups": dup_result.get("duplicate_groups", []),
                    },
                    indent=2,
                )
                + "\n\nGraph analysis:\n"
                + json.dumps(
                    {
                        "flagged_transaction_ids": graph_flagged_ids,
                        "suspicious_components": graph_result.get("suspicious_components", 0),
                        "summary": graph_summary,
                    },
                    indent=2,
                )
            )
            try:
                synthesizer = _get_fraud_synthesizer()
                result = await rt.call(synthesizer, prompt)
                report = result.structured
            except Exception:
                report = _synthesize_report_from_tools(
                    anomalous_ids=anomalous_ids,
                    benford_suspicious=benford_suspicious,
                    duplicate_groups_count=duplicate_groups_count,
                    dup_result=dup_result,
                    graph_flagged_ids=graph_flagged_ids,
                    graph_summary=graph_summary,
                )

        # Override tool-derived fields so they always match actual tool output.
        report.anomalous_transaction_ids = anomalous_ids
        report.benford_suspicious = benford_suspicious
        report.duplicate_groups_count = duplicate_groups_count
        report.graph_flagged_ids = graph_flagged_ids
        report.graph_summary = graph_summary

        # Optional second-pass reviewer agent.
        # #region agent log
        _rev_raw = os.environ.get("FRAUD_REVIEWER_ENABLED", "<unset>")
        _rev_condition = str(_rev_raw).lower() in ("true", "1", "yes")
        try:
            with open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log", "a") as _f:
                _f.write(json.dumps({"location": "main.py:reviewer_check", "message": "FRAUD_REVIEWER_ENABLED", "data": {"raw": repr(_rev_raw), "condition_true": _rev_condition}, "timestamp": __import__("time").time() * 1000}) + "\n")
        except Exception:
            pass
        # #endregion
        if os.environ.get("FRAUD_REVIEWER_ENABLED", "").lower() in ("true", "1", "yes"):
            try:
                from invoice_fraud.multi_agent import fraud_reviewer
                review_prompt = (
                    f"Review this fraud report and add a short review note.\n\n"
                    f"Risk level: {report.risk_level}\nSummary: {report.summary}\n"
                    f"Flagged IDs (sample): {report.anomalous_transaction_ids[:10]}\n"
                    f"Recommendations: {report.recommendations}"
                )
                review_result = await rt.call(fraud_reviewer, review_prompt)
                # #region agent log
                try:
                    with open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log", "a") as _f:
                        _f.write(json.dumps({"location": "main.py:reviewer_after_call", "message": "review_result", "data": {"has_structured": review_result.structured is not None, "has_notes": bool(review_result.structured and getattr(review_result.structured, "review_notes", None))}, "timestamp": __import__("time").time() * 1000}) + "\n")
                except Exception:
                    pass
                # #endregion
                if review_result.structured and review_result.structured.review_notes:
                    report.review_notes = review_result.structured.review_notes
            except Exception as e:
                # #region agent log
                try:
                    with open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log", "a") as _f:
                        _f.write(json.dumps({"location": "main.py:reviewer_exception", "message": "reviewer_failed", "data": {"type": type(e).__name__, "msg": str(e)}, "timestamp": __import__("time").time() * 1000}) + "\n")
                except Exception:
                    pass
                # #endregion
                pass  # Don't fail the request if reviewer fails

        return report.model_dump()
    except Exception as e:
        tb = traceback.format_exc()
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {e}\n\n{tb}",
        )
