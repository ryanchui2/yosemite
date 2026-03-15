"""
Railtracks function_node tools for the invoice fraud detection pipeline.

Each tool calls the local FastAPI sidecar endpoints (running on the same
process via the uvicorn server) using httpx. The tools are decorated with
@rt.function_node so Railtracks can expose them to agent nodes as callable
tools with auto-generated schemas from the docstrings.
"""

import os

import httpx
import railtracks as rt


def _ai_base_url() -> str:
    return os.environ.get("AI_SERVICE_URL", "http://localhost:8000").rstrip("/")


@rt.function_node
def run_anomaly_scoring(transactions: list) -> dict:
    """Run Isolation Forest anomaly scoring on a batch of transactions.

    Calls the /score endpoint of the ML sidecar and returns per-transaction
    anomaly scores. Scores range from 0 to 1 — higher means more anomalous.

    Args:
        transactions (list): List of transaction dicts. Each dict should
            include transaction_id, amount, cvv_match, address_match,
            ip_is_vpn, and card_present fields.
    """
    url = f"{_ai_base_url()}/score"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_benford_analysis(amounts: list) -> dict:
    """Run Benford's Law chi-squared analysis on a list of transaction amounts.

    Checks whether the distribution of leading digits follows Benford's Law.
    Requires at least 50 amounts for a statistically meaningful result; if
    fewer are provided, sufficient_data will be false.

    Args:
        amounts (list): List of numeric transaction amounts (floats or ints).
    """
    url = f"{_ai_base_url()}/benford"
    resp = httpx.post(url, json={"amounts": amounts}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_duplicate_detection(transactions: list) -> dict:
    """Detect duplicate invoices in a batch of transactions.

    Groups transactions by shared order_id or by the combination of
    customer_id, amount, and date. Returns the number of duplicate groups
    and their constituent transaction IDs.

    Args:
        transactions (list): List of transaction dicts. Each dict should
            include transaction_id, order_id, customer_id, amount, and
            timestamp fields.
    """
    url = f"{_ai_base_url()}/duplicates"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_graph_analysis(transactions: list) -> dict:
    """Run graph-based fraud heuristics on a batch of transactions.

    Builds a graph from transactions (nodes = transaction_ids; edges = shared
    customer_id, order_id, or customer+amount+date). Flags transactions in
    large/dense components or with high degree (potential rings or bursty clusters).

    Args:
        transactions (list): List of transaction dicts with transaction_id,
            customer_id, order_id, amount, and timestamp fields.
    """
    url = f"{_ai_base_url()}/graph"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_velocity_analysis(transactions: list) -> dict:
    """Run behavioral velocity analysis on a batch of transactions.

    Flags entities (e.g. customer_id) whose 24h activity (count or sum) is ≥3x
    their 30d baseline. Detects sudden spikes that may indicate compromised
    accounts or fraud bursts. Requires timestamps on transactions.

    Args:
        transactions (list): List of transaction dicts with transaction_id,
            customer_id (or customer_name), amount, and timestamp fields.
    """
    url = f"{_ai_base_url()}/velocity"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_gnn_analysis(transactions: list) -> dict:
    """Run 2-layer GCN (GNN) on the transaction graph.

    Builds the same graph as graph analysis (customer/order/amount-date edges),
    runs a small Graph Convolutional Network, returns transaction IDs with
    highest learned risk scores.

    Args:
        transactions (list): List of transaction dicts with transaction_id,
            customer_id, order_id, amount, and timestamp fields.
    """
    url = f"{_ai_base_url()}/gnn"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=60.0)
    resp.raise_for_status()
    return resp.json()


@rt.function_node
def run_sequence_analysis(transactions: list) -> dict:
    """Run BiLSTM sequence (temporal) analysis per entity.

    Builds per-customer_id transaction sequences (sorted by time), runs a
    small BiLSTM to score temporal patterns, returns flagged entity and
    transaction IDs.

    Args:
        transactions (list): List of transaction dicts with transaction_id,
            customer_id, amount, and timestamp fields.
    """
    url = f"{_ai_base_url()}/sequence"
    resp = httpx.post(url, json={"transactions": transactions}, timeout=60.0)
    resp.raise_for_status()
    return resp.json()


def _run_document_analysis_impl(document_base64: str, mime_type: str) -> dict:
    from .document_tool import analyze_document_vlm
    return analyze_document_vlm(document_base64, mime_type)


@rt.function_node
def run_document_analysis(document_base64: str, mime_type: str) -> dict:
    """Run vision-based document fraud analysis (Gemini VLM).

    Analyzes an invoice/document image or PDF for tampering, missing fields,
    suspicious amounts, and other fraud signals. Call only when a document
    is available (e.g. base64 and mime_type provided in the request).

    Args:
        document_base64 (str): Base64-encoded document bytes.
        mime_type (str): MIME type, e.g. application/pdf, image/jpeg.
    """
    return _run_document_analysis_impl(document_base64, mime_type)
