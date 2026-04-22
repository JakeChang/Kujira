import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { DailySparkline } from "./DailySparkline";

function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return (
    <div style={{ width: "100%", height: "4px", borderRadius: "4px", overflow: "hidden", background: "var(--border-color)" }}>
      <div
        style={{
          height: "100%", borderRadius: "4px",
          width: `${pct}%`, background: color,
          transition: "width 0.7s ease-out",
        }}
      />
    </div>
  );
}

function getColor(u: number): string {
  if (u >= 0.9) return "var(--accent-red)";
  if (u >= 0.75) return "var(--accent-yellow)";
  return "var(--accent-green)";
}

function formatReset(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  if (isToday) return `今天 ${hh}:${mm}`;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d} ${hh}:${mm}`;
}

export function ClaudeUsage() {
  const { claudeQuota, claudeDaily, status, setStatus } = useStore(
    useShallow((s) => ({
      claudeQuota: s.claudeQuota,
      claudeDaily: s.claudeDaily,
      status: s.claudeLoginStatus, setStatus: s.setClaudeLoginStatus,
    })),
  );
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLogin = useCallback(async () => {
    setStatus("logging_in");
    try {
      await invoke("claude_open_login");
    } catch {
      setStatus("logged_out");
      return;
    }
    if (loginPollRef.current) clearInterval(loginPollRef.current);
    loginPollRef.current = setInterval(async () => {
      try {
        const url = await invoke<string>("claude_check_login_url");
        if (url.includes("claude.ai") && !url.includes("/login") && !url.includes("/oauth") && !url.includes("/auth")) {
          const ok = await invoke<boolean>("claude_extract_cookies");
          if (ok) {
            if (loginPollRef.current) clearInterval(loginPollRef.current);
            setStatus("logged_in");
          }
        }
      } catch {
        // Login window was closed — try extracting cookies anyway
        // (user may already be logged in on claude.ai)
        if (loginPollRef.current) clearInterval(loginPollRef.current);
        try {
          const ok = await invoke<boolean>("claude_extract_cookies");
          if (ok) {
            setStatus("logged_in");
            return;
          }
        } catch { /* ignore */ }
        setStatus("logged_out");
      }
    }, 2000);
  }, []);

  useEffect(() => {
    return () => { if (loginPollRef.current) clearInterval(loginPollRef.current); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px 10px 6px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "12px" }}>
        Claude Code
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Quota section — percentages from claude.ai */}
        {status === "logged_in" && claudeQuota && (
          <>
            <QuotaRow
              label="5 小時"
              utilization={claudeQuota.sessionUtilization}
              resetsAt={claudeQuota.sessionResetsAt}
            />

            <QuotaRow
              label="7 天"
              utilization={claudeQuota.weeklyUtilization}
              resetsAt={claudeQuota.weeklyResetsAt}
            />

            {claudeQuota.sonnetUtilization != null && (
              <QuotaRow
                label="Sonnet"
                utilization={claudeQuota.sonnetUtilization}
                resetsAt={claudeQuota.sonnetResetsAt}
              />
            )}
          </>
        )}

        {/* Local 7-day token usage from JSONL — works without login */}
        {claudeDaily && claudeDaily.length > 0 && (
          <>
            <div style={{ height: "1px", background: "var(--border-color)", margin: "2px 0" }} />
            <DailySparkline data={claudeDaily} />
          </>
        )}

        {/* Not logged in (or logged-in flag stale with no quota data) */}
        {(status === "logged_out" || (status === "logged_in" && !claudeQuota)) && (
          <div
            onClick={handleLogin}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", padding: "8px",
              borderRadius: "6px", cursor: "pointer",
              color: "var(--text-muted)",
              border: "1px dashed var(--border-color)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent-cyan)";
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            ◆ 登入查看用量
          </div>
        )}

        {status === "logging_in" && (
          <div style={{ fontSize: "11px", textAlign: "center", padding: "8px", color: "var(--text-muted)" }}>
            登入中...
          </div>
        )}

        {status === "checking" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: "11px", textAlign: "center", color: "var(--text-muted)" }}>
              載入中...
            </div>
          </div>
        )}
      </div>

      <div
        onClick={() => open("https://claude.ai/settings/usage")}
        style={{
          fontSize: "11px", padding: "6px 0",
          textAlign: "center", cursor: "pointer",
          color: "var(--text-secondary)",
          borderTop: "1px solid var(--border-color)",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-cyan)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        查看用量明細 ↗
      </div>
    </div>
  );
}

function QuotaRow({ label, utilization, resetsAt }: {
  label: string; utilization: number; resetsAt?: number;
}) {
  const remaining = Math.round((1 - utilization) * 100);
  const color = getColor(utilization);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {remaining}%
        </span>
      </div>
      <ProgressBar value={1 - utilization} color={color} />
      {resetsAt && (
        <div style={{ fontSize: "10px", marginTop: "6px", color: "var(--text-secondary)" }}>
          重置於 {formatReset(resetsAt)}
        </div>
      )}
    </div>
  );
}
