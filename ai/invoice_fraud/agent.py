"""
Single-agent Railtracks pipeline for invoice fraud detection.

fraud_analyst is a single agent that autonomously decides which of the
three fraud detection tools to call (and in what order) based on the
transaction batch it receives. It returns a structured FraudReport object.
"""

from typing import List, Literal

import railtracks as rt
from pydantic import BaseModel, Field

from ._llm import make_llm
from .tools import run_anomaly_scoring, run_benford_analysis, run_duplicate_detection


class FraudReport(BaseModel):
    risk_level: Literal["low", "medium", "high", "critical"] = Field(
        description="Overall risk level for the transaction batch."
    )
    summary: str = Field(
        description="2-3 sentence summary of fraud signals found across the batch."
    )
    anomalous_transaction_ids: List[str] = Field(
        description="List of transaction IDs flagged as anomalous by Isolation Forest."
    )
    benford_suspicious: bool = Field(
        description="True if Benford's Law analysis flagged suspicious digit distribution."
    )
    duplicate_groups_count: int = Field(
        description="Number of duplicate invoice groups detected (0 if none)."
    )
    recommendations: List[str] = Field(
        description="Actionable recommendations for the fraud analyst, one per list item."
    )


fraud_analyst = rt.agent_node(
    name="FraudAnalyst",
    tool_nodes=[run_anomaly_scoring, run_benford_analysis, run_duplicate_detection],
    llm=make_llm(),
    output_schema=FraudReport,
    system_message=(
        "You are an expert invoice fraud analyst. You will be given a batch of financial "
        "transactions and must assess the batch for fraud using your available tools.\n\n"
        "Step 1: Call run_anomaly_scoring with the full transaction list to identify outliers.\n"
        "Step 2: Extract all numeric amounts from the transactions and call run_benford_analysis "
        "to check for statistical manipulation.\n"
        "Step 3: Call run_duplicate_detection with the full transaction list to find duplicate "
        "invoices or repeated charges.\n\n"
        "After all three tools have returned, synthesize their results into a FraudReport:\n"
        "- risk_level: 'low' if no signals, 'medium' if one mild signal, 'high' if anomalies "
        "or duplicates are present, 'critical' if multiple strong signals overlap.\n"
        "- summary: concise 2-3 sentence description of what was found.\n"
        "- anomalous_transaction_ids: the IDs from the anomaly scoring output.\n"
        "- benford_suspicious: the is_suspicious flag from the Benford result "
        "(false if sufficient_data is false).\n"
        "- duplicate_groups_count: the total_duplicate_groups value.\n"
        "- recommendations: specific, actionable next steps (freeze accounts, manual review, etc.)."
    ),
)
