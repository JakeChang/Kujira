use serde::Serialize;
use std::process::Command;

#[derive(Clone, Serialize)]
pub struct GitInfo {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
}

#[derive(Clone, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

fn not_repo() -> GitInfo {
    GitInfo {
        is_repo: false,
        branch: None,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
    }
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitInfo, String> {
    let output = Command::new("git")
        .args(["-C", &path, "status", "--porcelain=v1", "-b", "--ahead-behind"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(not_repo());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();

    let mut branch: Option<String> = None;
    let mut ahead: u32 = 0;
    let mut behind: u32 = 0;
    let mut staged: u32 = 0;
    let mut unstaged: u32 = 0;
    let mut untracked: u32 = 0;

    // First line: ## branch...tracking [ahead N, behind N]
    if let Some(header) = lines.next() {
        if let Some(rest) = header.strip_prefix("## ") {
            // Parse branch name (before "..." or end)
            let branch_part = if let Some(idx) = rest.find("...") {
                &rest[..idx]
            } else {
                // No tracking branch, might have " [" for initial commit
                rest.split(' ').next().unwrap_or(rest)
            };
            branch = Some(branch_part.to_string());

            // Parse ahead/behind
            if let Some(bracket_start) = rest.find('[') {
                if let Some(bracket_end) = rest.find(']') {
                    let info = &rest[bracket_start + 1..bracket_end];
                    for part in info.split(", ") {
                        let part = part.trim();
                        if let Some(n) = part.strip_prefix("ahead ") {
                            ahead = n.parse().unwrap_or(0);
                        } else if let Some(n) = part.strip_prefix("behind ") {
                            behind = n.parse().unwrap_or(0);
                        }
                    }
                }
            }
        }
    }

    // Remaining lines: file status
    for line in lines {
        if line.len() < 2 {
            continue;
        }
        let bytes = line.as_bytes();
        let x = bytes[0] as char; // index (staged)
        let y = bytes[1] as char; // worktree (unstaged)

        if x == '?' && y == '?' {
            untracked += 1;
        } else {
            if x != ' ' && x != '?' {
                staged += 1;
            }
            if y != ' ' && y != '?' {
                unstaged += 1;
            }
        }
    }

    Ok(GitInfo {
        is_repo: true,
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
    })
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let output = Command::new("git")
        .args(["-C", &path, "branch", "--list", "--format=%(HEAD) %(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<GitBranch> = stdout
        .lines()
        .filter(|l| l.len() > 2)
        .map(|line| {
            let is_current = line.starts_with('*');
            let name = line[2..].trim().to_string();
            GitBranch { name, is_current }
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", &path, "pull"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git pull failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

#[tauri::command]
pub fn git_push(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", &path, "push"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", &path, "checkout", &branch])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

#[tauri::command]
pub fn git_commit(path: String, message: String, stage_all: bool) -> Result<String, String> {
    if stage_all {
        let add_output = Command::new("git")
            .args(["-C", &path, "add", "-A"])
            .output()
            .map_err(|e| e.to_string())?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr);
            return Err(format!("git add failed: {}", stderr));
        }
    }

    let output = Command::new("git")
        .args(["-C", &path, "commit", "-m", &message])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}
