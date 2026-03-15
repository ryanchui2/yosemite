import pandas as pd
from collections import defaultdict
from sklearn.ensemble import IsolationForest

# ── Isolation Forest ──────────────────────────────────────────────────────────

def score_transactions(transactions: list[dict]) -> list[dict]:
    df = pd.DataFrame(transactions)
    numeric = df.select_dtypes(include="number").fillna(0)

    if numeric.empty or len(numeric) < 5:
        return [
            {"transaction_id": t["transaction_id"], "anomaly_score": 0.0}
            for t in transactions
        ]

    model = IsolationForest(contamination=0.05, random_state=42)
    raw_scores = model.fit(numeric).decision_function(numeric)

    min_s, max_s = raw_scores.min(), raw_scores.max()
    normalized = [
        (max_s - s) / (max_s - min_s) if max_s != min_s else 0.0 for s in raw_scores
    ]

    return [
        {"transaction_id": t["transaction_id"], "anomaly_score": round(score, 4)}
        for t, score in zip(transactions, normalized)
    ]


# ── Benford's Law ─────────────────────────────────────────────────────────────

BENFORD_EXPECTED = {
    1: 30.103, 2: 17.609, 3: 12.494, 4: 9.691,
    5: 7.918,  6: 6.695,  7: 5.799,  8: 5.115, 9: 4.576,
}

# Chi-squared critical value at p=0.05, df=8
_CHI2_CRITICAL = 15.507


def benford_analysis(amounts: list[float]) -> dict:
    digits = []
    for amt in amounts:
        if amt and amt > 0:
            s = str(int(abs(amt)))
            if s and s[0] != "0":
                digits.append(int(s[0]))

    if len(digits) < 50:
        return {"sufficient_data": False, "total_transactions": len(digits)}

    n = len(digits)
    observed_counts = {d: 0 for d in range(1, 10)}
    for d in digits:
        if 1 <= d <= 9:
            observed_counts[d] += 1

    observed_pct = {d: (observed_counts[d] / n) * 100 for d in range(1, 10)}
    expected_counts = {d: (BENFORD_EXPECTED[d] / 100) * n for d in range(1, 10)}

    chi2 = sum(
        (observed_counts[d] - expected_counts[d]) ** 2 / expected_counts[d]
        for d in range(1, 10)
        if expected_counts[d] > 0
    )
    is_suspicious = chi2 > _CHI2_CRITICAL

    digit_analysis = [
        {
            "digit": d,
            "expected_pct": round(BENFORD_EXPECTED[d], 2),
            "observed_pct": round(observed_pct[d], 2),
            "deviation": round(observed_pct[d] - BENFORD_EXPECTED[d], 2),
            "flagged": abs(observed_pct[d] - BENFORD_EXPECTED[d]) > 5,
        }
        for d in range(1, 10)
    ]

    return {
        "sufficient_data": True,
        "total_transactions": n,
        "chi_square": round(chi2, 4),
        "is_suspicious": is_suspicious,
        "digit_analysis": digit_analysis,
        "flagged_digits": [d["digit"] for d in digit_analysis if d["flagged"]],
    }


# ── Duplicate Invoice Detection ───────────────────────────────────────────────

def find_duplicates(transactions: list[dict]) -> dict:
    amount_date_groups: dict = defaultdict(list)
    order_id_map: dict = defaultdict(list)

    for tx in transactions:
        timestamp = tx.get("timestamp") or ""
        date = timestamp[:10] if len(timestamp) >= 10 else timestamp
        amount = tx.get("amount")
        customer_id = tx.get("customer_id") or "unknown"

        if amount is not None:
            key = f"{customer_id}|{amount}|{date}"
            amount_date_groups[key].append(tx["transaction_id"])

        order_id = tx.get("order_id")
        if order_id:
            order_id_map[order_id].append(tx["transaction_id"])

    duplicate_groups = []

    for key, txn_ids in amount_date_groups.items():
        if len(txn_ids) > 1:
            parts = key.split("|", 2)
            duplicate_groups.append({
                "type": "same_amount_customer_date",
                "customer_id": parts[0],
                "amount": float(parts[1]) if parts[1] else None,
                "date": parts[2] if len(parts) > 2 else "",
                "transaction_ids": txn_ids,
                "count": len(txn_ids),
            })

    for order_id, txn_ids in order_id_map.items():
        if len(txn_ids) > 1:
            duplicate_groups.append({
                "type": "duplicate_order_id",
                "order_id": order_id,
                "transaction_ids": txn_ids,
                "count": len(txn_ids),
            })

    return {
        "total_duplicate_groups": len(duplicate_groups),
        "duplicate_groups": duplicate_groups,
    }


