use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Deserialize, Type)]
pub struct EadFetchInput {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Type)]
pub struct EadFetchOutput {
    pub status: u16,
    pub body: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn headers(rows: &[(String, String)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (k, v) in rows {
        let name = HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(v).map_err(|e| e.to_string())?;
        map.append(name, value);
    }
    Ok(map)
}

/// Bypass macOS WKWebView / tauri-plugin-http JSON parsing quirks for EAD API calls.
#[tauri::command]
#[specta::specta]
pub async fn ead_fetch(input: EadFetchInput) -> Result<EadFetchOutput, String> {
    perform(&input).await
}

async fn perform(input: &EadFetchInput) -> Result<EadFetchOutput, String> {
    let method = reqwest::Method::from_bytes(input.method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client()?.request(method, &input.url);
    req = req.headers(headers(&input.headers)?);
    if let Some(body) = &input.body {
        req = req.body(body.clone());
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(EadFetchOutput { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn login_returns_token_json() {
        let body = r#"{"loginMethod":"password","identifier":"tierenz","password":"dHoxMjM0NTY="}"#.to_string();
        let out = perform(&EadFetchInput {
            url: "https://eadfm.com/api/auth/login".to_string(),
            method: "POST".to_string(),
            headers: vec![
                ("Accept".to_string(), "application/json".to_string()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ],
            body: Some(body),
        })
        .await
        .expect("ead login fetch");

        assert_eq!(out.status, 200);
        assert!(
            out.body.contains("\"success\":true"),
            "body: {}",
            &out.body[..out.body.len().min(200)]
        );
        assert!(
            out.body.contains("\"token\""),
            "body: {}",
            &out.body[..out.body.len().min(200)]
        );
    }
}
