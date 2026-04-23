use std::collections::HashMap;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::commands::pty::PtyState;

const TRAY_ID: &str = "kujira-tray";

/// Aggregate status from all PTY statuses.
/// Priority: working > pending > idle/none
fn aggregate_status(statuses: &HashMap<String, String>) -> &'static str {
    let mut has_pending = false;
    for status in statuses.values() {
        match status.as_str() {
            "working" => return "working",
            "pending" => has_pending = true,
            _ => {}
        }
    }
    if has_pending { "pending" } else { "idle" }
}

/// Pick the right tray icon bytes for the given aggregate status.
fn icon_for_status(status: &str) -> Image<'static> {
    let bytes: &[u8] = match status {
        "working" => include_bytes!("../icons/tray-green@2x.png"),
        "pending" => include_bytes!("../icons/tray-orange@2x.png"),
        _ => include_bytes!("../icons/tray-default@2x.png"),
    };
    Image::from_bytes(bytes).expect("failed to load tray icon")
}

/// Resolve the CWD for a PTY by its id. Returns the last path component as the project name.
fn resolve_project_name(app: &AppHandle, pty_id: &str) -> String {
    let state = app.state::<PtyState>();
    let pid = match state.get_pid(pty_id) {
        Some(p) => p,
        None => return pty_id.to_string(),
    };

    // Use lsof to get actual CWD
    let output = std::process::Command::new("lsof")
        .args(["-a", "-d", "cwd", "-p", &pid.to_string(), "-Fn"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                if let Some(path) = line.strip_prefix('n') {
                    if path.starts_with('/') {
                        // Return last path component as project name
                        return path
                            .rsplit('/')
                            .next()
                            .unwrap_or(path)
                            .to_string();
                    }
                }
            }
            pty_id.to_string()
        }
        Err(_) => pty_id.to_string(),
    }
}

fn status_label(status: &str) -> &'static str {
    match status {
        "working" => "🟢 執行中",
        "pending" => "🟠 等待中",
        "idle" => "⚪ 閒置",
        _ => "⚪ 閒置",
    }
}

/// Create the initial tray icon (called once during setup).
pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::new("Kujira").enabled(false).build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::new("沒有執行中的 Claude Code")
                .id("no-agents")
                .enabled(false)
                .build(app)?,
        )
        .build()?;

    let icon = icon_for_status("idle");

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(false)
        .tooltip("Kujira")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .build(app)?;

    Ok(())
}

/// Update the tray icon and menu based on current Claude statuses.
/// Called from the polling thread whenever statuses change.
pub fn update_tray(app: &AppHandle, statuses: &HashMap<String, String>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    // Update icon based on aggregate status
    let agg = aggregate_status(statuses);
    let icon = icon_for_status(agg);
    let _ = tray.set_icon(Some(icon));

    // Update tooltip
    let active_count = statuses
        .values()
        .filter(|s| *s == "working" || *s == "pending")
        .count();
    let tooltip = if active_count > 0 {
        format!("Kujira — {} 個 Claude 執行中", active_count)
    } else {
        "Kujira".to_string()
    };
    let _ = tray.set_tooltip(Some(&tooltip));

    // Build new menu
    let menu = match build_status_menu(app, statuses) {
        Ok(m) => m,
        Err(_) => return,
    };
    let _ = tray.set_menu(Some(menu));
}

fn build_status_menu(
    app: &AppHandle,
    statuses: &HashMap<String, String>,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let mut builder = MenuBuilder::new(app);

    builder = builder
        .item(&MenuItemBuilder::new("Kujira").enabled(false).build(app)?)
        .separator();

    // Collect active (non-idle) entries, sorted by pty_id
    let mut active: Vec<(&String, &String)> = statuses
        .iter()
        .filter(|(_, s)| s.as_str() != "idle")
        .collect();
    active.sort_by_key(|(id, _)| *id);

    if active.is_empty() {
        builder = builder.item(
            &MenuItemBuilder::new("沒有執行中的 Claude Code")
                .id("no-agents")
                .enabled(false)
                .build(app)?,
        );
    } else {
        for (pty_id, status) in &active {
            let project = resolve_project_name(app, pty_id);
            let label = format!("{} {}", status_label(status), project);
            builder = builder.item(
                &MenuItemBuilder::new(label)
                    .id(format!("agent-{}", pty_id))
                    .enabled(false)
                    .build(app)?,
            );
        }
    }

    // Also show idle ones (collapsed)
    let idle_count = statuses
        .values()
        .filter(|s| s.as_str() == "idle")
        .count();
    if idle_count > 0 && !active.is_empty() {
        builder = builder.separator();
        builder = builder.item(
            &MenuItemBuilder::new(format!("⚪ {} 個閒置", idle_count))
                .id("idle-count")
                .enabled(false)
                .build(app)?,
        );
    }

    Ok(builder.build()?)
}
