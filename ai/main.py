from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

from model import score_transactions

app = FastAPI()


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
