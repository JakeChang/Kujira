use chrono::{Datelike, Duration, Local};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ── Local cost tracking (from JSONL logs) ──

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeUsage {
    pub today_tokens: u64,
    pub month_tokens: u64,
    pub today_input: u64,
    pub today_output: u64,
    pub available: bool,
}

fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

fn tokens_from_entry(val: &serde_json::Value) -> (u64, u64, u64, u64) {
    let Some(msg) = val.get("message") else { return (0, 0, 0, 0) };
    let Some(usage) = msg.get("usage") else { return (0, 0, 0, 0) };
    let inp = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let out = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let cache_w = usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let cache_r = usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    (inp, out, cache_w, cache_r)
}

fn collect_jsonl_files(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

// ── Daily usage rollup with incremental cache ──

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelBucket {
    pub input: u64,
    pub output: u64,
    pub cache_write: u64,
    pub cache_read: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DayBucket {
    pub by_model: BTreeMap<String, ModelBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct FileState {
    mtime_ms: i64,
    offset: u64,
    partial: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionMeta {
    pub session_id: String,
    pub cwd: String,
    pub branch: Option<String>,
    pub first_ts: String,
    pub last_ts: String,
    pub user_messages: u32,
    pub assistant_messages: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_tokens: u64,
    pub cost_usd: f64,
    pub last_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct UsageCache {
    version: u32,
    files: BTreeMap<String, FileState>,
    days: BTreeMap<String, DayBucket>,
    sessions: BTreeMap<String, SessionMeta>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyUsage {
    pub date: String,
    pub input: u64,
    pub output: u64,
    pub cache: u64,
    pub total: u64,
    pub cost_usd: f64,
}

const CACHE_VERSION: u32 = 3;

// Per-million-token USD list pricing for (input, output, cache_write, cache_read).
// Source: claude.com/pricing (verified 2026-04). Update here when Anthropic changes prices.
fn model_pricing(model: &str) -> (f64, f64, f64, f64) {
    let m = model.to_lowercase();
    // Opus: version-sensitive. 4.5+ cut prices ~3× vs Opus 4/4.1.
    if m.contains("opus") {
        if m.contains("opus-4-5") || m.contains("opus-4-6") || m.contains("opus-4.5") || m.contains("opus-4.6") {
            return (5.0, 25.0, 6.25, 0.50);
        }
        // Opus 4 / 4.1 / earlier
        return (15.0, 75.0, 18.75, 1.50);
    }
    // Haiku: 4.5 is substantially more expensive than Haiku 3.
    if m.contains("haiku") {
        if m.contains("haiku-4") {
            return (1.0, 5.0, 1.25, 0.10);
        }
        // Haiku 3 / 3.5
        return (0.25, 1.25, 0.30, 0.03);
    }
    // Sonnet (all versions 3.5 / 4 / 4.5 / 4.6 share the same tier) — default.
    (3.0, 15.0, 3.75, 0.30)
}

fn cost_of(model: &str, b: &ModelBucket) -> f64 {
    let (p_in, p_out, p_cw, p_cr) = model_pricing(model);
    (b.input as f64 * p_in
        + b.output as f64 * p_out
        + b.cache_write as f64 * p_cw
        + b.cache_read as f64 * p_cr)
        / 1_000_000.0
}

fn cache_path() -> PathBuf {
    let dir = dirs::home_dir()
        .map(|h| h.join(".kujira"))
        .unwrap_or_else(|| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir.join("usage-cache.json")
}

fn load_cache() -> UsageCache {
    let parsed: UsageCache = fs::read_to_string(cache_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    // Schema migration: wipe everything and rebuild from JSONL on version mismatch.
    if parsed.version != CACHE_VERSION {
        return UsageCache { version: CACHE_VERSION, ..Default::default() };
    }
    parsed
}

fn save_cache(cache: &UsageCache) {
    if let Ok(json) = serde_json::to_string(cache) {
        let _ = fs::write(cache_path(), json);
    }
}

fn process_line(
    line: &str,
    days: &mut BTreeMap<String, DayBucket>,
    sessions: &mut BTreeMap<String, SessionMeta>,
) {
    if line.trim().is_empty() {
        return;
    }
    let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else { return };

    let timestamp = val
        .get("timestamp")
        .or_else(|| val.get("ts"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if timestamp.len() < 10 {
        return;
    }

    let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let session_id = val
        .get("sessionId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let cwd = val
        .get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let branch = val
        .get("gitBranch")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);

    // Update session meta (create on first sight, extend thereafter).
    if !session_id.is_empty() {
        let sess = sessions.entry(session_id.clone()).or_insert_with(|| SessionMeta {
            session_id: session_id.clone(),
            cwd: cwd.clone(),
            branch: branch.clone(),
            first_ts: timestamp.to_string(),
            last_ts: timestamp.to_string(),
            ..Default::default()
        });
        if timestamp < sess.first_ts.as_str() { sess.first_ts = timestamp.to_string(); }
        if timestamp > sess.last_ts.as_str() { sess.last_ts = timestamp.to_string(); }
        if sess.cwd.is_empty() && !cwd.is_empty() { sess.cwd = cwd; }
        if sess.branch.is_none() { sess.branch = branch; }
        match entry_type {
            "user" => sess.user_messages += 1,
            "assistant" => sess.assistant_messages += 1,
            _ => {}
        }
    }

    let (inp, out, cache_w, cache_r) = tokens_from_entry(&val);
    if inp + out + cache_w + cache_r == 0 {
        return;
    }

    let model = val
        .get("message")
        .and_then(|m| m.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // Per-session token + cost accumulation.
    if !session_id.is_empty() {
        if let Some(sess) = sessions.get_mut(&session_id) {
            sess.input_tokens += inp;
            sess.output_tokens += out;
            sess.cache_tokens += cache_w + cache_r;
            let bucket = ModelBucket {
                input: inp,
                output: out,
                cache_write: cache_w,
                cache_read: cache_r,
            };
            sess.cost_usd += cost_of(&model, &bucket);
            sess.last_model = Some(model.clone());
        }
    }

    let date = &timestamp[..10];
    let day = days.entry(date.to_string()).or_default();
    let bucket = day.by_model.entry(model).or_default();
    bucket.input += inp;
    bucket.output += out;
    bucket.cache_write += cache_w;
    bucket.cache_read += cache_r;
}

fn ingest_file(
    path: &Path,
    state: &mut FileState,
    days: &mut BTreeMap<String, DayBucket>,
    sessions: &mut BTreeMap<String, SessionMeta>,
) {
    let Ok(meta) = fs::metadata(path) else { return };
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let size = meta.len();

    // File shrunk → assume rewrite, restart from 0
    if size < state.offset {
        state.offset = 0;
        state.partial.clear();
    }
    if mtime_ms == state.mtime_ms && size == state.offset {
        return;
    }

    let Ok(mut file) = fs::File::open(path) else { return };
    if file.seek(SeekFrom::Start(state.offset)).is_err() {
        return;
    }

    let mut buf = String::new();
    if file.read_to_string(&mut buf).is_err() {
        return;
    }

    let combined = std::mem::take(&mut state.partial) + &buf;
    let mut last_newline = 0usize;
    for (i, ch) in combined.char_indices() {
        if ch == '\n' {
            process_line(&combined[last_newline..i], days, sessions);
            last_newline = i + 1;
        }
    }
    state.partial = combined[last_newline..].to_string();
    state.offset = size;
    state.mtime_ms = mtime_ms;
}

fn read_daily_usage_blocking(days_back: i64) -> Vec<DailyUsage> {
    let projects = expand_tilde("~/.claude/projects");
    if !projects.exists() {
        return Vec::new();
    }

    let mut cache = load_cache();
    let mut files = Vec::new();
    collect_jsonl_files(&projects, &mut files);

    let alive: std::collections::HashSet<String> =
        files.iter().filter_map(|p| p.to_str().map(String::from)).collect();
    cache.files.retain(|k, _| alive.contains(k));

    for path in &files {
        let Some(key) = path.to_str().map(String::from) else { continue };
        let state = cache.files.entry(key).or_default();
        ingest_file(path, state, &mut cache.days, &mut cache.sessions);
    }

    save_cache(&cache);

    // Build last N days, filling gaps with zeros, summing across all models.
    let today = Local::now().date_naive();
    let mut out = Vec::with_capacity(days_back as usize);
    for offset in (0..days_back).rev() {
        let d = today - Duration::days(offset);
        let key = d.format("%Y-%m-%d").to_string();
        let day = cache.days.get(&key);

        let (mut input, mut output, mut cache_w, mut cache_r, mut cost) = (0u64, 0u64, 0u64, 0u64, 0.0);
        if let Some(day) = day {
            for (model, b) in &day.by_model {
                input += b.input;
                output += b.output;
                cache_w += b.cache_write;
                cache_r += b.cache_read;
                cost += cost_of(model, b);
            }
        }

        out.push(DailyUsage {
            date: key,
            input,
            output,
            cache: cache_w + cache_r,
            total: input + output + cache_w + cache_r,
            cost_usd: cost,
        });
    }
    out
}

fn read_sessions_blocking(cwd_filter: Option<String>, limit: usize) -> Vec<SessionMeta> {
    let projects = expand_tilde("~/.claude/projects");
    if !projects.exists() {
        return Vec::new();
    }

    let mut cache = load_cache();
    let mut files = Vec::new();
    collect_jsonl_files(&projects, &mut files);

    let alive: std::collections::HashSet<String> =
        files.iter().filter_map(|p| p.to_str().map(String::from)).collect();
    cache.files.retain(|k, _| alive.contains(k));

    for path in &files {
        let Some(key) = path.to_str().map(String::from) else { continue };
        let state = cache.files.entry(key).or_default();
        ingest_file(path, state, &mut cache.days, &mut cache.sessions);
    }

    save_cache(&cache);

    let mut list: Vec<SessionMeta> = cache
        .sessions
        .values()
        .filter(|s| {
            if let Some(filter) = &cwd_filter {
                s.cwd == *filter || s.cwd.starts_with(&format!("{filter}/"))
            } else {
                true
            }
        })
        .cloned()
        .collect();
    list.sort_by(|a, b| b.last_ts.cmp(&a.last_ts));
    list.truncate(limit);
    list
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionMessage {
    pub timestamp: String,
    pub role: String,      // "user" | "assistant" | "tool_use" | "tool_result" | "system"
    pub text: String,      // flattened text for display / search
    pub tool_name: Option<String>,
}

fn extract_text_blocks(content: &serde_json::Value) -> (String, Option<String>) {
    // Returns (flattened text, first tool_name if any)
    let mut text = String::new();
    let mut tool: Option<String> = None;

    let push = |text: &mut String, s: &str| {
        if !text.is_empty() { text.push_str("\n"); }
        text.push_str(s);
    };

    match content {
        serde_json::Value::String(s) => push(&mut text, s),
        serde_json::Value::Array(arr) => {
            for block in arr {
                let btype = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match btype {
                    "text" => {
                        if let Some(s) = block.get("text").and_then(|v| v.as_str()) {
                            push(&mut text, s);
                        }
                    }
                    "thinking" => {
                        if let Some(s) = block.get("thinking").and_then(|v| v.as_str()) {
                            push(&mut text, &format!("[thinking] {s}"));
                        }
                    }
                    "tool_use" => {
                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                        tool.get_or_insert_with(|| name.to_string());
                        let input = block.get("input").map(|v| v.to_string()).unwrap_or_default();
                        push(&mut text, &format!("[tool:{name}] {input}"));
                    }
                    "tool_result" => {
                        let body = block.get("content")
                            .map(|c| match c {
                                serde_json::Value::String(s) => s.clone(),
                                _ => c.to_string(),
                            })
                            .unwrap_or_default();
                        push(&mut text, &format!("[tool_result] {body}"));
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
    (text, tool)
}

fn read_session_messages_blocking(session_id: String) -> Vec<SessionMessage> {
    let projects = expand_tilde("~/.claude/projects");
    if !projects.exists() {
        return Vec::new();
    }
    let mut files = Vec::new();
    collect_jsonl_files(&projects, &mut files);

    let mut out = Vec::new();
    for path in files {
        let Ok(content) = fs::read_to_string(&path) else { continue };
        for line in content.lines() {
            if line.trim().is_empty() { continue; }
            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            let sid = val.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
            if sid != session_id { continue; }

            let entry_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let timestamp = val.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !matches!(entry_type, "user" | "assistant") { continue; }

            let (text, tool) = val
                .get("message")
                .and_then(|m| m.get("content"))
                .map(extract_text_blocks)
                .unwrap_or_default();

            if text.is_empty() { continue; }

            out.push(SessionMessage {
                timestamp,
                role: entry_type.to_string(),
                text,
                tool_name: tool,
            });
        }
    }
    out.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    out
}

#[tauri::command]
pub async fn claude_session_messages(session_id: String) -> Result<Vec<SessionMessage>, String> {
    tokio::task::spawn_blocking(move || read_session_messages_blocking(session_id))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn claude_sessions_list(
    cwd: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<SessionMeta>, String> {
    let n = limit.unwrap_or(20).clamp(1, 200) as usize;
    tokio::task::spawn_blocking(move || read_sessions_blocking(cwd, n))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn claude_daily_usage_read(days: Option<u32>) -> Result<Vec<DailyUsage>, String> {
    let n = days.unwrap_or(14).clamp(1, 90) as i64;
    tokio::task::spawn_blocking(move || read_daily_usage_blocking(n))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn claude_usage_read(
    usage_log_path: String,
    _monthly_budget: f64,
) -> Result<ClaudeUsage, String> {
    let configured = expand_tilde(&usage_log_path);
    let projects = expand_tilde("~/.claude/projects");
    let base_path = if projects.exists() {
        projects
    } else if configured.exists() {
        configured
    } else {
        return Ok(ClaudeUsage {
            today_tokens: 0,
            month_tokens: 0,
            today_input: 0,
            today_output: 0,
            available: false,
        });
    };

    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    let current_month = now.month();
    let current_year = now.year();

    let mut today_input = 0u64;
    let mut today_output = 0u64;
    let mut today_cache = 0u64;
    let mut month_total = 0u64;

    let mut files = Vec::new();
    collect_jsonl_files(&base_path, &mut files);

    for path in files {
        let Ok(content) = fs::read_to_string(&path) else { continue };
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else { continue };

            let timestamp = val
                .get("timestamp")
                .or_else(|| val.get("ts"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if timestamp.len() < 10 {
                continue;
            }

            let (inp, out, cache_w, cache_r) = tokens_from_entry(&val);
            let total = inp + out + cache_w + cache_r;
            if total == 0 {
                continue;
            }

            if timestamp.starts_with(&today) {
                today_input += inp;
                today_output += out;
                today_cache += cache_w + cache_r;
            }

            if let Ok(date) = chrono::NaiveDate::parse_from_str(&timestamp[..10], "%Y-%m-%d") {
                if date.month() == current_month && date.year() == current_year {
                    month_total += total;
                }
            }
        }
    }

    Ok(ClaudeUsage {
        today_tokens: today_input + today_output + today_cache,
        month_tokens: month_total,
        today_input,
        today_output,
        available: true,
    })
}

// ── Claude.ai API quota ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeQuota {
    pub session_utilization: f64,
    pub weekly_utilization: f64,
    pub sonnet_utilization: Option<f64>,
    pub session_resets_at: Option<f64>,
    pub weekly_resets_at: Option<f64>,
    pub sonnet_resets_at: Option<f64>,
    pub last_updated: f64,
    pub is_logged_in: bool,
}

fn cookie_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("kujira");
    let _ = fs::create_dir_all(&dir);
    dir.join("claude-cookies.txt")
}

fn load_cookies() -> Option<String> {
    fs::read_to_string(cookie_path())
        .ok()
        .filter(|s| !s.trim().is_empty())
}

/// Open login window — created from Rust for reliability
#[tauri::command]
pub async fn claude_open_login(app: AppHandle) -> Result<(), String> {
    // If a window with the same label already exists (e.g. a hidden cleanup
    // window from claude_clear_session), destroy it and wait until it's
    // really gone before re-creating, otherwise the new build() fails.
    if let Some(w) = app.get_webview_window("claude-login") {
        let _ = w.destroy();
        for _ in 0..40 {
            if app.get_webview_window("claude-login").is_none() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        "claude-login",
        tauri::WebviewUrl::External("https://claude.ai/login".parse().unwrap()),
    )
    .title("Login to Claude")
    .inner_size(480.0, 640.0)
    .center()
    .build()
    .map_err(|e| format!("Failed to create login window: {e}"))?;

    Ok(())
}

/// Check login window URL — called from frontend polling
#[tauri::command]
pub fn claude_check_login_url(app: AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("claude-login")
        .ok_or("Login window not found")?;
    let url = window.url().map_err(|e| e.to_string())?;
    Ok(url.to_string())
}

/// Extract cookies from the Tauri login webview's own cookie store.
/// macOS WKWebView keeps its cookies in WKHTTPCookieStorage (separate from
/// the global NSHTTPCookieStorage), so we must ask the webview directly.
#[tauri::command]
pub async fn claude_extract_cookies(app: AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("claude-login") else {
        return Ok(false);
    };

    let url: tauri::Url = "https://claude.ai".parse().map_err(|e| format!("{e}"))?;
    let cookies = window.cookies_for_url(url).map_err(|e| e.to_string())?;

    if cookies.is_empty() {
        return Ok(false);
    }

    let header = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");

    fs::write(cookie_path(), &header).map_err(|e| e.to_string())?;

    // Verify cookies actually work before declaring success — otherwise
    // we'd flag logged_in and immediately 401 on the first quota fetch.
    let client = reqwest::Client::new();
    let resp = client
        .get("https://claude.ai/api/organizations")
        .header("Cookie", &header)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
        let _ = fs::remove_file(cookie_path());
        return Ok(false);
    }

    let _ = window.close();
    Ok(true)
}

/// Check if stored cookies exist
#[tauri::command]
pub fn claude_has_session() -> bool {
    load_cookies().is_some()
}

/// Clear session — removes local cookie file AND wipes the WKWebView's
/// persistent data store (cookies, localStorage, etc.) so the next login
/// window opens to a logged-out state. `delete_cookie` alone is unreliable
/// on macOS because Anthropic sets HttpOnly cookies on multiple paths;
/// `clear_all_browsing_data` nukes WKWebsiteDataStore wholesale.
#[tauri::command]
pub async fn claude_clear_session(app: AppHandle) -> Result<(), String> {
    let p = cookie_path();
    if p.exists() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }

    let (window, spawned) = match app.get_webview_window("claude-login") {
        Some(w) => (w, false),
        None => {
            let w = tauri::WebviewWindowBuilder::new(
                &app,
                "claude-login",
                tauri::WebviewUrl::External("https://claude.ai".parse().unwrap()),
            )
            .title("Clearing session")
            .inner_size(1.0, 1.0)
            .position(-9999.0, -9999.0)
            .visible(false)
            .build()
            .map_err(|e| format!("Failed to create cleanup window: {e}"))?;
            (w, true)
        }
    };

    window
        .clear_all_browsing_data()
        .map_err(|e| format!("clear_all_browsing_data: {e}"))?;

    if spawned {
        let _ = window.destroy();
        for _ in 0..40 {
            if app.get_webview_window("claude-login").is_none() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }
    Ok(())
}

/// Fetch quota from claude.ai using stored cookies
#[tauri::command]
pub async fn claude_quota_read() -> Result<ClaudeQuota, String> {
    let cookies = load_cookies().ok_or("Not logged in")?;

    let client = reqwest::Client::new();
    let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

    // Get org ID
    let orgs_resp = client
        .get("https://claude.ai/api/organizations")
        .header("Cookie", &cookies)
        .header("User-Agent", ua)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network: {e}"))?;

    if orgs_resp.status().as_u16() == 401 || orgs_resp.status().as_u16() == 403 {
        let _ = fs::remove_file(cookie_path());
        return Err("Session expired".to_string());
    }

    let orgs: Vec<serde_json::Value> = orgs_resp
        .json()
        .await
        .map_err(|e| format!("Parse: {e}"))?;

    let org_id = orgs
        .first()
        .and_then(|o| {
            o.get("uuid")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .or_else(|| o.get("id").map(|v| v.to_string()))
        })
        .ok_or("No organization")?;

    // Get usage
    let usage_resp = client
        .get(format!(
            "https://claude.ai/api/organizations/{org_id}/usage"
        ))
        .header("Cookie", &cookies)
        .header("User-Agent", ua)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network: {e}"))?;

    let usage: serde_json::Value = usage_resp
        .json()
        .await
        .map_err(|e| format!("Parse: {e}"))?;

    let parse_window = |key: &str| -> (f64, Option<f64>) {
        usage.get(key).map_or((0.0, None), |w| {
            let mut util = w
                .get("utilization")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if util >= 1.0 {
                util = (util / 100.0).min(1.0);
            }
            util = util.clamp(0.0, 1.0);

            let resets = w.get("resets_at").and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_i64().map(|i| i as f64))
                    .or_else(|| {
                        v.as_str().and_then(|s| {
                            chrono::DateTime::parse_from_rfc3339(s)
                                .ok()
                                .map(|d| d.timestamp() as f64)
                        })
                    })
            });
            (util, resets)
        })
    };

    let (su, sr) = parse_window("five_hour");
    let (wu, wr) = parse_window("seven_day");
    let (sonu, sonr) = parse_window("seven_day_sonnet");
    let has_sonnet = usage.get("seven_day_sonnet").is_some();

    Ok(ClaudeQuota {
        session_utilization: su,
        weekly_utilization: wu,
        sonnet_utilization: if has_sonnet { Some(sonu) } else { None },
        session_resets_at: sr,
        weekly_resets_at: wr,
        sonnet_resets_at: if has_sonnet { sonr } else { None },
        last_updated: chrono::Utc::now().timestamp() as f64,
        is_logged_in: true,
    })
}
