use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

/// File that tracks all server PIDs — survives app crashes
fn pid_file_path() -> std::path::PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("kujira");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("server-pids.json")
}

fn save_pids(pids: &[u32]) {
    if let Ok(json) = serde_json::to_string(pids) {
        let _ = std::fs::write(pid_file_path(), json);
    }
}

fn load_and_clear_pids() -> Vec<u32> {
    let path = pid_file_path();
    let pids = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<u32>>(&s).ok())
        .unwrap_or_default();
    let _ = std::fs::remove_file(&path);
    pids
}

/// Kill leftover server processes from a previous session (e.g., after crash)
pub fn cleanup_stale_servers() {
    let pids = load_and_clear_pids();
    for pid in pids {
        #[cfg(unix)]
        {
            // Check if process is still alive
            let alive = unsafe { libc::kill(pid as i32, 0) } == 0;
            if alive {
                let descendants = get_descendants(pid);
                for dpid in &descendants {
                    unsafe { libc::kill(*dpid as i32, libc::SIGKILL); }
                }
                unsafe { libc::kill(pid as i32, libc::SIGKILL); }
            }
        }
    }
}

/// Recursively find all descendant PIDs of a process on macOS/Linux
#[cfg(unix)]
fn get_descendants(pid: u32) -> Vec<u32> {
    let output = std::process::Command::new("pgrep")
        .args(["-P", &pid.to_string()])
        .output();
    let mut pids = Vec::new();
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Ok(child_pid) = line.trim().parse::<u32>() {
                // Recurse into children first (depth-first)
                pids.extend(get_descendants(child_pid));
                pids.push(child_pid);
            }
        }
    }
    pids
}

/// Kill a process and ALL its descendants
fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(unix)]
    {
        // Collect all descendant PIDs before killing
        let descendants = get_descendants(pid);

        // Kill children first (leaf to root), then the parent
        for dpid in &descendants {
            unsafe { libc::kill(*dpid as i32, libc::SIGTERM); }
        }
        unsafe { libc::kill(pid as i32, libc::SIGTERM); }

        // Brief wait for graceful shutdown
        std::thread::sleep(std::time::Duration::from_millis(300));

        // Force kill anything still alive
        for dpid in &descendants {
            unsafe { libc::kill(*dpid as i32, libc::SIGKILL); }
        }
        unsafe { libc::kill(pid as i32, libc::SIGKILL); }
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

#[derive(Clone, Serialize)]
pub struct ServerStatus {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub status: String, // "stopped" | "building" | "running" | "error"
    pub pid: Option<u32>,
    pub uptime_secs: Option<u64>,
}

struct ServerProcess {
    id: String,
    name: String,
    port: u16,
    _path: String,
    _command: String,
    child: Child,
    started_at: Instant,
    status: String,
}

pub struct ServerState {
    servers: Mutex<HashMap<String, ServerProcess>>,
    logs: Mutex<HashMap<String, Vec<LogLine>>>,
}

#[derive(Clone, Serialize)]
pub struct LogLine {
    pub line: String,
    pub stream: String,
}

const MAX_LOG_LINES: usize = 1000;

impl Default for ServerState {
    fn default() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            logs: Mutex::new(HashMap::new()),
        }
    }
}

impl ServerState {
    pub fn kill_all(&self) {
        if let Ok(mut servers) = self.servers.lock() {
            for (_, mut proc) in servers.drain() {
                kill_process_tree(&mut proc.child);
            }
        }
        // Clear PID file
        let _ = std::fs::remove_file(pid_file_path());
    }

    fn sync_pid_file(&self) {
        if let Ok(servers) = self.servers.lock() {
            let pids: Vec<u32> = servers.values().map(|s| s.child.id()).collect();
            save_pids(&pids);
        }
    }

    fn push_log(&self, id: &str, line: String, stream: String) {
        if let Ok(mut logs) = self.logs.lock() {
            let buf = logs.entry(id.to_string()).or_default();
            buf.push(LogLine { line, stream });
            if buf.len() > MAX_LOG_LINES {
                buf.drain(..buf.len() - MAX_LOG_LINES);
            }
        }
    }