# ── Behavioral velocity (novel signal for TD hack) ───────────────────────────────

def _parse_ts(ts: str | None) -> float | None:
    """Parse timestamp to Unix seconds; supports ISO-like and numeric."""
    if ts is None or ts == "":
        return None
    try:
        if isinstance(ts, (int, float)):
            return float(ts) if ts > 1e10 else ts * 1000  # assume ms if large
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


def velocity_analysis(transactions: list[dict], *, ratio_threshold: float = 3.0) -> dict:
    """
    Behavioral velocity: flag entities (customer_id) with unusually high activity
    in the last 24h vs trailing 30d baseline. Uses only the current batch; timestamps
    must be present. Returns flagged_entity_ids, flagged_transaction_ids, summary.
    """
    if not transactions:
        return {
            "sufficient_data": False,
            "flagged_entity_ids": [],
            "flagged_transaction_ids": [],
            "summary": "No transactions for velocity analysis.",
        }
    # Build list with parsed timestamps
    rows = []
    for t in transactions:
        ts = _parse_ts(t.get("timestamp"))
        if ts is None:
            continue
        entity = t.get("customer_id") or t.get("customer_name") or "unknown"
        rows.append({
            "transaction_id": t.get("transaction_id"),
            "entity": str(entity),
            "amount": float(t["amount"]) if t.get("amount") is not None else 0.0,
            "ts": ts,
        })
    if len(rows) < 2:
        return {
            "sufficient_data": False,
            "flagged_entity_ids": [],
            "flagged_transaction_ids": [],
            "summary": "Insufficient transactions with timestamps for velocity analysis.",
        }
    now = max(r["ts"] for r in rows)
    day_sec = 86400
    window_24h = now - day_sec
    window_30d = now - (30 * day_sec)
    # Aggregate per entity: count and sum in 24h and in 30d
    by_entity: dict[str, list] = defaultdict(list)
    for r in rows:
        by_entity[r["entity"]].append(r)
    flagged_entities = []
    flagged_txn_ids = []
    details = []
    for entity, ent_rows in by_entity.items():
        in_24h = [r for r in ent_rows if r["ts"] > window_24h]
        in_30d = [r for r in ent_rows if r["ts"] > window_30d]
        count_24h, sum_24h = len(in_24h), sum(r["amount"] for r in in_24h)
        count_30d, sum_30d = len(in_30d), sum(r["amount"] for r in in_30d)
        if count_30d == 0:
            continue
        # Expected 24h share of 30d activity
        expected_count_24h = count_30d / 30
        expected_sum_24h = sum_30d / 30
        count_ratio = count_24h / expected_count_24h if expected_count_24h > 0 else 0
        sum_ratio = count_24h / expected_count_24h if expected_count_24h > 0 else 0
        if expected_sum_24h > 0:
            sum_ratio = sum_24h / expected_sum_24h
        if count_ratio >= ratio_threshold or sum_ratio >= ratio_threshold:
            flagged_entities.append(entity)
            flagged_txn_ids.extend(r["transaction_id"] for r in in_24h if r.get("transaction_id"))
            details.append({
                "entity": entity,
                "count_24h": count_24h,
                "count_30d": count_30d,
                "sum_24h": round(sum_24h, 2),
                "sum_30d": round(sum_30d, 2),
                "count_ratio": round(count_ratio, 2),
                "sum_ratio": round(sum_ratio, 2),
            })
    summary = (
        f"Velocity analysis: {len(flagged_entities)} entity/entities with 24h activity ≥{ratio_threshold}x baseline."
        if flagged_entities
        else "No velocity spikes detected (24h vs 30d baseline)."
    )
    return {
        "sufficient_data": True,
        "flagged_entity_ids": flagged_entities,
        "flagged_transaction_ids": list(dict.fromkeys(flagged_txn_ids)),
        "details": details,
        "summary": summary,
    }
