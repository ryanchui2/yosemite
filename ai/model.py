import pandas as pd
from sklearn.ensemble import IsolationForest


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

    # Normalize to 0–1 (higher = more anomalous)
    min_s, max_s = raw_scores.min(), raw_scores.max()
    normalized = [
        (max_s - s) / (max_s - min_s) if max_s != min_s else 0.0 for s in raw_scores
    ]

    return [
        {"transaction_id": t["transaction_id"], "anomaly_score": round(score, 4)}
        for t, score in zip(transactions, normalized)
    ]
