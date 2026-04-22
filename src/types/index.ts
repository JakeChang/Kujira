export interface TerminalConfig {
  shell: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  scrollback: number;
}

export interface LayoutConfig {
  favoriteBarVisible: boolean;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  rightPanelSplitRatio: number;
  projectListVisible: boolean;
  projectListWidth: number;
  projectListCollapsed: boolean;
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  port?: number;
  command?: string;
  group?: string;
}

export interface FavoriteConfig {
  name: string;
  path: string;
  projectId?: string;
  group?: string;
}

export interface ClaudeConfig {
  monthlyBudget: number;
  usageLogPath: string;
}

export interface GeminiConfig {
  apiKey: string;
}

export interface AppConfig {
  terminal: TerminalConfig;
  layout: LayoutConfig;
  projects: ProjectConfig[];
  favorites: FavoriteConfig[];
  claude: ClaudeConfig;
  gemini: GeminiConfig;
}

export type TabType = "shell" | "log" | "claude";

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  ptyId?: string;
  serverId?: string;
  cwd?: string;
}

export type ServerStatusType = "stopped" | "building" | "running" | "error";

export interface ServerStatus {
  id: string;
  name: string;
  port: number;
  status: ServerStatusType;
  pid?: number;
  uptime_secs?: number;
}

export interface ClaudeUsage {
  today_tokens: number;
  month_tokens: number;
  today_input: number;
  today_output: number;
  available: boolean;
}

export interface SessionMessage {
  timestamp: string;
  role: string; // "user" | "assistant"
  text: string;
  tool_name: string | null;
}

export interface ClaudeSession {
  session_id: string;
  cwd: string;
  branch: string | null;
  first_ts: string;
  last_ts: string;
  user_messages: number;
  assistant_messages: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  cost_usd: number;
  last_model: string | null;
}

export interface DailyUsage {
  date: string;
  input: number;
  output: number;
  cache: number;
  total: number;
  cost_usd: number;
}

export interface GitInfo {
  is_repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface GitBranch {
  name: string;
  is_current: boolean;
}

export interface ClaudeQuota {
  sessionUtilization: number;
  weeklyUtilization: number;
  sonnetUtilization?: number;
  sessionResetsAt?: number;
  weeklyResetsAt?: number;
  sonnetResetsAt?: number;
  lastUpdated: number;
  isLoggedIn: boolean;
}
