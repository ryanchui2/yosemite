use reqwest::Client;
use serde_json::json;

use crate::models::fraud::TransactionInput;

const PARSE_PROMPT: &str = r#"You are a financial data extraction specialist.

Extract all financial transactions from the document below and return them as a valid JSON array.
Each element must follow this exact schema (all fields optional except transaction_id):
{
  "transaction_id": "<string — generate a unique ID if not present, e.g. DOC-001>",
  "customer_name": "<string or null>",
  "amount": <number or null>,
  "cvv_match": <true|false|null>,
  "avs_result": "<string or null>",
  "address_match": <true|false|null>,
  "ip_is_vpn": <true|false|null>,
  "ip_country": "<2-letter ISO or null>",
  "device_type": "<string or null>",
  "card_present": <true|false|null>,
  "entry_mode": "<string or null>",
  "refund_status": "<string or null>"
}

Return only the JSON array. No markdown, no explanation. If no transactions can be extracted, return [].
"#;

/// Parse a document (PDF, image, plain text, email) into a list of transaction rows
/// by asking Gemini to extract and normalize the financial data.
pub async fn parse_document_to_csv(
    client: &Client,
    file_bytes: Vec<u8>,
    mime_type: &str,
) -> Result<Vec<TransactionInput>, Box<dyn std::error::Error + Send + Sync>> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| "GEMINI_API_KEY not set")?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    // For text-based types send as inline text; for binary types use base64 inline data
    let is_text = mime_type.starts_with("text/") || mime_type == "message/rfc822";

    let parts = if is_text {
        let text_content = String::from_utf8_lossy(&file_bytes).to_string();
        json!([
            { "text": PARSE_PROMPT },
            { "text": text_content }
        ])
    } else {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let b64 = STANDARD.encode(&file_bytes);
        json!([
            { "text": PARSE_PROMPT },
            { "inlineData": { "mimeType": mime_type, "data": b64 } }
        ])
    };

    let body = json!({
        "contents": [{ "parts": parts }],
        "generationConfig": {
            "maxOutputTokens": 4096,
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

    tracing::info!("AI parser response: {}", resp);

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("No text in AI parser response. Full: {}", resp))?;

    let clean = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let rows: Vec<TransactionInput> = serde_json::from_str(clean)
        .map_err(|e| format!("Failed to parse AI parser JSON: {} — raw: {}", e, clean))?;

    Ok(rows)
}
