use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Serialize, Deserialize)]
pub struct GeminiSuggestion {
    pub command: String,
    pub explanation: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub query: String,
    pub command: String,
}

#[tauri::command]
pub async fn gemini_suggest(
    query: String,
    cwd: String,
    api_key: String,
    history: Vec<ChatTurn>,
) -> Result<GeminiSuggestion, String> {
    if api_key.is_empty() {
        return Err("Gemini API Key 未設定".to_string());
    }

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key={}",
        api_key
    );

    // Build multi-turn contents from history
    let mut contents = Vec::new();
    for turn in &history {
        contents.push(json!({
            "role": "user",
            "parts": [{ "text": format!("[cwd: {}] {}", cwd, turn.query) }]
        }));
        contents.push(json!({
            "role": "model",
            "parts": [{ "text": format!("{{\"command\":\"{}\",\"explanation\":\"\"}}", turn.command) }]
        }));
    }
    // Current query
    contents.push(json!({
        "role": "user",
        "parts": [{ "text": format!("[cwd: {}] {}", cwd, query) }]
    }));

    let body = json!({
        "systemInstruction": {
            "parts": [{ "text": "You convert natural language to shell commands. OS: macOS, shell: zsh. Reply ONLY with a JSON object: {\"command\":\"...\",\"explanation\":\"...\"}. The explanation must be in the same language as the user's input. No markdown, no code fences, no other text. You can reference previous commands in the conversation for context." }]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 256
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let short = &body[..body.len().min(300)];
        return Err(format!("API {} : {}", status, short));
    }

    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let candidates = resp_json["candidates"].as_array()
        .ok_or("No candidates in response")?;

    let mut text: Option<&str> = None;
    if let Some(candidate) = candidates.first() {
        if let Some(parts) = candidate["content"]["parts"].as_array() {
            for part in parts.iter().rev() {
                if part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false) {
                    continue;
                }
                if let Some(t) = part["text"].as_str() {
                    text = Some(t);
                    break;
                }
            }
        }
    }

    let text = text.ok_or_else(|| {
        let raw = serde_json::to_string(&resp_json).unwrap_or_default();
        format!("No text in response: {}", &raw[..raw.len().min(300)])
    })?;

    let cleaned = text.trim();
    let json_str = if let Some(start) = cleaned.find('{') {
        if let Some(end) = cleaned.rfind('}') {
            &cleaned[start..=end]
        } else {
            cleaned
        }
    } else {
        cleaned
    };

    let suggestion: GeminiSuggestion = serde_json::from_str(json_str)
        .map_err(|e| format!("Parse error: {} | raw: {}", e, &cleaned[..cleaned.len().min(200)]))?;

    if suggestion.command.is_empty() {
        return Err("AI returned empty command".to_string());
    }

    Ok(suggestion)
}
