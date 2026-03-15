"""
check_agents.py — verify the Railtracks invoice_fraud agent pipeline.

Runs both fraud_analyst (single agent) and fraud_coordinator (multi-agent)
against a crafted batch of transactions designed to trigger all three signals:
  - Anomaly outliers  (high amounts + suspicious flags on t06, t07)
  - Duplicate order_id (t08 and t09 share ORD-999)
  - Duplicate customer + amount + date (t10 and t11 share C9 / $450 / 2024-03-02)

Benford's Law requires 50+ amounts, so the agent will correctly report
sufficient_data: false for that check with this small batch.

Usage (from the ai/ directory with venv active):
    export GEMINI_API_KEY=<your-key>
    python check_agents.py

Or add GEMINI_API_KEY to ai/.env and run without the export.
"""

import asyncio
import json
import os
import sys

import railtracks as rt

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from invoice_fraud.agent import FraudReport, fraud_analyst
from invoice_fraud.multi_agent import fraud_coordinator

# ── Crafted transaction batch ─────────────────────────────────────────────────
# Needs >=5 rows for Isolation Forest to run.
# Two high-amount + suspicious-flag rows act as anomaly signals.
# t08/t09 share order_id → duplicate_order_id group.
# t10/t11 share customer_id + amount + date → same_amount_customer_date group.

TRANSACTIONS = [
    # Normal transactions
    {
        "transaction_id": "t01", "order_id": "ORD-101", "customer_id": "C1",
        "amount": 120.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T09:00:00",
    },
    {
        "transaction_id": "t02", "order_id": "ORD-102", "customer_id": "C2",
        "amount": 250.50, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T10:00:00",
    },
    {
        "transaction_id": "t03", "order_id": "ORD-103", "customer_id": "C3",
        "amount": 89.99, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T11:00:00",
    },
    {
        "transaction_id": "t04", "order_id": "ORD-104", "customer_id": "C4",
        "amount": 340.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T12:00:00",
    },
    {
        "transaction_id": "t05", "order_id": "ORD-105", "customer_id": "C5",
        "amount": 175.25, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T13:00:00",
    },
    # Anomaly outliers — high amounts + all suspicious flags set
    {
        "transaction_id": "t06", "order_id": "ORD-106", "customer_id": "C6",
        "amount": 48000.00, "cvv_match": False, "address_match": False,
        "ip_is_vpn": True, "card_present": False, "timestamp": "2024-03-01T14:00:00",
    },
    {
        "transaction_id": "t07", "order_id": "ORD-107", "customer_id": "C7",
        "amount": 52500.00, "cvv_match": False, "address_match": False,
        "ip_is_vpn": True, "card_present": False, "timestamp": "2024-03-01T14:30:00",
    },
    # Duplicate order_id — ORD-999 appears twice
    {
        "transaction_id": "t08", "order_id": "ORD-999", "customer_id": "C8",
        "amount": 199.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T15:00:00",
    },
    {
        "transaction_id": "t09", "order_id": "ORD-999", "customer_id": "C8",
        "amount": 199.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-01T15:05:00",
    },
    # Duplicate customer + amount + date — C9 charged $450 twice on 2024-03-02
    {
        "transaction_id": "t10", "order_id": "ORD-110", "customer_id": "C9",
        "amount": 450.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-02T09:00:00",
    },
    {
        "transaction_id": "t11", "order_id": "ORD-111", "customer_id": "C9",
        "amount": 450.00, "cvv_match": True, "address_match": True,
        "ip_is_vpn": False, "card_present": True, "timestamp": "2024-03-02T09:30:00",
    },
]

PROMPT = (
    "Analyse this batch of transactions for fraud:\n"
    + json.dumps(TRANSACTIONS, indent=2)
)


# ── Validation ────────────────────────────────────────────────────────────────

def _validate(report: FraudReport, label: str) -> None:
    assert report.risk_level in ("low", "medium", "high", "critical"), (
        f"{label}: unexpected risk_level '{report.risk_level}'"
    )
    assert isinstance(report.summary, str) and report.summary, (
        f"{label}: summary is empty"
    )
    assert isinstance(report.anomalous_transaction_ids, list), (
        f"{label}: anomalous_transaction_ids is not a list"
    )
    assert isinstance(report.benford_suspicious, bool), (
        f"{label}: benford_suspicious is not a bool"
    )
    assert isinstance(report.duplicate_groups_count, int), (
        f"{label}: duplicate_groups_count is not an int"
    )
    assert isinstance(report.recommendations, list) and report.recommendations, (
        f"{label}: recommendations is empty"
    )
    print("  [PASS] all FraudReport fields valid")


def _print_report(report: FraudReport) -> None:
    print(f"  risk_level             : {report.risk_level}")
    print(f"  anomalous_tx_ids       : {report.anomalous_transaction_ids}")
    print(f"  benford_suspicious     : {report.benford_suspicious}")
    print(f"  duplicate_groups_count : {report.duplicate_groups_count}")
    print(f"  summary                : {report.summary}")
    print(f"  recommendations:")
    for rec in report.recommendations:
        print(f"    - {rec}")


# ── Agent runners ─────────────────────────────────────────────────────────────

async def run_single_agent() -> FraudReport:
    print("=" * 60)
    print("SINGLE AGENT  →  fraud_analyst")
    print("=" * 60)
    result = await rt.call(fraud_analyst, PROMPT)
    report: FraudReport = result.structured
    _print_report(report)
    _validate(report, "fraud_analyst")
    return report


async def run_multi_agent() -> FraudReport:
    print("=" * 60)
    print("MULTI-AGENT   →  fraud_coordinator")
    print("=" * 60)
    result = await rt.call(fraud_coordinator, PROMPT)
    report: FraudReport = result.structured
    _print_report(report)
    _validate(report, "fraud_coordinator")
    return report


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    if not os.environ.get("GEMINI_API_KEY"):
        print("ERROR: GEMINI_API_KEY is not set.")
        print("  export GEMINI_API_KEY=<your-key>")
        print("  or add it to ai/.env and re-run.")
        sys.exit(1)

    print("\ncheck_agents.py — Railtracks invoice_fraud pipeline verification")
    print(f"Transactions in batch : {len(TRANSACTIONS)}")
    print(
        "Expected signals      : anomaly outliers (t06, t07) | "
        "duplicate order_id (t08, t09) | duplicate charge (t10, t11)\n"
    )

    await run_single_agent()
    print()
    await run_multi_agent()

    print()
    print("=" * 60)
    print("ALL CHECKS PASSED")
    print("=" * 60)
    print(
        "\nTip: run  railtracks viz  in a second terminal to see the full "
        "execution tree for both agents."
    )


asyncio.run(main())
