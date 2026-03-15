"""
Shared LLM factory for the invoice_fraud Railtracks pipelines.

Prefers GEMINI_API_KEY (Gemini via OpenAI-compatible API). Also supports
OPENAI_API_KEY and HF_API_KEY. Set one in ai/.env for "Run full AI fraud analysis" to work.
"""

import os

import railtracks as rt

# Gemini: OpenAI-compatible endpoint (https://ai.google.dev/gemini-api/docs/openai)
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_DEFAULT_MODEL = "gemini-2.0-flash"

# HuggingFace inference endpoints (set HF_BASE_URL in env to switch if one is slow)
HF_BASE_URL_OLD = "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1"
HF_BASE_URL_NEW = "https://qyt7893blb71b5d3.us-east-2.aws.endpoints.huggingface.cloud/v1"
HF_MODEL = "openai/gpt-oss-120b"
OPENAI_DEFAULT_MODEL = "gpt-3.5-turbo"
OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"


def _provider(model: str, base: str, api_key: str) -> rt.llm.OpenAICompatibleProvider:
    return rt.llm.OpenAICompatibleProvider(
        model_name=model,
        api_base=base,
        api_key=api_key,
    )


def make_llm() -> rt.llm.OpenAICompatibleProvider:
    gemini_key = os.environ.get("GEMINI_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    hf_key = os.environ.get("HF_API_KEY")

    if gemini_key:
        model = os.environ.get("GEMINI_MODEL", GEMINI_DEFAULT_MODEL)
        return _provider(model, GEMINI_BASE, gemini_key)
    if openai_key:
        model = os.environ.get("OPENAI_MODEL", OPENAI_DEFAULT_MODEL)
        base = os.environ.get("OPENAI_API_BASE") or OPENAI_DEFAULT_BASE
        return _provider(model, base, openai_key)
    if hf_key:
        base = os.environ.get("HF_BASE_URL", HF_BASE_URL_OLD)
        return _provider(os.environ.get("HF_MODEL", HF_MODEL), base, hf_key)
    return _provider(OPENAI_DEFAULT_MODEL, OPENAI_DEFAULT_BASE, "")


def make_llm_coordinator() -> rt.llm.OpenAICompatibleProvider:
    """LLM for the coordinator/synthesizer (e.g. stronger model via FRAUD_COORDINATOR_MODEL)."""
    coord_model = os.environ.get("FRAUD_COORDINATOR_MODEL")
    if coord_model:
        gemini_key = os.environ.get("GEMINI_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")
        hf_key = os.environ.get("HF_API_KEY")
        base = OPENAI_DEFAULT_BASE
        key = ""
        if gemini_key:
            base = GEMINI_BASE
            key = gemini_key
        elif openai_key:
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
        gemini_key = os.environ.get("GEMINI_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")
        hf_key = os.environ.get("HF_API_KEY")
        base = OPENAI_DEFAULT_BASE
        key = ""
        if gemini_key:
            base = GEMINI_BASE
            key = gemini_key
        elif openai_key:
            base = os.environ.get("OPENAI_API_BASE") or OPENAI_DEFAULT_BASE
            key = openai_key
        elif hf_key:
            base = os.environ.get("HF_BASE_URL", HF_BASE_URL_OLD)
            key = hf_key
        return _provider(spec_model, base, key)
    return make_llm()
