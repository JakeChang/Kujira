use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub terminal: TerminalConfig,
    pub layout: LayoutConfig,
    pub projects: Vec<ProjectConfig>,
    pub favorites: Vec<FavoriteConfig>,
    pub claude: ClaudeConfig,
    #[serde(default)]
    pub gemini: GeminiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub shell: String,
    #[serde(rename = "fontSize")]
    pub font_size: u16,
    #[serde(rename = "fontFamily")]
    pub font_family: String,
    pub theme: String,
    pub scrollback: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    #[serde(rename = "favoriteBarVisible", default = "default_true")]
    pub favorite_bar_visible: bool,
    #[serde(rename = "rightPanelVisible", default = "default_true")]
    pub right_panel_visible: bool,
    #[serde(rename = "rightPanelWidth", default = "default_right_panel_width")]
    pub right_panel_width: u32,
    #[serde(rename = "rightPanelSplitRatio", default = "default_split_ratio")]
    pub right_panel_split_ratio: f64,
    #[serde(rename = "projectListVisible", default = "default_true")]
    pub project_list_visible: bool,
    #[serde(rename = "projectListWidth", default = "default_project_list_width")]
    pub project_list_width: u32,
    #[serde(rename = "projectListCollapsed", default)]
    pub project_list_collapsed: bool,
}

fn default_true() -> bool {
    true
}

fn default_right_panel_width() -> u32 {
    260
}

fn default_split_ratio() -> f64 {
    0.6
}

fn default_project_list_width() -> u32 {
    160
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteConfig {
    pub name: String,
    pub path: String,
    #[serde(rename = "projectId")]
    pub project_id: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    #[serde(rename = "monthlyBudget")]
    pub monthly_budget: f64,
    #[serde(rename = "usageLogPath")]
    pub usage_log_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GeminiConfig {
    #[serde(rename = "apiKey", default)]
    pub api_key: String,
}

fn config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".kujira").join("config.json")
}

impl Default for AppConfig {
    fn default() -> Self {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        Self {
            terminal: TerminalConfig {
                shell,
                font_size: 14,
                font_family: "SF Mono".to_string(),
                theme: "one-dark".to_string(),
                scrollback: 10000,
            },
            layout: LayoutConfig {
                favorite_bar_visible: true,
                right_panel_visible: true,
                right_panel_width: 260,
                right_panel_split_ratio: 0.6,
                project_list_visible: true,
                project_list_width: 160,
                project_list_collapsed: false,
            },
            projects: vec![],
            favorites: vec![],
            claude: ClaudeConfig {
                monthly_budget: 50.0,
                usage_log_path: "~/.claude/usage".to_string(),
            },
            gemini: GeminiConfig::default(),
        }
    }
}

#[tauri::command]
pub fn config_read() -> Result<AppConfig, String> {
    let path = config_path();
    if !path.exists() {
        let config = AppConfig::default();
        // Create directory and write default
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        return Ok(config);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub fn config_write(config: AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
