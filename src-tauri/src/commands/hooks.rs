use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn claude_settings_path() -> PathBuf {
    dirs::home_dir().unwrap().join(".claude").join("settings.json")
}

fn hook_script_path() -> PathBuf {
    dirs::home_dir()
        .unwrap()
        .join(".claude")
        .join("hooks")
        .join("kujira-status.sh")
}

const HOOK_SCRIPT: &str = r#"#!/bin/bash
[ -z "$KUJIRA_PTY_ID" ] && exit 0
STATUS_DIR="$HOME/.kujira/status"
mkdir -p "$STATUS_DIR"
echo "$1" > "$STATUS_DIR/claude-status-$KUJIRA_PTY_ID"
"#;

#[derive(Serialize)]
pub struct HookSetupStatus {
    pub installed: bool,
}

#[tauri::command]
pub fn hooks_check() -> HookSetupStatus {
    let script = hook_script_path();
    let settings = claude_settings_path();

    if !script.exists() {
        return HookSetupStatus { installed: false };
    }
    if !settings.exists() {
        return HookSetupStatus { installed: false };
    }

    // Check if settings.json contains our hooks
    if let Ok(content) = fs::read_to_string(&settings) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            let has_hooks = json["hooks"]["PreToolUse"]
                .as_array()
                .map(|arr| {
                    arr.iter().any(|h| {
                        h["hooks"]
                            .as_array()
                            .map(|hooks| {
                                hooks.iter().any(|hook| {
                                    hook["command"]
                                        .as_str()
                                        .map(|c| c.contains("kujira-status.sh"))
                                        .unwrap_or(false)
                                })
                            })
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            return HookSetupStatus {
                installed: has_hooks,
            };
        }
    }

    HookSetupStatus { installed: false }
}

#[tauri::command]
pub fn hooks_install() -> Result<String, String> {
    // 1. Create hook script
    let script_path = hook_script_path();
    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&script_path, HOOK_SCRIPT).map_err(|e| e.to_string())?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        fs::set_permissions(&script_path, perms).map_err(|e| e.to_string())?;
    }

    // 2. Update ~/.claude/settings.json
    let settings_path = claude_settings_path();
    let mut json: Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        serde_json::json!({})
    };

    let script_str = script_path.to_string_lossy().to_string();

    let w = format!("{} working", script_str);
    let i = format!("{} idle", script_str);
    let p = format!("{} pending", script_str);

    let working_hook = serde_json::json!([{
        "hooks": [{ "type": "command", "command": w }]
    }]);
    let idle_hook = serde_json::json!([{
        "hooks": [{ "type": "command", "command": i }]
    }]);
    let notification_hooks = serde_json::json!([
        {
            "matcher": "permission_prompt",
            "hooks": [{ "type": "command", "command": p }]
        },
        {
            "matcher": "idle_prompt",
            "hooks": [{ "type": "command", "command": i }]
        }
    ]);

    // Merge into existing hooks (preserve other hooks)
    let hooks = json
        .as_object_mut()
        .ok_or("Invalid settings.json")?
        .entry("hooks")
        .or_insert(serde_json::json!({}));

    let hooks_obj = hooks
        .as_object_mut()
        .ok_or("hooks is not an object")?;

    hooks_obj.insert("UserPromptSubmit".to_string(), working_hook.clone());
    hooks_obj.insert("PreToolUse".to_string(), working_hook.clone());
    hooks_obj.insert("PostToolUse".to_string(), working_hook);
    hooks_obj.insert("Stop".to_string(), idle_hook);
    hooks_obj.insert("Notification".to_string(), notification_hooks);

    let pretty = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(&settings_path, pretty).map_err(|e| e.to_string())?;

    Ok("Hooks installed".to_string())
}

/// Returns the status directory path for polling
pub fn status_dir() -> PathBuf {
    dirs::home_dir().unwrap().join(".kujira").join("status")
}

/// Poll status files and return map of pty_id -> status
pub fn poll_status() -> std::collections::HashMap<String, String> {
    let dir = status_dir();
    let mut result = std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(pty_id) = name.strip_prefix("claude-status-") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    let status = content.trim().to_string();
                    if status == "working" || status == "idle" || status == "pending" {
                        result.insert(pty_id.to_string(), status);
                    }
                }
            }
        }
    }

    result
}
