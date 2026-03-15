"""
Multi-agent Railtracks pipeline for invoice fraud detection.

fraud_coordinator delegates to three specialist sub-agents, each focused on
one fraud detection signal. The coordinator synthesizes their findings into a
structured FraudReport, mirroring the same output schema as the single-agent
pipeline so both are interchangeable from the caller's perspective.
"""

import railtracks as rt

from ._llm import make_llm_coordinator, make_llm_specialist
from .agent import FraudReport, ReviewNotes
from .tools import (
    run_anomaly_scoring,
    run_benford_analysis,
    run_duplicate_detection,
    run_document_analysis,
    run_graph_analysis,
    run_velocity_analysis,
    run_gnn_analysis,
    run_sequence_analysis,
)


# ── Specialist agents ─────────────────────────────────────────────────────────

anomaly_agent = rt.agent_node(
    name="AnomalyAgent",
    tool_nodes=[run_anomaly_scoring],
    llm=make_llm_specialist(),
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
    llm=make_llm_specialist(),
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
    llm=make_llm_specialist(),
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

document_agent = rt.agent_node(
    name="DocumentAgent",
    tool_nodes=[run_document_analysis],
    llm=make_llm_specialist(),
    system_message=(
        "You are a document fraud analyst (VLM). When given a document (base64 and mime_type), "
        "call run_document_analysis with document_base64 and mime_type. Return the raw JSON result "
        "plus a one-sentence interpretation of risk_level and key fraud_signals."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs vision-based document fraud analysis (Gemini) on an invoice/image/PDF. "
            "Call only when the user has provided document_base64 and mime_type."
        ),
        parameters=[
            rt.llm.Parameter(
                name="document_base64",
                param_type="string",
                description="Base64-encoded document bytes.",
            ),
            rt.llm.Parameter(
                name="mime_type",
                param_type="string",
                description="MIME type, e.g. application/pdf or image/jpeg.",
            ),
        ],
    ),
)

graph_agent = rt.agent_node(
    name="GraphAgent",
    tool_nodes=[run_graph_analysis],
    llm=make_llm_specialist(),
    system_message=(
        "You are a graph-based fraud analyst. When given a list of transactions, "
        "call run_graph_analysis with the full list. Return the raw JSON result "
        "plus a one-sentence interpretation of which transaction IDs were flagged "
        "and why (e.g. large/dense components or high-degree nodes)."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs graph heuristics on the transaction batch: builds a graph from "
            "shared customer_id, order_id, and customer+amount+date; flags transactions "
            "in suspicious components or with high degree."
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

velocity_agent = rt.agent_node(
    name="VelocityAgent",
    tool_nodes=[run_velocity_analysis],
    llm=make_llm_specialist(),
    system_message=(
        "You are a behavioral velocity fraud analyst. When given a list of transactions "
        "with timestamps, call run_velocity_analysis with the full list. Return the raw "
        "JSON result plus a one-sentence interpretation of which entities had 24h activity "
        "spikes vs their 30d baseline (e.g. flagged_entity_ids, flagged_transaction_ids)."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs behavioral velocity analysis: flags entities (e.g. customer_id) whose "
            "24h activity (count or sum) is ≥3x their 30d baseline. Requires timestamps."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description=(
                    "JSON string of the full transaction batch with transaction_id, "
                    "customer_id, amount, and timestamp fields."
                ),
            )
        ],
    ),
)

gnn_agent = rt.agent_node(
    name="GnnAgent",
    tool_nodes=[run_gnn_analysis],
    llm=make_llm_specialist(),
    system_message=(
        "You are a graph neural network (GNN) fraud analyst. When given a list of transactions, "
        "call run_gnn_analysis with the full list. Return the raw JSON result plus a one-sentence "
        "interpretation of which transaction IDs were flagged by the 2-layer GCN (graph risk scores)."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs 2-layer GCN on the transaction graph; returns transaction IDs with highest "
            "learned risk (graph structure + node features)."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description="JSON string of the full transaction batch with transaction_id, customer_id, order_id, amount, timestamp.",
            )
        ],
    ),
)

