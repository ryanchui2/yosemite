"""
Document-level fraud analysis via Gemini Vision (VLM).
Mirrors the backend gemini_vision prompt and response shape for the ensemble.
"""

import json
import os
from typing import Any

import httpx

GEMINI_DOCUMENT_PROMPT = r"""You are a forensic document analyst specializing in invoice and financial document fraud detection.

Analyze this document carefully and return ONLY a valid JSON object with this exact structure:
{
  "document_type": "invoice|receipt|contract|purchase_order|other",
  "risk_level": "HIGH|MEDIUM|LOW",
  "risk_score": <integer 0-100>,
  "fraud_signals": ["signal 1", "signal 2"],
  "legitimate_indicators": ["indicator 1"],
  "summary": "2-3 sentence professional assessment",
  "recommended_action": "specific action to take"
}

Check for:
- Inconsistent fonts, spacing, or formatting that suggests tampering
- Missing standard fields (invoice number, date, vendor address, tax ID)
- Suspicious round numbers or amounts just under reporting thresholds
- Mismatched logos, letterheads, or company details
- Unrealistic pricing, quantities, or tax calculations
- Signs of image manipulation or poor quality that may hide alterations
- Duplicate or sequential invoice numbers that look fabricated

Return only the JSON. No markdown, no explanation outside the JSON."""


def analyze_document_vlm(document_base64: str, mime_type: str) -> dict[str, Any]:
    """
    Call Gemini Vision API and return document fraud analysis.
    Raises if GEMINI_API_KEY is unset or the API call fails.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "document_type": "unknown",
            "risk_level": "LOW",
            "risk_score": 0,
            "fraud_signals": [],
            "legitimate_indicators": [],
            "summary": "Document analysis skipped (GEMINI_API_KEY not set).",
            "recommended_action": "Set GEMINI_API_KEY to enable vision-based fraud analysis.",
        }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    body = {
        "contents": [
            {
                "parts": [
                    {"text": GEMINI_DOCUMENT_PROMPT},
                    {"inlineData": {"mimeType": mime_type, "data": document_base64}},
                ]
            }
        ],
        "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.1},
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
    text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    if not text:
        return {
            "document_type": "unknown",
            "risk_level": "LOW",
            "risk_score": 0,
            "fraud_signals": [],
            "legitimate_indicators": [],
            "summary": "No response from document analysis.",
            "recommended_action": "Retry or check document format.",
        }
    clean = (
        text.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )
    try:
        parsed = json.loads(clean)
    except json.JSONDecodeError:
        return {
            "document_type": "unknown",
            "risk_level": "LOW",
            "risk_score": 0,
            "fraud_signals": [],
            "legitimate_indicators": [],
            "summary": str(text[:200]),
            "recommended_action": "Manual review recommended.",
        }
    return {
        "document_type": parsed.get("document_type", "unknown"),
        "risk_level": parsed.get("risk_level", "LOW"),
        "risk_score": int(parsed.get("risk_score", 0)),
        "fraud_signals": list(parsed.get("fraud_signals", [])) if isinstance(parsed.get("fraud_signals"), list) else [],
        "legitimate_indicators": list(parsed.get("legitimate_indicators", [])) if isinstance(parsed.get("legitimate_indicators"), list) else [],
        "summary": str(parsed.get("summary", "")),
        "recommended_action": str(parsed.get("recommended_action", "")),
    }
