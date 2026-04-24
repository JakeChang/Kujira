import { useCallback, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { HOVER_BG } from "../../utils/styles";
import { DailySparkline } from "../claude/DailySparkline";
import { HelpModal } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";

export function TitleBar() {
  const { claudeQuota, claudeDaily, claudeLoginStatus, setClaudeLoginStatus, rightPanelVisible, toggleRightPanel } = useStore(
    useShallow((s) => ({
      claudeQuota: s.claudeQuota,
      claudeDaily: s.claudeDaily,
      claudeLoginStatus: s.claudeLoginStatus,
      setClaudeLoginStatus: s.setClaudeLoginStatus,
      rightPanelVisible: s.rightPanelVisible,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );

  const [activeClaudeCount, setActiveClaudeCount] = useState(0);
  useEffect(() => {
    const unlisten = listen<{ statuses: Record<string, string> }>("claude-status", (event) => {
      const count = Object.values(event.payload.statuses).filter((s) => s === "working" || s === "pending").length;
      setActiveClaudeCount(count);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleLogin = useCallback(async () => {
    setClaudeLoginStatus("logging_in");
    try { await invoke("claude_open_login"); } catch { setClaudeLoginStatus("logged_out"); return; }
    if (loginPollRef.current) clearInterval(loginPollRef.current);
    loginPollRef.current = setInterval(async () => {
      try {
        const url = await invoke<string>("claude_check_login_url");
        if (url.includes("claude.ai") && !url.includes("/login") && !url.includes("/oauth") && !url.includes("/auth")) {
          const ok = await invoke<boolean>("claude_extract_cookies");
          if (ok) {
            if (loginPollRef.current) clearInterval(loginPollRef.current);
            setClaudeLoginStatus("logged_in");
          }
        }
      } catch {
        if (loginPollRef.current) clearInterval(loginPollRef.current);
        try { const ok = await invoke<boolean>("claude_extract_cookies"); if (ok) { setClaudeLoginStatus("logged_in"); return; } } catch { /* ignore */ }
        setClaudeLoginStatus("logged_out");
      }
    }, 2000);
  }, [setClaudeLoginStatus]);
  useEffect(() => () => { if (loginPollRef.current) clearInterval(loginPollRef.current); }, []);

  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [claudeDropdownOpen, setClaudeDropdownOpen] = useState(false);
  const claudeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!claudeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (claudeDropdownRef.current && !claudeDropdownRef.current.contains(e.target as Node)) {
        setClaudeDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [claudeDropdownOpen]);

  const hasClaudeData = claudeLoginStatus !== "checking";
  const sessionRemaining = claudeQuota ? Math.round((1 - claudeQuota.sessionUtilization) * 100) : null;
  const sessionColor = claudeQuota
    ? claudeQuota.sessionUtilization >= 0.9 ? "var(--accent-red)"
      : claudeQuota.sessionUtilization >= 0.75 ? "var(--accent-yellow)"
      : "var(--accent-green)"
    : "var(--text-muted)";

  return (
    <div
      className="flex items-center select-none shrink-0"
      style={{
        height: "38px",
        background: "var(--bg-tertiary)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* macOS traffic light spacer */}
      <div className="h-full shrink-0" style={{ width: "78px" }} data-tauri-drag-region />

      {/* Drag region fills center */}
      <div className="flex-1 h-full" data-tauri-drag-region />

      {/* Right actions */}
      <div className="flex items-center shrink-0 gap-1" style={{ padding: "0 12px" }}>
        {/* Claude compact status */}
        {hasClaudeData && (
          <div ref={claudeDropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setClaudeDropdownOpen(!claudeDropdownOpen)}
              className="flex items-center gap-1.5 rounded-md transition-colors"
              style={{
                padding: "3px 8px", height: "26px",
                background: claudeDropdownOpen ? HOVER_BG : "transparent",
                border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "11px",
              }}
              onMouseEnter={(e) => { if (!claudeDropdownOpen) e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={(e) => { if (!claudeDropdownOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: activeClaudeCount > 0 ? "var(--accent-green)" : "var(--accent-cyan)", fontSize: "10px" }} className={activeClaudeCount > 0 ? "animate-pulse" : ""}>◆</span>
              {activeClaudeCount > 0 && (
                <span style={{ color: "var(--accent-green)", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "11px" }}>
                  {activeClaudeCount}
                </span>
              )}
              {sessionRemaining !== null && (
                <>
                  <div style={{ width: "36px", height: "3px", borderRadius: "2px", overflow: "hidden", background: "var(--border-color)" }}>
                    <div style={{ height: "100%", borderRadius: "2px", width: `${Math.max(0, Math.min(100, (1 - claudeQuota!.sessionUtilization) * 100))}%`, background: sessionColor, transition: "width 0.7s ease-out" }} />
                  </div>
                  <span style={{ color: sessionColor, fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "10px" }}>
                    {sessionRemaining}%
                  </span>
                </>
              )}
            </button>
            {claudeDropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, width: "220px",
                background: "var(--bg-elevated)", border: "1px solid var(--border-color)",
                borderRadius: "10px", padding: "12px 14px", zIndex: 9999,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              }}>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "10px" }}>
                  Claude Code
                </div>
                {(claudeLoginStatus === "logged_out" || (claudeLoginStatus === "logged_in" && !claudeQuota)) && (
                  <div
                    onClick={handleLogin}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", padding: "10px", borderRadius: "6px", cursor: "pointer", color: "var(--text-muted)", border: "1px dashed var(--border-color)", marginBottom: "4px" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-cyan)"; e.currentTarget.style.borderColor = "var(--accent-cyan)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}
                  >
                    ◆ 登入查看用量
                  </div>
                )}
                {claudeLoginStatus === "logging_in" && (
                  <div style={{ fontSize: "11px", textAlign: "center", padding: "10px", color: "var(--text-muted)" }}>登入中...</div>
                )}
                {claudeQuota && (
                  <>
                    <div style={{ height: "1px", background: "var(--border-color)", margin: "10px 0" }} />
                    {[
                      { label: "5 小時", u: claudeQuota.sessionUtilization, r: claudeQuota.sessionResetsAt },
                      { label: "7 天", u: claudeQuota.weeklyUtilization, r: claudeQuota.weeklyResetsAt },
                      ...(claudeQuota.sonnetUtilization != null ? [{ label: "Sonnet", u: claudeQuota.sonnetUtilization, r: claudeQuota.sonnetResetsAt }] : []),
                    ].map((q) => {
                      const remaining = Math.round((1 - q.u) * 100);
                      const color = q.u >= 0.9 ? "var(--accent-red)" : q.u >= 0.75 ? "var(--accent-yellow)" : "var(--accent-green)";
                      const resetDate = q.r ? (() => { const d = new Date(q.r * 1000); const now = new Date(); const hh = d.getHours().toString().padStart(2, "0"); const mm = d.getMinutes().toString().padStart(2, "0"); return d.toDateString() === now.toDateString() ? `今天 ${hh}:${mm}` : `${d.getMonth()+1}/${d.getDate()} ${hh}:${mm}`; })() : "";
                      return (
                        <div key={q.label} style={{ marginBottom: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "6px" }}>
                            <span style={{ color: "var(--text-primary)" }}>{q.label}</span>
                            <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{remaining}%</span>
                          </div>
                          <div style={{ width: "100%", height: "4px", borderRadius: "4px", overflow: "hidden", background: "var(--border-color)" }}>
                            <div style={{ height: "100%", borderRadius: "4px", width: `${(1 - q.u) * 100}%`, background: color, transition: "width 0.7s ease-out" }} />
                          </div>
                          {resetDate && <div style={{ fontSize: "10px", marginTop: "4px", color: "var(--text-secondary)" }}>重置於 {resetDate}</div>}
                        </div>
                      );
                    })}
                  </>
                )}
                {claudeDaily && claudeDaily.length > 0 && (
                  <>
                    <div style={{ height: "1px", background: "var(--border-color)", margin: "10px 0" }} />
                    <DailySparkline data={claudeDaily} />
                  </>
                )}
                <div
                  onClick={() => { open("https://claude.ai/settings/usage"); setClaudeDropdownOpen(false); }}
                  style={{ fontSize: "11px", padding: "8px 0 2px", textAlign: "center", cursor: "pointer", color: "var(--text-secondary)", borderTop: "1px solid var(--border-color)", marginTop: "10px", transition: "color 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-cyan)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  查看用量明細 ↗
                </div>
              </div>
            )}
          </div>
        )}

        {/* Help */}
        <TitleBtn title="使用說明" onClick={() => setHelpOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.5 6.2a1.5 1.5 0 0 1 2.83.7c0 1-1.33 1.3-1.33 2.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
          </svg>
        </TitleBtn>

        {/* Settings */}
        <TitleBtn title="設定" onClick={() => setSettingsOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 1.5h3l.4 1.8.7.3 1.6-.9 2.1 2.1-.9 1.6.3.7 1.8.4v3l-1.8.4-.3.7.9 1.6-2.1 2.1-1.6-.9-.7.3-.4 1.8h-3l-.4-1.8-.7-.3-1.6.9-2.1-2.1.9-1.6-.3-.7-1.8-.4v-3l1.8-.4.3-.7-.9-1.6 2.1-2.1 1.6.9.7-.3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </TitleBtn>

        {/* Panel toggle */}
        <TitleBtn
          title={rightPanelVisible ? "收合面板 (⌘P)" : "展開面板 (⌘P)"}
          onClick={toggleRightPanel}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </TitleBtn>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function TitleBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
      style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "var(--text-secondary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
      title={title}
    >
      {children}
    </button>
  );
}
