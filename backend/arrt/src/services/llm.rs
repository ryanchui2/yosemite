use reqwest::Client; // kept for parameter types
use serde_json::json;

use crate::models::fraud::{FraudReportSummaryContent, GeoRiskResult};
use crate::models::risk::{BusinessRiskReport, ConflictEvent, SanctionsHit};

const MODEL: &str = "openai/gpt-oss-120b";

fn hf_base_url() -> String {
    std::env::var("HF_BASE_URL")
        .unwrap_or_else(|_| "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1".to_string())
}

fn hf_api_key() -> String {
    std::env::var("HF_API_KEY").unwrap_or_default()
}

pub async fn explain_fraud(
    client: &Client,
    triggered_rules: &[String],
    transaction_id: &str,
    risk_score: u32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let rules_text = triggered_rules.join(", ");
    let prompt = build_prompt(transaction_id, risk_score, &rules_text);

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
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
    client: &Client,
    report_context: &str,
) -> Result<FraudReportSummaryContent, Box<dyn std::error::Error + Send + Sync>> {
    let prompt = build_report_summary_prompt(report_context);

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
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

pub async fn analyze_geo_risk(
    client: &Client,
    countries: &[String],
) -> Result<Vec<GeoRiskResult>, Box<dyn std::error::Error + Send + Sync>> {
    let countries_list = countries.join(", ");

    let prompt = format!(
        "You are a geopolitical risk analyst. Assess the risk level for each country based on \
        conflict, political instability, sanctions exposure, and financial crime risk.\n\n\
        Countries: {}\n\n\
        Return a JSON array with one object per country in order:\n\
        [\n  {{\n    \
          \"country\": \"<country name>\",\n    \
          \"risk_score\": <integer 0-100>,\n    \
          \"risk_level\": \"CRITICAL|HIGH|MEDIUM|LOW\",\n    \
          \"conflict_events_90d\": <estimated integer>,\n    \
          \"fatalities_90d\": <estimated integer>,\n    \
          \"ai_briefing\": \"<2-3 sentence professional risk briefing>\"\n  \
        }}\n]\nReturn only the JSON array. No markdown.",
        countries_list
    );

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": MODEL,
            "messages": [
                { "role": "system", "content": "You are a geopolitical risk analyst. Return only valid JSON arrays, no markdown." },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 1200,
            "temperature": 0.2
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("[]")
        .trim();

    let normalized = normalize_json_payload(text);
    let results = serde_json::from_str::<Vec<GeoRiskResult>>(&normalized)?;
    Ok(results)
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

fn build_risk_prompt(
    business: &str,
    sanctions: &[SanctionsHit],
    conflicts: &[ConflictEvent],
) -> String {
    let sanctions_text = if sanctions.is_empty() {
        "No sanctions hits found.".to_string()
    } else {
        sanctions
            .iter()
            .map(|s| {
                format!(
                    "- {} (score: {:.2}, topics: {})",
                    s.name,
                    s.score,
                    s.topics.join(", ")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let conflicts_text = if conflicts.is_empty() {
        "No active conflict events found for specified countries.".to_string()
    } else {
        conflicts
            .iter()
            .map(|c| {
                format!(
                    "- {} ({}): {} deaths in {}",
                    c.conflict_name, c.country, c.deaths_total, c.year
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        "You are a geopolitical risk analyst. A business has submitted the following description: \"{}\"\n\n\
        SANCTIONS DATA:\n{}\n\n\
        CONFLICT DATA:\n{}\n\n\
        Based on this data, return ONLY a valid JSON object with this exact structure:\n\
        {{\n\
          \"overall_risk_level\": \"HIGH|MEDIUM|LOW\",\n\
          \"recommendations\": [\"rec 1\", \"rec 2\", \"rec 3\"],\n\
          \"ai_summary\": \"2-3 sentence executive summary of the risk and what the business should do\"\n\
        }}\n\
        No markdown. Return only the JSON.",
        business, sanctions_text, conflicts_text
    )
}

/// Given an entity name and any OpenSanctions hits, ask the LLM to assess risk
/// and write a short explanation. Returns (risk_level, ai_explanation).
pub async fn explain_sanctions_entity(
    client: &Client,
    entity_name: &str,
    hits: &[crate::models::risk::SanctionsHit],
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {

    let hits_text = if hits.is_empty() {
        "No direct sanctions matches were found in the database.".to_string()
    } else {
        hits.iter()
            .map(|h| {
                format!(
                    "- {} (confidence: {:.0}%, topics: {})",
                    h.name,
                    h.score * 100.0,
                    h.topics.join(", ")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let prompt = format!(
        "You are a sanctions compliance analyst. Assess the following entity:\n\
        Entity name: \"{}\"\n\n\
        SANCTIONS DATABASE MATCHES:\n{}\n\n\
        Based on your knowledge of this entity AND the database matches above, \
        return ONLY a valid JSON object with this exact structure:\n\
        {{\n\
          \"risk_level\": \"HIGH|MEDIUM|LOW\",\n\
          \"ai_explanation\": \"1-2 sentence explanation of why this entity is or is not a sanctions concern\"\n\
        }}\n\
        No markdown. Return only the JSON.",
        entity_name, hits_text
    );

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a sanctions compliance analyst. Return only valid JSON."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 300,
            "temperature": 0.2
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("")
        .trim();

    let clean = normalize_json_payload(text);
    let parsed: serde_json::Value = serde_json::from_str(&clean)?;

    let risk_level = parsed["risk_level"]
        .as_str()
        .unwrap_or("LOW")
        .to_string();
    let ai_explanation = parsed["ai_explanation"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok((risk_level, ai_explanation))
}

/// Given a composite entity risk profile, generate an executive AI summary
/// and a concrete recommended action. Returns (ai_summary, recommended_action).
pub async fn summarize_entity(
    client: &Client,
    entity_name: &str,
    composite_score: u32,
    composite_level: &str,
    fraud_rules: &[String],
    sanctions_match: Option<&str>,
    sanctions_list: Option<&str>,
    geo_country: Option<&str>,
    geo_level: Option<&str>,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let fraud_text = if fraud_rules.is_empty() {
        "No fraud signals detected.".to_string()
    } else {
        format!("Fraud signals: {}.", fraud_rules.join(", "))
    };

    let sanctions_text = match sanctions_match {
        Some(name) => format!(
            "Sanctions match: '{}' on {} list.",
            name,
            sanctions_list.unwrap_or("unknown")
        ),
        None => "No sanctions database matches found.".to_string(),
    };

    let geo_text = match (geo_country, geo_level) {
        (Some(c), Some(l)) => format!("Primary operating country: {} — geopolitical risk: {}.", c, l),
        _ => "No country data available.".to_string(),
    };

    let prompt = format!(
        "You are a compliance analyst. Produce a concise risk verdict for the following entity.\n\n\
        Entity: \"{}\"\n\
        Composite risk score: {}/100 ({})\n\
        {}\n{}\n{}\n\n\
        Return ONLY a valid JSON object with exactly these two keys:\n\
        {{\n\
          \"ai_summary\": \"<2-3 sentence executive summary of why this entity is risky>\",\n\
          \"recommended_action\": \"<one concrete compliance action to take, e.g. suspend account, file SAR>\"\n\
        }}\n\
        No markdown. Return only the JSON.",
        entity_name, composite_score, composite_level,
        fraud_text, sanctions_text, geo_text
    );

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a compliance analyst. Return only valid JSON."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 400,
            "temperature": 0.2
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("{}")
        .trim();

    let clean = normalize_json_payload(text);
    let parsed: serde_json::Value = serde_json::from_str(&clean)?;

    let ai_summary = parsed["ai_summary"]
        .as_str()
        .unwrap_or("Risk assessment unavailable.")
        .to_string();
    let recommended_action = parsed["recommended_action"]
        .as_str()
        .unwrap_or("Review this entity with your compliance team.")
        .to_string();

    Ok((ai_summary, recommended_action))
}

/// Answer a user question with full context of current scan results.
/// Returns the AI response string.
pub async fn chat_with_context(
    client: &Client,
    message: &str,
    fraud_context: Option<&str>,
    sanctions_context: Option<&str>,
    geo_context: Option<&str>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let fraud_section = fraud_context
        .map(|s| format!("FRAUD SCAN RESULTS:\n{}", s))
        .unwrap_or_else(|| "FRAUD SCAN RESULTS: No fraud scan data available.".to_string());

    let sanctions_section = sanctions_context
        .map(|s| format!("SANCTIONS SCREENING RESULTS:\n{}", s))
        .unwrap_or_else(|| "SANCTIONS SCREENING RESULTS: No sanctions scan data available.".to_string());

    let geo_section = geo_context
        .map(|s| format!("GEOPOLITICAL RISK RESULTS:\n{}", s))
        .unwrap_or_else(|| "GEOPOLITICAL RISK RESULTS: No geo-risk data available.".to_string());

    let prompt = format!(
        "You are ShieldAI, a compliance assistant. Answer the user's question using \
        ONLY the data provided below. Be concise (2-4 sentences). Be specific — \
        reference actual vendors, scores, and risk levels from the data. \
        If the data does not contain enough information to answer, say so briefly.\n\n\
        {}\n\n{}\n\n{}\n\n\
        User question: {}",
        fraud_section, sanctions_section, geo_section, message
    );

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are ShieldAI, a compliance AI assistant. \
                        Answer questions about the provided scan data concisely and professionally. \
                        Never make up data not present in the context."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 500,
            "temperature": 0.3
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let message_val = &resp["choices"][0]["message"];
    let text = message_val["content"]
        .as_str()
        .or_else(|| message_val["reasoning"].as_str())
        .unwrap_or("I could not generate a response. Please try again.")
        .trim()
        .to_string();

    Ok(text)
}

pub async fn analyze_business_risk(
    client: &Client,
    business_description: &str,
    sanctions_hits: &[SanctionsHit],
    conflict_events: &[ConflictEvent],
) -> Result<BusinessRiskReport, Box<dyn std::error::Error + Send + Sync>> {
    let prompt = build_risk_prompt(business_description, sanctions_hits, conflict_events);

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a geopolitical risk analyst. Return only valid JSON."
                },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 600,
            "temperature": 0.2
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let message = &resp["choices"][0]["message"];
    let text = message["content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
        .unwrap_or("")
        .trim();

    let clean = text
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: serde_json::Value = serde_json::from_str(clean)?;

    Ok(BusinessRiskReport {
        business_description: business_description.to_string(),
        overall_risk_level: parsed["overall_risk_level"]
            .as_str()
            .unwrap_or("LOW")
            .to_string(),
        sanctions_hits: sanctions_hits.to_vec(),
        conflict_events: conflict_events.to_vec(),
        recommendations: parsed["recommendations"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|r| r.as_str().map(String::from))
            .collect(),
        ai_summary: parsed["ai_summary"].as_str().unwrap_or("").to_string(),
    })
}
