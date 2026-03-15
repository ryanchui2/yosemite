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
