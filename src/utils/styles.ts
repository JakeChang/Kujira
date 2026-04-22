import type { ServerStatusType } from "../types";

export const STATUS_COLOR: Record<ServerStatusType, string> = {
  running: "var(--accent-green)",
  stopped: "var(--text-muted)",
  building: "var(--accent-yellow)",
  error: "var(--accent-red)",
};

export const STATUS_LABEL: Record<string, string> = {
  running: "執行中",
  stopped: "已停止",
  building: "啟動中",
  error: "錯誤",
};

export function formatUptime(secs?: number): string {
  if (!secs || secs < 1) return "";
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: "6px",
  padding: "8px 11px",
  fontSize: "13px",
  outline: "none",
};

/** Standard hover bg value — use this everywhere for consistency */
export const HOVER_BG = "rgba(255,255,255,0.06)";
