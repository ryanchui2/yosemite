use reqwest::Client;
use serde_json::json;

use crate::models::fraud::FraudReportSummaryContent;
use crate::models::risk::{BusinessRiskReport, ConflictEvent, SanctionsHit};
use crate::models::fraud::{GeoRiskResult, SanctionsResult};

const MODEL: &str = "openai/gpt-oss-120b";

fn hf_base_url() -> String {
    std::env::var("HF_BASE_URL")
        .unwrap_or_else(|_| "https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1".to_string())
}

fn hf_api_key() -> String {
    std::env::var("HF_API_KEY").unwrap_or_default()
}

pub async fn explain_fraud(
    triggered_rules: &[String],
    transaction_id: &str,
    risk_score: u32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
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
    report_context: &str,
) -> Result<FraudReportSummaryContent, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
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

pub async fn screen_entities(
    names: &[String],
) -> Result<Vec<SanctionsResult>, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let names_list = names
        .iter()
        .enumerate()
        .map(|(i, n)| format!("{}. {}", i + 1, n))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "You are an AML compliance analyst. Screen the following entities against known sanctions \
        patterns and lists (OFAC SDN, EU Consolidated, UN, FATF High-Risk).\n\n\
        Entities to screen:\n{}\n\n\
        Return a JSON array with one object per entity in order:\n\
        [\n  {{\n    \
          \"uploaded_name\": \"<original name>\",\n    \
          \"matched_name\": \"<closest match or same if none>\",\n    \
          \"confidence\": <0.0-1.0>,\n    \
          \"risk_level\": \"HIGH|MEDIUM|LOW\",\n    \
          \"sanctions_list\": \"<OFAC SDN|EU Consolidated|UN|FATF High-Risk|None>\",\n    \
          \"reason\": \"<brief reason or 'No match found'>\",\n    \
          \"ai_explanation\": \"<1-2 sentence professional explanation>\",\n    \
          \"action\": \"<Block|Enhanced Due Diligence|Clear>\"\n  \
        }}\n]\nReturn only the JSON array. No markdown.",
        names_list
    );

    let resp = client
        .post(format!("{}/chat/completions", hf_base_url()))
        .header("Authorization", format!("Bearer {}", hf_api_key()))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": MODEL,
            "messages": [
                { "role": "system", "content": "You are an AML compliance analyst. Return only valid JSON arrays, no markdown." },
                { "role": "user", "content": prompt }
            ],
            "max_tokens": 1200,
            "temperature": 0.1
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
    let results = serde_json::from_str::<Vec<SanctionsResult>>(&normalized)?;
    Ok(results)
}

pub async fn analyze_geo_risk(
    countries: &[String],
) -> Result<Vec<GeoRiskResult>, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
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
    entity_name: &str,
    hits: &[crate::models::risk::SanctionsHit],
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();

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

pub async fn analyze_business_risk(
    business_description: &str,
    sanctions_hits: &[SanctionsHit],
    conflict_events: &[ConflictEvent],
) -> Result<BusinessRiskReport, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
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