sequence_agent = rt.agent_node(
    name="SequenceAgent",
    tool_nodes=[run_sequence_analysis],
    llm=make_llm_specialist(),
    system_message=(
        "You are a temporal/sequence fraud analyst. When given a list of transactions with timestamps, "
        "call run_sequence_analysis with the full list. Return the raw JSON result plus a one-sentence "
        "interpretation of which entities or transactions were flagged by BiLSTM sequence analysis."
    ),
    manifest=rt.ToolManifest(
        description=(
            "Runs BiLSTM sequence analysis per entity (customer_id); flags entities with "
            "suspicious temporal transaction patterns. Requires timestamps."
        ),
        parameters=[
            rt.llm.Parameter(
                name="transactions",
                param_type="string",
                description="JSON string of the full transaction batch with transaction_id, customer_id, amount, timestamp.",
            )
        ],
    ),
)


# ── Coordinator ───────────────────────────────────────────────────────────────

fraud_coordinator = rt.agent_node(
    name="FraudCoordinator",
    tool_nodes=[anomaly_agent, benford_agent, duplicate_agent, document_agent, graph_agent, velocity_agent, gnn_agent, sequence_agent],
    llm=make_llm_coordinator(),
    output_schema=FraudReport,
    system_message=(
        "You are a fraud investigation coordinator. You will receive a batch of "
        "financial transactions and must orchestrate specialist agents to produce a complete FraudReport.\n\n"
        "Always call these agents with the full transaction JSON:\n"
        "1. AnomalyAgent — score for outliers.\n"
        "2. BenfordAgent — check digit distribution.\n"
        "3. DuplicateAgent — find duplicate invoices.\n"
        "4. GraphAgent — run graph-based fraud heuristics.\n"
        "5. VelocityAgent — run behavioral velocity (24h vs 30d baseline); use if transactions have timestamps.\n"
        "6. GnnAgent — run 2-layer GCN on the transaction graph for learned graph risk.\n"
        "7. SequenceAgent — run BiLSTM sequence (temporal) analysis per entity; use if transactions have timestamps.\n\n"
        "If the user message includes document_base64 and mime_type (e.g. for an uploaded document), "
        "also call DocumentAgent with those two arguments to get vision-based document fraud signals.\n\n"
        "Once all relevant specialists have responded, synthesize their findings:\n"
        "- risk_level: 'low' if no signals, 'medium' if one mild signal, 'high' if "
        "anomalies, duplicates, or graph flags are confirmed, 'critical' if multiple strong signals overlap; "
        "elevate if document_risk_level is HIGH.\n"
        "- summary: 2-3 sentences describing the combined findings.\n"
        "- anomalous_transaction_ids: IDs flagged by AnomalyAgent.\n"
        "- benford_suspicious: is_suspicious from BenfordAgent (false if data insufficient).\n"
        "- duplicate_groups_count: total_duplicate_groups from DuplicateAgent.\n"
        "- graph_flagged_ids: flagged_transaction_ids from GraphAgent.\n"
        "- graph_summary: summary from GraphAgent (one line).\n"
        "- velocity_flagged_ids: flagged_transaction_ids from VelocityAgent (if called).\n"
        "- velocity_summary: summary from VelocityAgent (one line).\n"
        "- gnn_flagged_ids: flagged_transaction_ids from GnnAgent (if called).\n"
        "- gnn_summary: summary from GnnAgent (one line).\n"
        "- sequence_flagged_ids: flagged_transaction_ids from SequenceAgent (if called).\n"
        "- sequence_summary: summary from SequenceAgent (one line).\n"
        "- document_risk_level, document_signals, document_summary: from DocumentAgent when you called it.\n"
        "- recommendations: specific, actionable next steps."
    ),
)

# ── Reviewer / critic agent (optional second pass) ─────────────────────────────

fraud_reviewer = rt.agent_node(
    name="FraudReviewer",
    tool_nodes=[],
    llm=make_llm_coordinator(),
    output_schema=ReviewNotes,
    system_message=(
        "You are a senior fraud analyst reviewing a fraud report. You will be given a summary "
        "of a FraudReport (risk level, summary, flagged IDs, recommendations). Your job is to "
        "add a short review note: one or two sentences that either confirm the assessment, "
        "suggest escalation (e.g. external audit), or note a pattern (e.g. consistent with past incident). "
        "Return a JSON object with a single field 'review_notes' containing your note. Be concise."
    ),
)
