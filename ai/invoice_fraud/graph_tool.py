"""
Graph-based fraud detection for the invoice_fraud ensemble.

Builds a transaction/customer graph from the batch and uses heuristic signals
(connected components, degree, clustering) to flag suspicious subgraphs or nodes.
"""

from collections import defaultdict
from typing import Any

try:
    import networkx as nx
except ImportError:
    nx = None


def build_transaction_graph(transactions: list[dict]):
    """Build an undirected graph: nodes are transaction_ids; edges connect transactions
    that share customer_id, order_id, or (customer_id, amount, date).
    """
    if nx is None or not transactions:
        return None
    G = nx.Graph()
    for t in transactions:
        tid = t.get("transaction_id")
        if tid:
            G.add_node(tid, **{k: v for k, v in t.items() if k != "transaction_id"})
    # Group by customer_id
    by_customer: dict[str, list[str]] = defaultdict(list)
    by_order: dict[str, list[str]] = defaultdict(list)
    by_customer_amount_date: dict[tuple, list[str]] = defaultdict(list)
    for t in transactions:
        tid = t.get("transaction_id")
        if not tid:
            continue
        cid = t.get("customer_id") or "unknown"
        oid = t.get("order_id")
        amount = t.get("amount")
        ts = t.get("timestamp") or ""
        date = ts[:10] if len(ts) >= 10 else ts
        by_customer[cid].append(tid)
        if oid:
            by_order[oid].append(tid)
        if amount is not None:
            by_customer_amount_date[(cid, amount, date)].append(tid)
    # Add edges: same customer
    for tids in by_customer.values():
        for i, a in enumerate(tids):
            for b in tids[i + 1 :]:
                G.add_edge(a, b)
    # Same order_id
    for tids in by_order.values():
        for i, a in enumerate(tids):
            for b in tids[i + 1 :]:
                G.add_edge(a, b)
    # Same customer+amount+date
    for tids in by_customer_amount_date.values():
        if len(tids) < 2:
            continue
        for i, a in enumerate(tids):
            for b in tids[i + 1 :]:
                G.add_edge(a, b)
    return G


def graph_analysis(transactions: list[dict]) -> dict[str, Any]:
    """
    Run graph-based fraud heuristics on a transaction batch.
    Returns flagged_transaction_ids, suspicious_components, summary.
    """
    if nx is None:
        return {
            "flagged_transaction_ids": [],
            "suspicious_components": 0,
            "summary": "Graph analysis unavailable (networkx not installed).",
        }
    G = build_transaction_graph(transactions)
    if G is None or G.number_of_nodes() == 0:
        return {
            "flagged_transaction_ids": [],
            "suspicious_components": 0,
            "summary": "No transactions to analyze.",
        }
    flagged: list[str] = []
    components = list(nx.connected_components(G))
    # Flag nodes in large or dense components (potential rings/bursts)
    comp_size_threshold = max(3, min(10, len(transactions) // 5))
    for comp in components:
        sub = G.subgraph(comp)
        n = sub.number_of_nodes()
        m = sub.number_of_edges()
        # Dense: edges close to full clique
        max_edges = n * (n - 1) // 2
        density = m / max_edges if max_edges > 0 else 0
        if n >= comp_size_threshold or (n >= 2 and density >= 0.5):
            flagged.extend(comp)
    # Also flag high-degree nodes (hubs)
    if G.number_of_nodes() >= 3:
        degrees = dict(G.degree())
        avg_deg = sum(degrees.values()) / len(degrees)
        for node, d in degrees.items():
            if d >= max(3, avg_deg + 1):
                if node not in flagged:
                    flagged.append(node)
    suspicious_components = sum(
        1
        for comp in components
        if len(comp) >= comp_size_threshold
        or (len(comp) >= 2 and G.subgraph(comp).number_of_edges() / max(1, len(comp) * (len(comp) - 1) // 2) >= 0.5)
    )
    summary = (
        f"Graph analysis: {len(components)} connected component(s), "
        f"{suspicious_components} suspicious; {len(flagged)} transaction(s) flagged (large/dense components or high-degree nodes)."
    )
    return {
        "flagged_transaction_ids": list(dict.fromkeys(flagged)),
        "suspicious_components": suspicious_components,
        "total_components": len(components),
        "summary": summary,
    }