    fn get_logs(&self, id: &str) -> Vec<LogLine> {
        self.logs.lock().ok()
            .and_then(|logs| logs.get(id).cloned())
            .unwrap_or_default()
    }
}

#[derive(Clone, Serialize)]
struct ServerLog {
    id: String,
    data: String,
}

#[tauri::command]
pub fn server_start(
    app: AppHandle,
    id: String,
    name: String,
    path: String,
    port: u16,
    command: Option<String>,
) -> Result<(), String> {
    let state = app.state::<ServerState>();
    let cmd_str = command.unwrap_or_else(|| "npx nuxt dev".to_string());

    if cmd_str.is_empty() {
        return Err("Empty command".to_string());
    }

    // Use interactive login shell to ensure full PATH (homebrew npm/node etc.)
    let mut cmd = Command::new("/bin/zsh");
    cmd.args(["-ilc", &cmd_str]);
    cmd.current_dir(&path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PORT", port.to_string());

    // Create a new process group so we can kill the entire tree on stop
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe { cmd.pre_exec(|| { libc::setsid(); Ok(()) }); }
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let _pid = child.id();

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        let id_clone = id.clone();
        let port_clone = port;
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // Buffer + emit
                    app_clone.state::<ServerState>().push_log(&id_clone, line.clone(), "stdout".to_string());
                    let _ = app_clone.emit(
                        "server-log",
                        ServerLog {
                            id: id_clone.clone(),
                            data: format!("{}\n", line),
                        },
                    );
                    // Detect ready state
                    if line.contains("localhost") && line.contains(&port_clone.to_string()) {
                        let _ = app_clone.emit(
                            "server-status-change",
                            serde_json::json!({
                                "id": id_clone,
                                "status": "running"
                            }),
                        );
                    }
                }
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        let id_clone = id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    app_clone.state::<ServerState>().push_log(&id_clone, line.clone(), "stderr".to_string());
                    let _ = app_clone.emit(
                        "server-log",
                        ServerLog {
                            id: id_clone.clone(),
                            data: format!("{}\n", line),
                        },
                    );
                }
            }
        });
    }

    let process = ServerProcess {
        id: id.clone(),
        name,
        port,
        _path: path,
        _command: cmd_str,
        child,
        started_at: Instant::now(),
        status: "building".to_string(),
    };

    state
        .servers
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, process);

    // Track PID for crash recovery
    state.sync_pid_file();

    Ok(())
}

#[tauri::command]
pub fn server_stop(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<ServerState>();
    let mut servers = state.servers.lock().map_err(|e| e.to_string())?;
    if let Some(mut proc) = servers.remove(&id) {
        kill_process_tree(&mut proc.child);
    }
    drop(servers);
    state.sync_pid_file();
    Ok(())
}

#[tauri::command]
pub fn server_restart(
    app: AppHandle,
    id: String,
    name: String,
    path: String,
    port: u16,
    command: Option<String>,
) -> Result<(), String> {
    server_stop(app.clone(), id.clone())?;
    server_start(app, id, name, path, port, command)
}

#[tauri::command]
pub fn server_stop_all(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ServerState>();
    let mut servers = state.servers.lock().map_err(|e| e.to_string())?;
    for (_, mut proc) in servers.drain() {
        kill_process_tree(&mut proc.child);
    }
    Ok(())
}

#[tauri::command]
pub fn server_list(app: AppHandle) -> Result<Vec<ServerStatus>, String> {
    let state = app.state::<ServerState>();
    let servers = state.servers.lock().map_err(|e| e.to_string())?;
    let list: Vec<ServerStatus> = servers
        .values()
        .map(|s| ServerStatus {
            id: s.id.clone(),
            name: s.name.clone(),
            port: s.port,
            status: s.status.clone(),
            pid: Some(s.child.id()),
            uptime_secs: Some(s.started_at.elapsed().as_secs()),
        })
        .collect();
    Ok(list)
}

#[tauri::command]
pub fn server_get_logs(app: AppHandle, id: String) -> Vec<LogLine> {
    let state = app.state::<ServerState>();
    state.get_logs(&id)
}
