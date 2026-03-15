use reqwest::Client;
use serde_json::json;

use crate::models::fraud::{FraudReportSummaryContent, GeoRiskResult};
use crate::models::risk::{BusinessRiskReport, ConflictEvent, SanctionsHit};

fn gemini_api_key() -> String {
    std::env::var("GEMINI_API_KEY").unwrap_or_default()
}

fn gemini_url(model: &str) -> String {
    format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model,
        gemini_api_key()
    )
}

async fn gemini_complete(
    client: &Client,
    prompt: &str,
    max_tokens: u32,
    temperature: f32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let url = gemini_url("gemini-2.5-flash");
    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature
        }
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    // Gemini 2.5 Flash (thinking model) returns multiple parts: thinking first, answer last.
    // Find the last part that has a non-empty "text" field.
    let parts = resp["candidates"][0]["content"]["parts"]
        .as_array()
        .ok_or_else(|| format!("No parts in Gemini response: {}", resp))?;

    let text = parts
        .iter()
        .rev()
        .find_map(|p| p["text"].as_str().filter(|s| !s.trim().is_empty()))
        .ok_or_else(|| format!("No text in Gemini response: {}", resp))?
        .trim()
        .to_string();

    Ok(text)
}

pub async fn explain_fraud(
    client: &Client,
    triggered_rules: &[String],
    transaction_id: &str,
    risk_score: u32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let rules_text = triggered_rules.join(", ");
    let prompt = format!(
        "Transaction ID: {}. Risk score: {}/100. \
        Fraud signals: {}. \
        In exactly 2 short sentences: explain why it's suspicious, then state the action. \
        Under 100 words. No bullet points.",
        transaction_id, risk_score, rules_text
    );

    gemini_complete(client, &prompt, 600, 0.3).await
}

pub async fn summarize_fraud_reports(
    client: &Client,
    report_context: &str,
) -> Result<FraudReportSummaryContent, Box<dyn std::error::Error + Send + Sync>> {
    let prompt = format!(
        "You are a fraud operations analyst. Review the confirmed fraud report dataset below and produce a concise JSON summary for a dashboard card. \
        Focus only on common vulnerabilities, likely root causes, and practical improvement advice. \
        Keep each array to 2-3 short, executive-ready bullet sentences. \
        The disclaimer must clearly state that AI output may be imprecise and should be validated by analysts. \
        Return strict JSON with exactly these keys: common_vulnerabilities, potential_reasons, improvement_advice, disclaimer. \
        Each of the first three keys must be an array of strings. The disclaimer must be a single string. \
        Do not wrap the JSON in markdown.\n\nConfirmed fraud report dataset:\n{}",
        report_context
    );

    let text = gemini_complete(client, &prompt, 800, 0.2).await?;
    let normalized = normalize_json_payload(&text);
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

    let text = gemini_complete(client, &prompt, 4096, 0.2).await?;
    let normalized = normalize_json_payload(&text);

    match serde_json::from_str::<Vec<GeoRiskResult>>(&normalized) {
        Ok(results) => Ok(results),
        Err(e) => {
            let partial = extract_complete_geo_risk_objects(&normalized);
            if partial.is_empty() {
                Err(e.into())
            } else {
                tracing::warn!(
                    "Geo-risk JSON parse failed ({}), using {} partial result(s)",
                    e,
                    partial.len()
                );
                Ok(partial)
            }
        }
    }
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

    let text = gemini_complete(client, &prompt, 300, 0.2).await?;
    let clean = normalize_json_payload(&text);
    let parsed: serde_json::Value = serde_json::from_str(&clean)?;

    let risk_level = parsed["risk_level"]
        .as_str()
        .unwrap_or("LOW")
        .to_uppercase();
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

    let text = gemini_complete(client, &prompt, 400, 0.2).await?;
    let clean = normalize_json_payload(&text);
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
        {}\n\n{}\n\n{}\n\nUser question: {}",
        fraud_section, sanctions_section, geo_section, message
    );

    gemini_complete(client, &prompt, 500, 0.3).await
}

pub async fn analyze_business_risk(
    client: &Client,
    business_description: &str,
    sanctions_hits: &[SanctionsHit],
    conflict_events: &[ConflictEvent],
) -> Result<BusinessRiskReport, Box<dyn std::error::Error + Send + Sync>> {
    let sanctions_text = if sanctions_hits.is_empty() {
        "No sanctions hits found.".to_string()
    } else {
        sanctions_hits
            .iter()
            .map(|s| format!("- {} (score: {:.2}, topics: {})", s.name, s.score, s.topics.join(", ")))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let conflicts_text = if conflict_events.is_empty() {
        "No active conflict events found for specified countries.".to_string()
    } else {
        conflict_events
            .iter()
            .map(|c| format!("- {} ({}): {} deaths in {}", c.conflict_name, c.country, c.deaths_total, c.year))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let prompt = format!(
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
        business_description, sanctions_text, conflicts_text
    );

    let text = gemini_complete(client, &prompt, 600, 0.2).await?;
    let clean = normalize_json_payload(&text);
    let parsed: serde_json::Value = serde_json::from_str(&clean)?;

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

fn normalize_json_payload(payload: &str) -> String {
    payload
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}

fn extract_complete_geo_risk_objects(s: &str) -> Vec<GeoRiskResult> {
    let mut out = Vec::new();
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() {
        let start = bytes[i..].iter().position(|&b| b == b'{');
        let start = match start {
            Some(p) => i + p,
            None => break,
        };
        i = start + 1;
        let mut depth = 1u32;
        let mut in_string = false;
        let mut escape = false;
        let mut quote = b'"';
        while i < bytes.len() && depth > 0 {
            let b = bytes[i];
            if escape {
                escape = false;
                i += 1;
                continue;
            }
            if in_string {
                if b == b'\\' {
                    escape = true;
                } else if b == quote {
                    in_string = false;
                }
                i += 1;
                continue;
            }
            match b {
                b'"' | b'\'' => {
                    in_string = true;
                    quote = b;
                }
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        let slice = &s[start..=i];
                        if let Ok(obj) = serde_json::from_str::<GeoRiskResult>(slice) {
                            out.push(obj);
                        }
                    }
                }
                _ => {}
            }
            i += 1;
        }
        if depth != 0 {
            break;
        }
    }
    out
}
