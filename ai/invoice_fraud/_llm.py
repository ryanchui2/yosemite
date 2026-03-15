"""
Shared LLM factory for the invoice_fraud Railtracks pipelines.

Supports either OpenAI (OPENAI_API_KEY) or HuggingFace inference (HF_API_KEY).
You only need one of them set in ai/.env for "Run full AI fraud analysis" to work.
"""

import os

import railtracks as rt

# HuggingFace inference endpoints (set HF_BASE_URL in env to switch if one is slow)
HF_BASE_URL_OLD = "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1"
HF_BASE_URL_NEW = "https://qyt7893blb71b5d3.us-east-2.aws.endpoints.huggingface.cloud/v1"
HF_MODEL = "openai/gpt-oss-120b"
OPENAI_DEFAULT_MODEL = "gpt-4o-mini"
OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"


def _provider(model: str, base: str, api_key: str) -> rt.llm.OpenAICompatibleProvider:
    return rt.llm.OpenAICompatibleProvider(
        model_name=model,
        api_base=base,
        api_key=api_key,
    )


def make_llm() -> rt.llm.OpenAICompatibleProvider:
    openai_key = os.environ.get("OPENAI_API_KEY")
    hf_key = os.environ.get("HF_API_KEY")
    model = os.environ.get("OPENAI_MODEL", OPENAI_DEFAULT_MODEL)
    base = os.environ.get("OPENAI_API_BASE") or OPENAI_DEFAULT_BASE

    if openai_key:
        return _provider(model, base, openai_key)
    if hf_key:
        base = os.environ.get("HF_BASE_URL", HF_BASE_URL_OLD)
        os.environ["OPENAI_API_KEY"] = hf_key
        os.environ["OPENAI_API_BASE"] = base
        return _provider(os.environ.get("HF_MODEL", HF_MODEL), base, hf_key)
    return _provider(OPENAI_DEFAULT_MODEL, OPENAI_DEFAULT_BASE, "")


def make_llm_coordinator() -> rt.llm.OpenAICompatibleProvider:
    """LLM for the coordinator/synthesizer (e.g. stronger model via FRAUD_COORDINATOR_MODEL)."""
    coord_model = os.environ.get("FRAUD_COORDINATOR_MODEL")
    if coord_model:
        openai_key = os.environ.get("OPENAI_API_KEY")
        hf_key = os.environ.get("HF_API_KEY")
        base = OPENAI_DEFAULT_BASE
        key = ""
        if openai_key:
            base = os.environ.get("OPENAI_API_BASE") or OPENAI_DEFAULT_BASE
            key = openai_key
        elif hf_key:
            base = os.environ.get("HF_BASE_URL", HF_BASE_URL_OLD)
            key = hf_key
        return _provider(coord_model, base, key)
    return make_llm()


def make_llm_specialist() -> rt.llm.OpenAICompatibleProvider:
    """LLM for specialist agents (e.g. faster/cheaper via FRAUD_SPECIALIST_MODEL)."""
    spec_model = os.environ.get("FRAUD_SPECIALIST_MODEL")
    if spec_model:
        openai_key = os.environ.get("OPENAI_API_KEY")
        hf_key = os.environ.get("HF_API_KEY")
        base = OPENAI_DEFAULT_BASE
        key = ""
        if openai_key:
            base = os.environ.get("OPENAI_API_BASE") or OPENAI_DEFAULT_BASE
            key = openai_key
        elif hf_key:
            base = os.environ.get("HF_BASE_URL", HF_BASE_URL_OLD)
            key = hf_key
        return _provider(spec_model, base, key)
    return make_llm()
