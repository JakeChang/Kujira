use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    pid: Option<u32>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl PtyState {
    /// Kill all PTY sessions — called on app exit
    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct PtyOutput {
    id: String,
    data: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    id: String,
    cwd: Option<String>,
    command: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = if let Some(ref cmd_str) = command {
        // Wrap in login shell so PATH is properly set (needed for .app bundles)
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c.arg("-c");
        c.arg(cmd_str);
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c
    };
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    cmd.env("KUJIRA_PTY_ID", &id);

    // macOS .app bundles don't inherit the user's terminal PATH.
    // Prepend common user binary directories so tools like `claude` are found.
    if let Some(home) = dirs::home_dir() {
        let home = home.to_string_lossy();
        let extra_paths = [
            format!("{home}/.local/bin"),
            format!("{home}/.cargo/bin"),
            format!("{home}/.bun/bin"),
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
        ];
        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = extra_paths
            .iter()
            .filter(|p| !current_path.contains(p.as_str()))
            .cloned()
            .collect::<Vec<_>>()
            .join(":")
            + ":"
            + &current_path;
        cmd.env("PATH", new_path);
    }

    if let Some(ref dir) = cwd {
        cmd.cwd(dir);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id();

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session = PtySession {
        writer,
        master: pair.master,
        child,
        pid,
    };

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), session);

    // Spawn reader thread to emit output events
    let emit_id = id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf_reader = BufReader::with_capacity(8192, reader);
        let mut buf = vec![0u8; 8192];
        // Holds incomplete UTF-8 bytes from the previous read
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match std::io::Read::read(&mut buf_reader, &mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // Prepend any leftover bytes from the previous read
                    let chunk = if pending.is_empty() {
                        &buf[..n]
                    } else {
                        pending.extend_from_slice(&buf[..n]);
                        pending.as_slice()
                    };

                    // Find the last valid UTF-8 boundary
                    let valid_up_to = match std::str::from_utf8(chunk) {
                        Ok(_) => chunk.len(),
                        Err(e) => e.valid_up_to(),
                    };

                    if valid_up_to > 0 {
                        // Safety: we just verified these bytes are valid UTF-8
                        let data = unsafe {
                            std::str::from_utf8_unchecked(&chunk[..valid_up_to])
                        }.to_string();
                        let _ = app_clone.emit(
                            "pty-output",
                            PtyOutput {
                                id: emit_id.clone(),
                                data,
                            },
                        );
                    }

                    // Save incomplete trailing bytes for next read
                    let leftover = &chunk[valid_up_to..];
                    pending = leftover.to_vec();
                }
                Err(_) => break,
            }
        }
        let _ = app_clone.emit(
            "pty-exit",
            serde_json::json!({ "id": emit_id }),
        );
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(app: AppHandle, id: String, data: String) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get_mut(&id).ok_or("Session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(app: AppHandle, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&id).ok_or("Session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn pty_get_cwd(app: AppHandle, id: String) -> Result<String, String> {
    let state = app.state::<PtyState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&id).ok_or("Session not found")?;
    let pid = session.pid.ok_or("No PID available")?;

    // Use lsof on macOS to get the cwd of the shell process
    // -a = AND conditions (without it, -d and -p are OR'd, returning wrong results)
    let output = std::process::Command::new("lsof")
        .args(["-a", "-d", "cwd", "-p", &pid.to_string(), "-Fn"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix('n') {
            if path.starts_with('/') {
                return Ok(path.to_string());
            }
        }
    }
    Err("Could not determine cwd".to_string())
}
