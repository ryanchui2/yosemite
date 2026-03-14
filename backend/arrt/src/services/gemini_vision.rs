use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde_json::json;

use crate::models::fraud::DocumentFraudResponse;

const PROMPT: &str = r#"You are a forensic document analyst specializing in invoice and financial document fraud detection.

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

Return only the JSON. No markdown, no explanation outside the JSON."#;

pub async fn analyze_document(
    client: &Client,
    file_bytes: Vec<u8>,
    mime_type: &str,
) -> Result<DocumentFraudResponse, Box<dyn std::error::Error + Send + Sync>> {
    let api_key = match std::env::var("GEMINI_API_KEY") {
        Ok(key) => key,
        Err(_) => return Err("GEMINI_API_KEY not set".into()),
    };

    let b64 = STANDARD.encode(&file_bytes);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let body = json!({
        "contents": [{
            "parts": [
                { "text": PROMPT },
                { "inlineData": { "mimeType": mime_type, "data": b64 } }
            ]
        }],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "temperature": 0.1
        }
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    tracing::info!("Gemini vision response: {}", resp);

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("No text in Gemini vision response. Full response: {}", resp))?;

    // Strip markdown code fences if Gemini wraps the JSON
    let clean = text.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: serde_json::Value = serde_json::from_str(clean)?;

    Ok(DocumentFraudResponse {
        document_type: parsed["document_type"].as_str().unwrap_or("unknown").to_string(),
        risk_level: parsed["risk_level"].as_str().unwrap_or("LOW").to_string(),
        risk_score: parsed["risk_score"].as_u64().unwrap_or(0) as u32,
        fraud_signals: parsed["fraud_signals"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect(),
        legitimate_indicators: parsed["legitimate_indicators"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect(),
        summary: parsed["summary"].as_str().unwrap_or("").to_string(),
        recommended_action: parsed["recommended_action"].as_str().unwrap_or("").to_string(),
    })
}
