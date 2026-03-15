"""
Multi-agent Railtracks pipeline for invoice fraud detection.

fraud_coordinator delegates to three specialist sub-agents, each focused on
one fraud detection signal. The coordinator synthesizes their findings into a
structured FraudReport, mirroring the same output schema as the single-agent
pipeline so both are interchangeable from the caller's perspective.
"""

import railtracks as rt

from ._llm import make_llm
from .agent import FraudReport
from .tools import run_anomaly_scoring, run_benford_analysis, run_duplicate_detection


# ── Specialist agents ─────────────────────────────────────────────────────────

anomaly_agent = rt.agent_node(
    name="AnomalyAgent",
    tool_nodes=[run_anomaly_scoring],
    llm=make_llm(),
    system_message=(
        "You are an anomaly detection specialist. When given a list of transactions, "
        "call run_anomaly_scoring with the full list and return the raw JSON result "
        "plus a one-sentence interpretation of which transaction IDs are anomalous "
        "and their scores."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs Isolation Forest anomaly scoring on a batch of transactions and "
            "identifies statistical outliers."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description=(
                    "JSON string of the full transaction batch. Each object must have "
                    "transaction_id, amount, cvv_match, address_match, ip_is_vpn, "
                    "and card_present fields."
                ),
            )
        ],
    ),
)

benford_agent = rt.agent_node(
    name="BenfordAgent",
    tool_nodes=[run_benford_analysis],
    llm=make_llm(),
    system_message=(
        "You are a statistical fraud analyst specializing in Benford's Law. When given "
        "transaction data, extract all numeric amount values and call run_benford_analysis. "
        "Return the raw JSON result plus a one-sentence interpretation of whether the "
        "digit distribution is suspicious. Note: fewer than 50 amounts will produce "
        "sufficient_data=false, which is not itself a fraud signal."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Applies Benford's Law chi-squared analysis to transaction amounts to detect "
            "statistically manipulated figures."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description=(
                    "JSON string of the full transaction batch. The agent will extract "
                    "the amount field from each transaction."
                ),
            )
        ],
    ),
)

duplicate_agent = rt.agent_node(
    name="DuplicateAgent",
    tool_nodes=[run_duplicate_detection],
    llm=make_llm(),
    system_message=(
        "You are a duplicate invoice detection specialist. When given a list of "
        "transactions, call run_duplicate_detection with the full list. Return the raw "
        "JSON result plus a one-sentence summary of how many duplicate groups were found "
        "and which transaction IDs are involved."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Detects duplicate invoices by checking for repeated order IDs and "
            "matching customer/amount/date combinations."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description=(
                    "JSON string of the full transaction batch. Each object should have "
                    "transaction_id, order_id, customer_id, amount, and timestamp fields."
                ),
            )
        ],
    ),
)


# ── Coordinator ───────────────────────────────────────────────────────────────

fraud_coordinator = rt.agent_node(
    name="FraudCoordinator",
    tool_nodes=[anomaly_agent, benford_agent, duplicate_agent],
    llm=make_llm(),
    output_schema=FraudReport,
    system_message=(
        "You are a fraud investigation coordinator. You will receive a batch of "
        "financial transactions and must orchestrate a team of three specialist agents "
        "to produce a complete FraudReport.\n\n"
        "1. Delegate the full transaction JSON to AnomalyAgent to score for outliers.\n"
        "2. Delegate the full transaction JSON to BenfordAgent to check digit distribution.\n"
        "3. Delegate the full transaction JSON to DuplicateAgent to find duplicate invoices.\n\n"
        "Once all three specialists have responded, synthesize their findings:\n"
        "- risk_level: 'low' if no signals, 'medium' if one mild signal, 'high' if "
        "anomalies or duplicates are confirmed, 'critical' if multiple strong signals overlap.\n"
        "- summary: 2-3 sentences describing the combined findings.\n"
        "- anomalous_transaction_ids: IDs flagged by AnomalyAgent.\n"
        "- benford_suspicious: is_suspicious from BenfordAgent (false if data insufficient).\n"
        "- duplicate_groups_count: total_duplicate_groups from DuplicateAgent.\n"
        "- recommendations: specific, actionable next steps."
    ),
)
