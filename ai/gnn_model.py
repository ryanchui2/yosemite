"""
2-layer GCN for transaction graph fraud detection (novel signal).

Uses the same graph structure as graph_tool (customer/order/amount-date edges).
Node features: degree, normalized amount, binary flags. Outputs risk score per node;
flags transactions above threshold or in top percentile.
"""

from typing import Any

try:
    import torch
except ImportError:
    torch = None

from invoice_fraud.graph_tool import build_transaction_graph

# GCN: H' = relu(A_norm @ X @ W)
def _normalized_adjacency(edge_index: "torch.Tensor", n: int) -> "torch.Tensor":
    """D^{-1/2} (A + I) D^{-1/2} in sparse sense: we use edge_index and degree."""
    if torch is None:
        return None
    device = edge_index.device
    deg = torch.zeros(n, device=device)
    for i in range(edge_index.shape[1]):
        deg[edge_index[0, i].long()] += 1
    # add self-loops for A + I
    deg = deg + 1
    deg_inv_sqrt = deg.pow(-0.5)
    deg_inv_sqrt[torch.isinf(deg_inv_sqrt)] = 0
    return edge_index, deg_inv_sqrt


def gnn_analysis(transactions: list[dict], *, top_frac: float = 0.25) -> dict[str, Any]:
    """
    Run 2-layer GCN on the transaction graph; return flagged_transaction_ids and summary.
    If torch or networkx is missing, returns unavailable message.
    """
    if torch is None:
        return {
            "flagged_transaction_ids": [],
            "summary": "GNN analysis unavailable (install torch: pip install torch).",
        }
    try:
        import networkx as nx
    except ImportError:
        return {
            "flagged_transaction_ids": [],
            "summary": "GNN analysis unavailable (install networkx).",
        }
    G = build_transaction_graph(transactions)
    if G is None or G.number_of_nodes() < 2:
        return {
            "flagged_transaction_ids": [],
            "summary": "GNN: graph too small (need at least 2 nodes).",
        }
    nodes = list(G.nodes())
    n = len(nodes)
    node_to_idx = {tid: i for i, tid in enumerate(nodes)}

    # Edge index (2, num_edges) for PyTorch
    edge_list = []
    for u, v in G.edges():
        i, j = node_to_idx.get(u), node_to_idx.get(v)
        if i is not None and j is not None:
            edge_list.append((i, j))
            edge_list.append((j, i))
    if not edge_list:
        return {
            "flagged_transaction_ids": [],
            "summary": "GNN: no edges in graph.",
        }
    edge_index = torch.tensor(edge_list, dtype=torch.long).t().contiguous()  # (2, E)

    # Node features: degree (normalized), amount (normalized), binary flags
    amounts = []
    for tid in nodes:
        data = G.nodes.get(tid, {})
        amt = data.get("amount")
        if amt is not None and isinstance(amt, (int, float)):
            amounts.append(float(amt))
        else:
            amounts.append(0.0)
    import math
    degs = [G.degree(tid) for tid in nodes]
    max_deg = max(degs) or 1
    max_amt = max(amounts) or 1.0
    features = []
    for i, tid in enumerate(nodes):
        d = degs[i] / max_deg
        a = amounts[i] / max_amt
        features.append([d, a, 1.0 if degs[i] >= 2 else 0.0])
    x = torch.tensor(features, dtype=torch.float32)

    # Normalized adjacency (symmetric)
    edge_index, deg_inv_sqrt = _normalized_adjacency(edge_index, n)
    row, col = edge_index[0], edge_index[1]
    edge_weight = deg_inv_sqrt[row.long()] * deg_inv_sqrt[col.long()]

    # 2-layer GCN: X1 = relu(A_norm @ X @ W1), X2 = A_norm @ X1 @ W2 -> risk
    hidden = 8
    W1 = torch.randn(3, hidden) * 0.5
    W2 = torch.randn(hidden, 1) * 0.5
    # Sparse matmul: A_norm @ X = scatter edge_weight * x[col] by row
    def gcn_layer(x_t: torch.Tensor, edge_idx: torch.Tensor, ew: torch.Tensor) -> torch.Tensor:
        row_idx = edge_idx[0].long()
        col_idx = edge_idx[1].long()
        out = torch.zeros_like(x_t)
        for e in range(edge_idx.shape[1]):
            out[row_idx[e]] += ew[e].item() * x_t[col_idx[e]]
        return out

    # D^{-1/2}(A+I)D^{-1/2} @ X: add self-loops; weight for (i,i) = 1/(deg_i+1) = deg_inv_sqrt^2
    self_loops = torch.arange(n, device=edge_index.device).unsqueeze(0).repeat(2, 1)
    edge_index_self = torch.cat([edge_index, self_loops], dim=1)
    edge_weight_self = torch.cat([
        edge_weight,
        deg_inv_sqrt.pow(2),
    ])
    x1 = gcn_layer(x, edge_index_self, edge_weight_self)
    x1 = x1 @ W1
    x1 = torch.relu(x1)
    x2 = gcn_layer(x1, edge_index_self, edge_weight_self)
    x2 = x2 @ W2
    risk = x2.squeeze(-1)
    # Normalize to [0,1]
    r_min, r_max = risk.min().item(), risk.max().item()
    if r_max > r_min:
        risk = (risk - r_min) / (r_max - r_min)
    else:
        risk = torch.zeros_like(risk)

    # Flag top_frac by risk
    k = max(1, int(math.ceil(n * top_frac)))
    _, top_indices = torch.topk(risk, min(k, n))
    flagged_ids = [nodes[i] for i in top_indices.tolist()]

    summary = (
        f"GNN (2-layer GCN): {n} nodes, {edge_index.shape[1] // 2} edges; "
        f"{len(flagged_ids)} transaction(s) flagged (top risk scores)."
    )
    return {
        "flagged_transaction_ids": flagged_ids,
        "risk_scores": {nodes[i]: round(risk[i].item(), 4) for i in range(n)},
        "summary": summary,
    }
