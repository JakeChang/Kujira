mod commands;

use commands::{claude, config, gemini, git, hooks, pty, server};
use tauri::{Manager, Emitter};
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Serialize)]
struct ClaudeStatusPayload {
    statuses: HashMap<String, String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Kill any server processes left from a previous crash
    server::cleanup_stale_servers();

    tauri::Builder::default()
        .manage(pty::PtyState::default())
        .manage(server::ServerState::default())
        .setup(|app| {
            // Build native menu with Help item
            let app_submenu = SubmenuBuilder::new(app, "Kujira")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .separator()
                .close_window()
                .build()?;

            let help_item = MenuItemBuilder::new("使用說明")
                .id("show-help")
                .accelerator("CmdOrCtrl+/")
                .build(app)?;

            let help_submenu = SubmenuBuilder::new(app, "Help")
                .item(&help_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&edit_submenu)
                .item(&window_submenu)
                .item(&help_submenu)
                .build()?;

            app.set_menu(menu)?;

            // Show main window after a short delay to avoid white flash
            let window = app.get_webview_window("main").unwrap();
            let win = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let _ = win.maximize();
                let _ = win.show();
            });

            // Clean stale status files from previous session
            {
                let status_dir = hooks::status_dir();
                if status_dir.exists() {
                    if let Ok(entries) = std::fs::read_dir(&status_dir) {
                        for entry in entries.flatten() {
                            let _ = std::fs::remove_file(entry.path());
                        }
                    }
                }
            }

            // Background polling for Claude status files
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let status_dir = hooks::status_dir();
                eprintln!("[claude-status] Polling directory: {:?}", status_dir);
                let mut last: HashMap<String, String> = HashMap::new();
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let current = hooks::poll_status();
                    if current != last {
                        eprintln!("[claude-status] Changed: {:?}", current);
                        let _ = app_handle.emit("claude-status", ClaudeStatusPayload {
                            statuses: current.clone(),
                        });
                        last = current;
                    }
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // PTY
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_get_cwd,
            // Server
            server::server_start,
            server::server_stop,
            server::server_restart,
            server::server_stop_all,
            server::server_list,
            server::server_get_logs,
            // Gemini
            gemini::gemini_suggest,
            // Git
            git::git_status,
            git::git_branches,
            git::git_commit,
            git::git_pull,
            git::git_push,
            git::git_checkout,
            // Config
            config::config_read,
            config::config_write,
            // Claude
            claude::claude_usage_read,
            claude::claude_daily_usage_read,
            claude::claude_sessions_list,
            claude::claude_session_messages,
            claude::claude_open_login,
            claude::claude_check_login_url,
            claude::claude_extract_cookies,
            claude::claude_has_session,
            claude::claude_clear_session,
            claude::claude_quota_read,
            // Hooks
            hooks::hooks_check,
            hooks::hooks_install,
        ])
        .on_menu_event(|app, event| {
            if event.id() == "show-help" {
                let _ = app.emit("menu-show-help", ());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building kujira")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill all server processes
                let server_state = app_handle.state::<server::ServerState>();
                server_state.kill_all();
                // Kill all PTY sessions
                let pty_state = app_handle.state::<pty::PtyState>();
                pty_state.kill_all();
            }
        });
}
