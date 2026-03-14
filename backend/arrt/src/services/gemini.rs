use reqwest::Client;
use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::fraud::FraudReportSummaryContent;

static LAST_CALL: AtomicU64 = AtomicU64::new(0);

pub async fn explain_fraud(
    triggered_rules: &[String],
    transaction_id: &str,
    risk_score: u32,
) -> Result<String, Box<dyn std::error::Error>> {
    // Enforce ~4 second gap between calls (15 RPM = 1 per 4s)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let last = LAST_CALL.load(Ordering::Relaxed);
    if now - last < 4 {
        tokio::time::sleep(tokio::time::Duration::from_secs(4 - (now - last))).await;
    }
    LAST_CALL.store(now, Ordering::Relaxed);

    let api_key = match std::env::var("GEMINI_API_KEY") {
        Ok(key) => key,
        Err(_) => return Err("GEMINI_API_KEY not set".into()),
    };
    let client = Client::new();

    let rules_text = triggered_rules.join(", ");
    let prompt = build_prompt(transaction_id, risk_score, &rules_text);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "maxOutputTokens": 400,
            "temperature": 0.3
        }
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    tracing::debug!("Gemini response: {}", resp);

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("Unable to generate explanation.")
        .trim()
        .to_string();

    Ok(text)
}

pub async fn summarize_fraud_reports(
    report_context: &str,
) -> Result<FraudReportSummaryContent, Box<dyn std::error::Error>> {
    throttle_gemini_calls().await;

    let api_key = match std::env::var("GEMINI_API_KEY") {
        Ok(key) => key,
        Err(_) => return Err("GEMINI_API_KEY not set".into()),
    };
    let client = Client::new();

    let prompt = build_report_summary_prompt(report_context);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "maxOutputTokens": 500,
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    tracing::debug!("Gemini fraud report summary response: {}", resp);

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .trim();

    let normalized = normalize_json_payload(text);
    let summary = serde_json::from_str::<FraudReportSummaryContent>(&normalized)?;

    Ok(summary)
}

async fn throttle_gemini_calls() {
    // Enforce ~4 second gap between calls (15 RPM = 1 per 4s)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let last = LAST_CALL.load(Ordering::Relaxed);
    if now - last < 4 {
        tokio::time::sleep(tokio::time::Duration::from_secs(4 - (now - last))).await;
    }
    LAST_CALL.store(now, Ordering::Relaxed);
}

fn build_prompt(transaction_id: &str, risk_score: u32, rules: &str) -> String {
    format!(
        "You are a compliance analyst reviewing a suspicious financial transaction. \
        Transaction ID: {}. Risk score: {}/100. \
        The following fraud signals were detected: {}. \
        In 2-3 sentences, explain why this transaction is suspicious and what action \
        the business should take. Be specific and professional. Do not use bullet points.",
        transaction_id, risk_score, rules
    )
}

fn build_report_summary_prompt(report_context: &str) -> String {
    format!(
        "You are a fraud operations analyst. Review the confirmed fraud report dataset below and produce a concise JSON summary for a dashboard card. \
        Focus only on common vulnerabilities, likely root causes, and practical improvement advice. \
        Keep each array to 2-3 short, executive-ready bullet sentences. \
        The disclaimer must clearly state that AI output may be imprecise and should be validated by analysts. \
        Return strict JSON with exactly these keys: common_vulnerabilities, potential_reasons, improvement_advice, disclaimer. \
        Each of the first three keys must be an array of strings. The disclaimer must be a single string. \
        Do not wrap the JSON in markdown.

        Confirmed fraud report dataset:
        {}",
        report_context
    )
}

fn normalize_json_payload(payload: &str) -> String {
    payload
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}
