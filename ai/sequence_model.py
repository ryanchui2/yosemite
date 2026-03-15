"""
BiLSTM-based temporal/sequence fraud signal (novel).

Builds per-entity (customer_id) transaction sequences sorted by time; uses a small
BiLSTM to encode sequences and output anomaly/risk score per entity. Flags entities
(and their transaction_ids) with high sequence risk.
"""

from collections import defaultdict
from typing import Any

try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = None


def _parse_ts(ts: str | None) -> float | None:
    if ts is None or ts == "":
        return None
    try:
        if isinstance(ts, (int, float)):
            return float(ts) if ts > 1e10 else ts * 1000
        from datetime import datetime
        s = str(ts).strip()
        if s.isdigit():
            t = float(s)
            return t if t > 1e10 else t * 1000
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(s[:19], fmt).timestamp()
            except ValueError:
                continue
        return None
    except Exception:
        return None


def sequence_analysis(
    transactions: list[dict],
    *,
    max_len: int = 20,
    top_frac: float = 0.3,
) -> dict[str, Any]:
    """
    Per-entity (customer_id) transaction sequences; BiLSTM outputs risk per entity.
    Returns flagged_entity_ids, flagged_transaction_ids, summary.
    """
    if torch is None or nn is None:
        return {
            "flagged_entity_ids": [],
            "flagged_transaction_ids": [],
            "summary": "Sequence (BiLSTM) analysis unavailable (install torch: pip install torch).",
        }
    if not transactions:
        return {
            "flagged_entity_ids": [],
            "flagged_transaction_ids": [],
            "summary": "No transactions for sequence analysis.",
        }

    by_entity: dict[str, list[dict]] = defaultdict(list)
    for t in transactions:
        ts = _parse_ts(t.get("timestamp"))
        if ts is None:
            continue
        entity = t.get("customer_id") or t.get("customer_name") or "unknown"
        by_entity[entity].append({
            "transaction_id": t.get("transaction_id"),
            "amount": float(t["amount"]) if t.get("amount") is not None else 0.0,
            "ts": ts,
        })

    for key in by_entity:
        by_entity[key].sort(key=lambda x: x["ts"])

    # Build sequences: (amount_norm, time_delta_norm) per step
    entities = []
    seqs = []
    all_txn_ids = []
    for entity, rows in by_entity.items():
        if len(rows) < 2:
            continue
        amounts = [r["amount"] for r in rows]
        times = [r["ts"] for r in rows]
        max_amt = max(amounts) or 1.0
        deltas = [0.0]
        for i in range(1, len(times)):
            deltas.append(times[i] - times[i - 1])
        max_d = max(deltas) or 1.0
        feats = [[a / max_amt, d / max_d] for a, d in zip(amounts, deltas)]
        if len(feats) > max_len:
            feats = feats[-max_len:]
            txn_ids = [r["transaction_id"] for r in rows[-max_len:]]
        else:
            txn_ids = [r["transaction_id"] for r in rows]
        entities.append(entity)
        seqs.append(feats)
        all_txn_ids.append(txn_ids)

    if not seqs:
        return {
            "flagged_entity_ids": [],
            "flagged_transaction_ids": [],
            "summary": "Sequence analysis: need at least 2 timed transactions per entity.",
        }

    # Pad to same length
    pad_len = max(len(s) for s in seqs)
    padded = []
    for s in seqs:
        while len(s) < pad_len:
            s = [[0.0, 0.0]] + s
        padded.append(s[:pad_len])
    x = torch.tensor(padded, dtype=torch.float32)  # (batch, seq_len, 2)

    class _SequenceRisk(nn.Module):
        def __init__(self, input_size=2, hidden=8):
            super().__init__()
            self.lstm = nn.LSTM(input_size, hidden, batch_first=True, bidirectional=True)
            self.fc = nn.Linear(hidden * 2, 1)

        def forward(self, x):
            out, _ = self.lstm(x)
            out = out[:, -1, :]
            return self.fc(out).squeeze(-1)

    model = _SequenceRisk(input_size=2, hidden=8)
    model.eval()
    with torch.no_grad():
        risk = model(x)
    risk = torch.sigmoid(risk)
    r_min, r_max = risk.min().item(), risk.max().item()
    if r_max > r_min:
        risk = (risk - r_min) / (r_max - r_min)

    k = max(1, int(len(entities) * top_frac))
    _, top_idx = torch.topk(risk, min(k, len(entities)))
    flagged_entities = [entities[i] for i in top_idx.tolist()]
    flagged_txn_ids = []
    for i in top_idx.tolist():
        flagged_txn_ids.extend(all_txn_ids[i])

    summary = (
        f"BiLSTM sequence analysis: {len(entities)} entity/entities with ≥2 timed transactions; "
        f"{len(flagged_entities)} entity/entities flagged (temporal pattern risk), "
        f"{len(flagged_txn_ids)} transaction(s) involved."
    )
    return {
        "flagged_entity_ids": flagged_entities,
        "flagged_transaction_ids": list(dict.fromkeys(flagged_txn_ids)),
        "summary": summary,
    }
