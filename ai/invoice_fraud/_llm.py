"""
Shared LLM factory for the invoice_fraud Railtracks pipelines.

Uses the HuggingFace inference endpoint (OpenAI-compatible) so all agents
go through the same model. Reads HF_API_KEY from the environment (ai/.env).
"""

import os

import railtracks as rt

HF_BASE_URL = "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1"
HF_MODEL = "openai/gpt-oss-120b"


def make_llm() -> rt.llm.OpenAICompatibleProvider:
    api_key = os.environ.get("HF_API_KEY", "")
    return rt.llm.OpenAICompatibleProvider(
        model_name=HF_MODEL,
        api_base=HF_BASE_URL,
        api_key=api_key,
    )
