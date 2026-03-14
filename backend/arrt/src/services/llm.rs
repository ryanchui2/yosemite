use reqwest::Client;
use serde_json::json;

use crate::models::fraud::FraudReportSummaryContent;

const OPENAI_BASE_URL: &str =
    "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1";
const MODEL: &str = "openai/gpt-oss-120b";

pub async fn explain_fraud(
    triggered_rules: &[String],
    transaction_id: &str,
    risk_score: u32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let rules_text = triggered_rules.join(", ");
    let prompt = build_prompt(transaction_id, risk_score, &rules_text);

    let resp = client
        .post(format!("{}/chat/completions", OPENAI_BASE_URL))
        .header("Authorization", "Bearer test")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a compliance analyst specializing in financial fraud detection. Be concise and professional."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 600,
            "temperature": 0.3
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    tracing::info!("GPT-OSS response: {}", resp);

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("Unable to generate explanation.")
        .trim()
        .to_string();

    Ok(text)
}

pub async fn summarize_fraud_reports(
    report_context: &str,
) -> Result<FraudReportSummaryContent, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let prompt = build_report_summary_prompt(report_context);

    let resp = client
        .post(format!("{}/chat/completions", OPENAI_BASE_URL))
        .header("Authorization", "Bearer test")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a fraud operations analyst. Return only valid JSON, no markdown."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 800,
            "temperature": 0.2
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    tracing::info!("GPT-OSS summary response: {}", resp);

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("")
        .trim();

    let normalized = normalize_json_payload(text);
    let summary = serde_json::from_str::<FraudReportSummaryContent>(&normalized)?;

    Ok(summary)
}

fn build_prompt(transaction_id: &str, risk_score: u32, rules: &str) -> String {
    format!(
        "Transaction ID: {}. Risk score: {}/100. \
        Fraud signals: {}. \
        In exactly 2 short sentences: explain why it's suspicious, then state the action. \
        Under 100 words. No bullet points.",
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
