import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { persistConfig } from "../../utils/persistConfig";
import { HelpModal } from "../layout/HelpModal";
import { SettingsModal } from "../layout/SettingsModal";
import { HOVER_BG } from "../../utils/styles";
import { DailySparkline } from "../claude/DailySparkline";
import type { Tab, TabType } from "../../types";

interface ClaudeStatusPayload {
  statuses: Record<string, string>;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

const TAB_ICONS: Record<TabType, string> = {
  shell: "●",
  log: "●",
  claude: "●",
};

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: TabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { reorderTabs, updateTabTitle, claudeQuota, claudeDaily, claudeLoginStatus, setClaudeLoginStatus, rightPanelVisible, toggleRightPanel } = useStore(
    useShallow((s) => ({
      reorderTabs: s.reorderTabs, updateTabTitle: s.updateTabTitle,
      claudeQuota: s.claudeQuota, claudeDaily: s.claudeDaily,
      claudeLoginStatus: s.claudeLoginStatus, setClaudeLoginStatus: s.setClaudeLoginStatus,
      rightPanelVisible: s.rightPanelVisible, toggleRightPanel: s.toggleRightPanel,
    })),
  );

  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [claudeDropdownOpen, setClaudeDropdownOpen] = useState(false);
  const claudeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!claudeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (claudeDropdownRef.current && !claudeDropdownRef.current.contains(e.target as Node)) setClaudeDropdownOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [claudeDropdownOpen]);

  // Listen for native menu Help event
  useEffect(() => {
    const unlisten = listen("menu-show-help", () => setHelpOpen(true));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Claude working status
  const [claudeStatuses, setClaudeStatuses] = useState<Record<string, string>>({});
  useEffect(() => {
    const unlisten = listen<ClaudeStatusPayload>("claude-status", (event) => setClaudeStatuses(event.payload.statuses));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const getClaudeStatus = (tab: Tab): string | null => {
    const ptyId = tab.ptyId ?? tab.id;
    return claudeStatuses[ptyId] ?? null;
  };

  // Drag-to-reorder
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragStartX = useRef(0);
  const didDrag = useRef(false);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!dragTabId) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!didDrag.current && Math.abs(e.clientX - dragStartX.current) < 5) return;
      didDrag.current = true;
      let found = false;
      tabRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          const idx = tabs.findIndex((t) => t.id === id);
          if (idx !== -1) { setDropTargetIndex(idx); found = true; }
        }
      });
      if (!found) setDropTargetIndex(null);
    };
    const onMouseUp = () => {
      if (didDrag.current && dropTargetIndex !== null) {
        const fromIndex = tabs.findIndex((t) => t.id === dragTabId);
        if (fromIndex !== -1 && fromIndex !== dropTargetIndex) reorderTabs(fromIndex, dropTargetIndex);
      }
      setDragTabId(null); setDropTargetIndex(null); document.body.style.cursor = "";
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); document.body.style.cursor = ""; };
  }, [dragTabId, dropTargetIndex, tabs, reorderTabs]);

  const handleMouseDown = useCallback((e: React.MouseEvent, tab: Tab) => {
    if (e.button !== 0) return;
    dragStartX.current = e.clientX; didDrag.current = false; setDragTabId(tab.id);
  }, []);
  const handleClick = useCallback((tab: Tab) => { if (!didDrag.current) onSelect(tab.id); }, [onSelect]);
  const handleDoubleClick = useCallback((tab: Tab) => { if (tab.type === "claude") return; setEditingId(tab.id); setEditValue(tab.title); }, []);
  const handleEditSubmit = useCallback((id: string) => { if (editValue.trim()) updateTabTitle(id, editValue.trim()); setEditingId(null); }, [editValue, updateTabTitle]);
  const setTabRef = useCallback((id: string, el: HTMLButtonElement | null) => { if (el) tabRefs.current.set(id, el); else tabRefs.current.delete(id); }, []);

  const hasClaudeData = claudeLoginStatus !== "checking";

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
          if (ok) { if (loginPollRef.current) clearInterval(loginPollRef.current); setClaudeLoginStatus("logged_in"); }
        }
      } catch {
        if (loginPollRef.current) clearInterval(loginPollRef.current);
        try { const ok = await invoke<boolean>("claude_extract_cookies"); if (ok) { setClaudeLoginStatus("logged_in"); return; } } catch { /* ignore */ }
        setClaudeLoginStatus("logged_out");
      }
    }, 2000);
  }, [setClaudeLoginStatus]);
  useEffect(() => () => { if (loginPollRef.current) clearInterval(loginPollRef.current); }, []);
  const sessionRemaining = claudeQuota ? Math.round((1 - claudeQuota.sessionUtilization) * 100) : null;
  const sessionColor = claudeQuota
    ? claudeQuota.sessionUtilization >= 0.9 ? "var(--accent-red)" : claudeQuota.sessionUtilization >= 0.75 ? "var(--accent-yellow)" : "var(--accent-green)"
    : "var(--text-muted)";

  return (
    <div
      className="flex items-center select-none shrink-0"
      style={{ height: "38px", background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border-color)" }}
    >
      {/* Tabs */}
      <div className="flex items-center h-full overflow-x-auto gap-0.5 shrink" style={{ minWidth: 0, flex: 1, padding: "0 6px 0 12px" }}>
        {tabs.map((tab, index) => {
          const isSelected = tab.id === activeTabId;
          const shortcut = index < 9 ? `⌘${index + 1}` : undefined;
          const isDragging = dragTabId === tab.id && didDrag.current;
          const isDropTarget = dropTargetIndex === index && dragTabId !== tab.id;
          const claudeStatus = getClaudeStatus(tab);
          const hasCS = claudeStatus !== null;
          let dotColor = isSelected ? "#565f89" : "var(--text-muted)";
          if (hasCS) { if (claudeStatus === "working") dotColor = "var(--accent-green)"; else if (claudeStatus === "pending") dotColor = "var(--accent-yellow)"; }
          let tabBg = isSelected ? "rgba(255,255,255,0.08)" : "transparent";
          if (claudeStatus === "working") tabBg = isSelected ? "rgba(152,195,121,0.35)" : "rgba(152,195,121,0.22)";
          else if (claudeStatus === "pending") tabBg = isSelected ? "rgba(229,192,123,0.35)" : "rgba(229,192,123,0.22)";

          return (
            <button
              key={tab.id} ref={(el) => setTabRef(tab.id, el)}
              onMouseDown={(e) => handleMouseDown(e, tab)} onClick={() => handleClick(tab)} onDoubleClick={() => handleDoubleClick(tab)}
              className="flex items-center justify-center gap-2.5 h-[30px] rounded-lg relative group transition-all"
              style={{
                flex: "1 1 0", background: tabBg, color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: "13px", letterSpacing: "0.01em", paddingLeft: "14px", paddingRight: shortcut ? "10px" : "14px",
                minWidth: "80px", maxWidth: "200px", opacity: isDragging ? 0.4 : 1,
                borderLeft: isDropTarget ? "2px solid var(--accent-blue)" : "2px solid transparent",
              }}
              onMouseEnter={(e) => { if (!isSelected && claudeStatus !== "working" && claudeStatus !== "pending") e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={(e) => { if (!isSelected && claudeStatus !== "working" && claudeStatus !== "pending") e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: dotColor, fontSize: hasCS ? "9px" : "7px" }} className={claudeStatus === "working" ? "animate-pulse" : ""}>{TAB_ICONS[tab.type]}</span>
              {editingId === tab.id ? (
                <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleEditSubmit(tab.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditSubmit(tab.id); if (e.key === "Escape") setEditingId(null); }}
                  className="bg-transparent outline-none w-20" style={{ color: "var(--text-primary)", fontSize: "13px" }} />
              ) : (
                <span className="truncate" style={{ maxWidth: "160px" }}>{tab.title}</span>
              )}
              {shortcut && <span className="shrink-0" style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px", opacity: isSelected ? 0.7 : 0.4 }}>{shortcut}</span>}
              <span onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer transition-opacity absolute"
                style={{ fontSize: "14px", lineHeight: 1, right: "6px", top: "50%", transform: "translateY(-50%)" }}>×</span>
            </button>
          );
        })}

        <button onClick={() => onNewTab()}
          className="flex items-center justify-center h-7 rounded-md transition-colors shrink-0"
          style={{ color: "var(--text-muted)", marginLeft: tabs.length > 0 ? "8px" : "0", width: "32px" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          title="新增分頁 (⌘T)">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center shrink-0 gap-1" style={{ padding: "0 10px" }}>
        {/* Claude status */}
        {hasClaudeData && (
          <div ref={claudeDropdownRef} style={{ position: "relative" }}>
            <button onClick={() => setClaudeDropdownOpen(!claudeDropdownOpen)}
              className="flex items-center gap-1.5 rounded-md transition-colors"
              style={{ padding: "3px 8px", height: "26px", background: claudeDropdownOpen ? HOVER_BG : "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "11px" }}
              onMouseEnter={(e) => { if (!claudeDropdownOpen) e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={(e) => { if (!claudeDropdownOpen) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ color: "var(--accent-cyan)", fontSize: "10px" }}>◆</span>
              {sessionRemaining !== null && (
                <>
                  <div style={{ width: "36px", height: "3px", borderRadius: "2px", overflow: "hidden", background: "var(--border-color)" }}>
                    <div style={{ height: "100%", borderRadius: "2px", width: `${Math.max(0, Math.min(100, (1 - claudeQuota!.sessionUtilization) * 100))}%`, background: sessionColor, transition: "width 0.7s ease-out" }} />
                  </div>
                  <span style={{ color: sessionColor, fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "10px" }}>{sessionRemaining}%</span>
                </>
              )}
            </button>
            {claudeDropdownOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: "220px", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px 14px", zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "10px" }}>Claude Code</div>
                {(claudeLoginStatus === "logged_out" || (claudeLoginStatus === "logged_in" && !claudeQuota)) && (
                  <div onClick={handleLogin}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", padding: "10px", borderRadius: "6px", cursor: "pointer", color: "var(--text-muted)", border: "1px dashed var(--border-color)", marginBottom: "4px" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-cyan)"; e.currentTarget.style.borderColor = "var(--accent-cyan)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}>
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
                      const rem = Math.round((1 - q.u) * 100);
                      const c = q.u >= 0.9 ? "var(--accent-red)" : q.u >= 0.75 ? "var(--accent-yellow)" : "var(--accent-green)";
                      const rd = q.r ? (() => { const d = new Date(q.r * 1000); const now = new Date(); const hh = d.getHours().toString().padStart(2, "0"); const mm = d.getMinutes().toString().padStart(2, "0"); return d.toDateString() === now.toDateString() ? `今天 ${hh}:${mm}` : `${d.getMonth()+1}/${d.getDate()} ${hh}:${mm}`; })() : "";
                      return (
                        <div key={q.label} style={{ marginBottom: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "6px" }}>
                            <span style={{ color: "var(--text-primary)" }}>{q.label}</span>
                            <span style={{ color: c, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{rem}%</span>
                          </div>
                          <div style={{ width: "100%", height: "4px", borderRadius: "4px", overflow: "hidden", background: "var(--border-color)" }}>
                            <div style={{ height: "100%", borderRadius: "4px", width: `${(1 - q.u) * 100}%`, background: c, transition: "width 0.7s ease-out" }} />
                          </div>
                          {rd && <div style={{ fontSize: "10px", marginTop: "4px", color: "var(--text-secondary)" }}>重置於 {rd}</div>}
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
                <div onClick={() => { open("https://claude.ai/settings/usage"); setClaudeDropdownOpen(false); }}
                  style={{ fontSize: "11px", padding: "8px 0 2px", textAlign: "center", cursor: "pointer", color: "var(--text-secondary)", borderTop: "1px solid var(--border-color)", marginTop: "10px", transition: "color 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-cyan)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}>
                  查看用量明細 ↗
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active agents */}
        {(() => {
          const cnt = Object.values(claudeStatuses).filter((s) => s === "working" || s === "pending").length;
          if (cnt === 0) return null;
          return (
            <div className="flex items-center gap-1.5 rounded-md" style={{ padding: "3px 8px 3px 5px", background: "rgba(152,195,121,0.15)", border: "1px solid rgba(152,195,121,0.25)", height: "26px" }}
              title={`${cnt} 個 Claude Agent 執行中`}>
              <svg width="18" height="14" viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
                <ellipse cx="10" cy="8.5" rx="7.5" ry="5" fill="var(--accent-green)" opacity="0.85" />
                <path d="M9,3.5 L10.5,0.5 L11.5,3.5" fill="var(--accent-green)" />
                <path d="M2.5,7 L0,4.5 L0.5,7.5 L0,11.5 L2.5,9.5" fill="var(--accent-green)" opacity="0.85">
                  <animateTransform attributeName="transform" type="rotate" values="0 2.5 8.5;8 2.5 8.5;-6 2.5 8.5;0 2.5 8.5" dur="1s" repeatCount="indefinite" />
                </path>
                <circle cx="14.5" cy="7.5" r="1.3" fill="var(--bg-primary,#1a1a2e)" />
              </svg>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-green)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{cnt}</span>
            </div>
          );
        })()}

        <ActionBtn title="使用說明" onClick={() => setHelpOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.5 6.2a1.5 1.5 0 0 1 2.83.7c0 1-1.33 1.3-1.33 2.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
          </svg>
        </ActionBtn>
        <ActionBtn title="設定" onClick={() => setSettingsOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </ActionBtn>

        {/* Show panel toggle only when panel is closed */}
        {!rightPanelVisible && (
          <ActionBtn title="展開面板 (⌘P)" onClick={() => {
            toggleRightPanel();
            const s = useStore.getState();
            if (s.config) persistConfig({ ...s.config, layout: { ...s.config.layout, rightPanelVisible: s.rightPanelVisible } }).catch(console.error);
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </ActionBtn>
        )}
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
      style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "var(--text-secondary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}>
      {children}
    </button>
  );
}
