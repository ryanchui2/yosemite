use reqwest::Client;
use serde_json::Value;

use crate::models::risk::SanctionsHit;

pub async fn search(client: &Client, query: &str, api_key: &str) -> Vec<SanctionsHit> {
    let url = format!(
        "https://api.opensanctions.org/search/default?q={}&limit=10",
        urlencoding::encode(query)
    );

    let mut req = client
        .get(&url)
        .header("Accept", "application/json");

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("ApiKey {}", api_key));
    }

    let resp = req.send().await;

    match resp {
        Ok(r) => match r.json::<Value>().await {
            Ok(v) => parse_sanctions(v),
            Err(_) => vec![],
        },
        Err(_) => vec![],
    }
}

fn parse_sanctions(v: Value) -> Vec<SanctionsHit> {
    v["results"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|r| SanctionsHit {
            name: r["caption"].as_str().unwrap_or("").to_string(),
            country: r["properties"]["country"][0]
                .as_str()
                .map(String::from),
            topics: r["topics"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|t| t.as_str().map(String::from))
                .collect(),
            score: r["score"].as_f64().unwrap_or(0.0),
        })
        .filter(|h| h.score > 0.5)
        .collect()
}
