import json
from typing import List, Optional

import railtracks as rt
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

from model import benford_analysis, find_duplicates, score_transactions

load_dotenv()

app = FastAPI()


# ── Railtracks agent pipeline (lazy import to avoid circular deps) ─────────────

def _get_fraud_analyst():
    from invoice_fraud.agent import fraud_analyst
    return fraud_analyst


class Transaction(BaseModel):
    transaction_id: str
    amount: Optional[float] = None
    customer_name: Optional[str] = None
    cvv_match: Optional[bool] = None
    address_match: Optional[bool] = None
    ip_is_vpn: Optional[bool] = None
    card_present: Optional[bool] = None


class ScoreRequest(BaseModel):
    transactions: List[Transaction]


@app.post("/score")
def score(req: ScoreRequest):
    results = score_transactions([t.model_dump() for t in req.transactions])
    return {"scores": results}


# ── Benford's Law ─────────────────────────────────────────────────────────────

class BenfordRequest(BaseModel):
    amounts: List[float]


@app.post("/benford")
def benford(req: BenfordRequest):
    return benford_analysis(req.amounts)


# ── Duplicate Invoice Detection ───────────────────────────────────────────────

class DuplicateTx(BaseModel):
    transaction_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Optional[float] = None
    timestamp: Optional[str] = None


class DuplicatesRequest(BaseModel):
    transactions: List[DuplicateTx]


@app.post("/duplicates")
def duplicates(req: DuplicatesRequest):
    return find_duplicates([t.model_dump() for t in req.transactions])


# ── Railtracks agent scan ─────────────────────────────────────────────────────

class AgentScanTransaction(BaseModel):
    transaction_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Optional[float] = None
    cvv_match: Optional[bool] = None
    address_match: Optional[bool] = None
    ip_is_vpn: Optional[bool] = None
    card_present: Optional[bool] = None
    timestamp: Optional[str] = None


class AgentScanRequest(BaseModel):
    transactions: List[AgentScanTransaction]


@app.post("/agent-scan")
async def agent_scan(req: AgentScanRequest):
    """Run the Railtracks fraud_analyst agent pipeline on a transaction batch.

    Returns a structured FraudReport with risk_level, summary,
    anomalous_transaction_ids, benford_suspicious, duplicate_groups_count,
    and recommendations.
    """
    analyst = _get_fraud_analyst()
    prompt = (
        "Analyse this batch of transactions for fraud:\n"
        + json.dumps([t.model_dump() for t in req.transactions], indent=2)
    )
    result = await rt.call(analyst, prompt)
    return result.structured.model_dump()
