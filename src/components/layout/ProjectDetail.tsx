import { useState, useCallback, useRef, useEffect, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { useServers } from "../../hooks/useServers";
import { useTabs } from "../../hooks/useTabs";
import { useProjectGitStatus } from "../../hooks/useProjectGitStatus";
import { persistConfig } from "../../utils/persistConfig";
import { STATUS_COLOR, STATUS_LABEL, formatUptime, inputStyle, HOVER_BG } from "../../utils/styles";
import { BranchPicker } from "../terminal/BranchPicker";
import { CommitPanel } from "../terminal/CommitPanel";

export function ProjectDetail() {
  const { config, rightPanelWidth, setRightPanelWidth, selectedProjectId, setSelectedProjectId, toggleRightPanel } = useStore(
    useShallow((s) => ({
      config: s.config,
      rightPanelWidth: s.rightPanelWidth,
      setRightPanelWidth: s.setRightPanelWidth,
      selectedProjectId: s.selectedProjectId,
      setSelectedProjectId: s.setSelectedProjectId,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );
  const servers = useStore((s) => s.servers);
  const { startServer, stopServer, restartServer } = useServers();

  const handleClose = useCallback(() => {
    toggleRightPanel();
    const s = useStore.getState();
    if (s.config) {
      persistConfig({ ...s.config, layout: { ...s.config.layout, rightPanelVisible: s.rightPanelVisible } }).catch(console.error);
    }
  }, [toggleRightPanel]);
  const { createShellTab, createLogTab } = useTabs();

  const project = config?.projects.find((p) => p.id === selectedProjectId) ?? null;
  const server = servers.find((s) => s.id === selectedProjectId);
  const { gitInfo, refresh: refreshGit } = useProjectGitStatus(project?.path ?? null);

  // Git UI state
  const [showBranches, setShowBranches] = useState(false);
  const [showCommit, setShowCommit] = useState(false);
  const branchBtnRef = useRef<HTMLButtonElement>(null);
  const commitBtnRef = useRef<HTMLButtonElement>(null);

  const [editingServer, setEditingServer] = useState(false);
  const [editPort, setEditPort] = useState("");
  const [editCmd, setEditCmd] = useState("");
  const [confirmAction, setConfirmAction] = useState<"none" | "remove-server" | "remove-project">("none");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmAction("none");
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Drag resize
  const dragRef = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(rightPanelWidth);

  useEffect(() => { latestWidth.current = rightPanelWidth; }, [rightPanelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startX.current - e.clientX;
      setRightPanelWidth(Math.min(500, Math.max(180, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const cfg = useStore.getState().config;
      if (cfg) {
        persistConfig({ ...cfg, layout: { ...cfg.layout, rightPanelWidth: latestWidth.current } }).catch(console.error);
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [setRightPanelWidth]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    startX.current = e.clientX;
    startWidth.current = rightPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [rightPanelWidth]);

  const handleOpenTerminal = useCallback(() => {
    if (!project) return;
    createShellTab(project.path, project.name);
  }, [project, createShellTab]);

  const handleSaveServerConfig = useCallback(async () => {
    if (!config || !project) return;
    const port = parseInt(editPort, 10);
    if (isNaN(port) || port < 1) return;
    await persistConfig({
      ...config,
      projects: config.projects.map((p) =>
        p.id === project.id ? { ...p, port, command: editCmd || "npm run dev" } : p
      ),
    });
    setEditingServer(false);
  }, [config, project, editPort, editCmd]);

  const handleRemoveServerConfig = useCallback(async () => {
    if (!config || !project) return;
    if (server?.status === "running" || server?.status === "building") {
      await stopServer(project.id);
    }
    await persistConfig({
      ...config,
      projects: config.projects.map((p) =>
        p.id === project.id ? { ...p, port: undefined, command: undefined } : p
      ),
    });
  }, [config, project, server, stopServer]);

  const handleRemoveProject = useCallback(async () => {
    if (!config || !project) return;
    if (server?.status === "running" || server?.status === "building") {
      await stopServer(project.id);
    }
    await persistConfig({
      ...config,
      projects: config.projects.filter((p) => p.id !== project.id),
    });
    setSelectedProjectId(null);
    setConfirmAction("none");
  }, [config, project, server, stopServer, setSelectedProjectId]);

  useEffect(() => {
    setEditingServer(false);
    setConfirmAction("none");
    setMenuOpen(false);
    setShowBranches(false);
    setShowCommit(false);
  }, [selectedProjectId]);

  return (
    <div className="flex h-full shrink-0 grow-0" style={{ width: `${rightPanelWidth}px` }}>
      {/* Left drag handle */}
      <div
        onMouseDown={onDragStart}
        className="h-full shrink-0 cursor-col-resize group"
        style={{ width: "5px", position: "relative" }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-colors group-hover:bg-[var(--accent-blue)]"
          style={{ width: "1px", background: "var(--border-subtle)" }}
        />
      </div>

      {/* Panel content */}
      <div
        className="flex flex-col h-full overflow-hidden flex-1 select-none"
        style={{ background: "var(--bg-tertiary)" }}
      >
        {/* Panel top bar with close button */}
        <div className="flex items-center shrink-0" style={{ height: "38px", padding: "0 8px 0 12px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", flex: 1 }}>
            屬性
          </span>
          <button
            onClick={handleClose}
            title="關閉面板 (⌘P)"
            className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>

        {project ? (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {/* Project header */}
            <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--border-subtle)", position: "relative" }}>
              <div className="flex items-start justify-between gap-2">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "0.01em" }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all", lineHeight: 1.5 }}>
                    {project.path}
                  </div>
                </div>

                {/* More menu */}
                <div ref={menuRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => { setMenuOpen(!menuOpen); setConfirmAction("none"); }}
                    className="flex items-center justify-center rounded-md transition-colors shrink-0"
                    style={{
                      width: "24px", height: "24px",
                      color: "var(--text-muted)", background: menuOpen ? "var(--hover-bg)" : "transparent",
                      border: "none", cursor: "pointer", fontSize: "14px", lineHeight: 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--hover-bg)"; }}
                    onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; } }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div style={{
                      position: "absolute", top: "100%", right: 0, marginTop: "4px",
                      width: "180px", background: "var(--bg-elevated)",
                      border: "1px solid var(--border-color)", borderRadius: "8px",
                      padding: "5px", zIndex: 50, boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
                    }}>
                      {confirmAction !== "none" ? (
                        <div style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: "12px", color: "var(--accent-red)", marginBottom: "10px", fontWeight: 500 }}>
                            {confirmAction === "remove-server" ? "確認移除 Server 設定？" : "確認移除此專案？"}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (confirmAction === "remove-server") handleRemoveServerConfig();
                                else handleRemoveProject();
                                setMenuOpen(false);
                                setConfirmAction("none");
                              }}
                              style={{
                                flex: 1, fontSize: "12px", fontWeight: 500, padding: "6px 0",
                                borderRadius: "6px", background: "var(--accent-red)", color: "#fff",
                                border: "none", cursor: "pointer",
                              }}
                            >確認</button>
                            <button
                              onClick={() => setConfirmAction("none")}
                              style={{
                                flex: 1, fontSize: "12px", padding: "6px 0",
                                borderRadius: "6px", background: "var(--hover-bg)", color: "var(--text-secondary)",
                                border: "none", cursor: "pointer",
                              }}
                            >取消</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {project.port != null && (
                            <button
                              onClick={() => setConfirmAction("remove-server")}
                              className="flex items-center gap-2.5 w-full rounded-md transition-colors"
                              style={{
                                padding: "8px 10px", fontSize: "13px", color: "var(--text-secondary)",
                                background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                              </svg>
                              移除 Server 設定
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmAction("remove-project")}
                            className="flex items-center gap-2.5 w-full rounded-md transition-colors"
                            style={{
                              padding: "8px 10px", fontSize: "13px", color: "var(--accent-red)",
                              background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 10a1 1 0 001 1h4a1 1 0 001-1l1-10" />
                            </svg>
                            移除專案
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: "14px 18px" }}>
              {/* Open Terminal */}
              <button
                onClick={handleOpenTerminal}
                className="w-full flex items-center gap-3 rounded-lg transition-colors"
                style={{
                  padding: "9px 12px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  borderRadius: "8px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = HOVER_BG;
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.7 }}>
                  <path d="M2 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                開啟終端機
              </button>
            </div>

            {/* Server Section */}
            <div style={{ padding: "0 18px 18px" }}>
              <div style={{
                fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "10px",
              }}>
                Server
              </div>

              {project.port != null && server && !editingServer ? (
                <div style={{ position: "relative" }}>
                  {/* Edit button - top right */}
                  <button
                    onClick={() => { setEditPort(String(project.port ?? "")); setEditCmd(project.command ?? "npm run dev"); setEditingServer(true); }}
                    title="編輯"
                    style={{
                      position: "absolute", top: "0", right: "0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: "24px", height: "24px", borderRadius: "5px",
                      color: "var(--text-muted)", background: "transparent",
                      border: "none", cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-blue)"; e.currentTarget.style.background = HOVER_BG; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 1.5l3.5 3.5L5 14.5H1.5V11z"/><path d="M8.5 4l3.5 3.5"/></svg>
                  </button>

                  {/* Status row */}
                  <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
                    <span style={{
                      width: "7px", height: "7px", borderRadius: "50%",
                      background: STATUS_COLOR[server.status] ?? "var(--text-muted)",
                      boxShadow: server.status === "running" ? `0 0 6px ${STATUS_COLOR[server.status]}` : "none",
                    }} />
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                      {STATUS_LABEL[server.status] ?? server.status}
                    </span>
                    <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                      :{server.port}
                    </span>
                    {server.status === "running" && server.uptime_secs && (
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                        {formatUptime(server.uptime_secs)}
                      </span>
                    )}
                  </div>

                  {/* Command */}
                  {project.command && (
                    <div style={{
                      fontSize: "12px", color: "var(--text-muted)", fontFamily: '"SF Mono", Menlo, monospace',
                      padding: "4px 0 10px", opacity: 0.7,
                    }}>
                      $ {project.command}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                    {(server.status === "stopped" || server.status === "error") && (
                      <SmallBtn label="啟動" color="var(--accent-green)" onClick={() => startServer(project)}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
                      </SmallBtn>
                    )}
                    {(server.status === "running" || server.status === "building") && (
                      <>
                        <SmallBtn label="停止" color="var(--accent-red)" onClick={() => stopServer(server.id)}>
                          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
                        </SmallBtn>
                        <SmallBtn label="重啟" color="var(--accent-yellow)" onClick={() => restartServer(project)}>
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 8a5.5 5.5 0 01-10.29 2.75l1.3-.75A4 4 0 108 4V6L5 3.5 8 1v2a5.5 5.5 0 015.5 5z"/></svg>
                        </SmallBtn>
                      </>
                    )}
                    <SmallBtn label="Log" color="var(--accent-blue)" onClick={() => createLogTab(server.id, project.name)}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1H2zm0 3h10v1H2zm0 3h12v1H2zm0 3h8v1H2z"/></svg>
                    </SmallBtn>
                    <SmallBtn label="瀏覽器" color="var(--accent-blue)" onClick={() => open(`http://localhost:${server.port}`)}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2h5v5l-2-2-4 4-1-1 4-4L9 2zM3 4h4v1H4v7h7V9h1v4H3V4z"/></svg>
                    </SmallBtn>
                  </div>
                </div>
              ) : editingServer ? (
                <div>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
                      Port
                    </label>
                    <input
                      autoFocus
                      value={editPort}
                      onChange={(e) => setEditPort(e.target.value)}
                      placeholder="3000"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveServerConfig(); if (e.key === "Escape") setEditingServer(false); }}
                    />
                  </div>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
                      啟動指令
                    </label>
                    <input
                      value={editCmd}
                      onChange={(e) => setEditCmd(e.target.value)}
                      placeholder="npm run dev"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveServerConfig(); if (e.key === "Escape") setEditingServer(false); }}
                    />
                  </div>
                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => setEditingServer(false)}
                      style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                    >取消</button>
                    <button
                      onClick={handleSaveServerConfig}
                      style={{ fontSize: "12px", fontWeight: 500, padding: "6px 16px", borderRadius: "6px", background: "var(--accent-blue)", color: "#1a1d23", border: "none", cursor: "pointer" }}
                    >儲存</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setEditPort("3000"); setEditCmd("npm run dev"); setEditingServer(true); }}
                  className="w-full transition-colors"
                  style={{
                    padding: "10px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "1px dashed var(--border-color)",
                    cursor: "pointer",
                    textAlign: "center",
                    borderRadius: "8px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--text-secondary)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >+ 設定啟動指令</button>
              )}
            </div>

            {/* Git Section */}
            {gitInfo && gitInfo.is_repo && (
              <div style={{ padding: "0 18px 18px" }}>
                <div style={{
                  fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "10px",
                }}>
                  Git
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}>
                  {/* Branch row */}
                  <div className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--accent-purple)" style={{ opacity: 0.7, flexShrink: 0 }}>
                      <path d="M5 3.25a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zM7.25 2a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM5 12.75a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm2.25-1.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM11.25 6.5a2.25 2.25 0 110 4.5 2.25 2.25 0 010-4.5zm0 1a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM7.75 5.25v5.5h-1V9.5A2.25 2.25 0 009 7.25h1.19A3.25 3.25 0 007.75 5.25z" />
                    </svg>
                    <GitBtn
                      ref={branchBtnRef}
                      onClick={() => setShowBranches(!showBranches)}
                      color="var(--accent-purple)"
                    >
                      {gitInfo.branch ?? "HEAD"}
                      <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "2px" }}>▾</span>
                    </GitBtn>

                    {showBranches && branchBtnRef.current && project && (
                      <BranchPicker
                        cwd={project.path}
                        anchorRect={branchBtnRef.current.getBoundingClientRect()}
                        onSwitch={(branch) => {
                          invoke("git_checkout", { path: project!.path, branch })
                            .then(() => refreshGit())
                            .catch(console.error);
                          setShowBranches(false);
                        }}
                        onClose={() => setShowBranches(false)}
                      />
                    )}

                    {/* Ahead / Behind */}
                    <div className="flex items-center gap-1" style={{ marginLeft: "auto" }}>
                      {gitInfo.ahead > 0 && (
                        <span style={{ fontSize: "11px", color: "var(--accent-blue)", fontVariantNumeric: "tabular-nums" }} title={`領先 ${gitInfo.ahead} 個提交`}>
                          ↑{gitInfo.ahead}
                        </span>
                      )}
                      {gitInfo.behind > 0 && (
                        <span style={{ fontSize: "11px", color: "var(--accent-red)", fontVariantNumeric: "tabular-nums" }} title={`落後 ${gitInfo.behind} 個提交`}>
                          ↓{gitInfo.behind}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Changes */}
                  {(gitInfo.staged + gitInfo.unstaged + gitInfo.untracked) > 0 && (
                    <div className="flex items-center gap-2" style={{ fontSize: "11px" }}>
                      {gitInfo.staged > 0 && (
                        <span style={{ color: "var(--accent-green)" }}>+{gitInfo.staged} 已暫存</span>
                      )}
                      {gitInfo.unstaged > 0 && (
                        <span style={{ color: "var(--accent-yellow)" }}>~{gitInfo.unstaged} 未暫存</span>
                      )}
                      {gitInfo.untracked > 0 && (
                        <span style={{ color: "var(--text-muted)" }}>?{gitInfo.untracked} 未追蹤</span>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1" style={{ flexWrap: "wrap", marginTop: "2px" }}>
                    {gitInfo.behind > 0 && (
                      <SmallBtn label="Pull" color="var(--accent-blue)" onClick={() => { invoke("git_pull", { path: project!.path }).then(() => refreshGit()).catch(console.error); }}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2v10M4 8l4 4 4-4"/></svg>
                      </SmallBtn>
                    )}
                    {gitInfo.ahead > 0 && (
                      <SmallBtn label="Push" color="var(--accent-green)" onClick={() => { invoke("git_push", { path: project!.path }).then(() => refreshGit()).catch(console.error); }}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M8 14V4M4 8l4-4 4 4"/></svg>
                      </SmallBtn>
                    )}
                    {(gitInfo.staged + gitInfo.unstaged + gitInfo.untracked) > 0 && (
                      <>
                        <GitBtn
                          ref={commitBtnRef}
                          onClick={() => setShowCommit(!showCommit)}
                          color="var(--text-secondary)"
                        >
                          Commit
                        </GitBtn>
                        {showCommit && commitBtnRef.current && project && (
                          <CommitPanel
                            cwd={project.path}
                            gitInfo={gitInfo}
                            anchorRect={commitBtnRef.current.getBoundingClientRect()}
                            onDone={() => { setShowCommit(false); refreshGit(); }}
                            onClose={() => setShowCommit(false)}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Not a git repo */}
            {gitInfo && !gitInfo.is_repo && (
              <div style={{ padding: "0 18px 18px" }}>
                <div style={{
                  fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "10px",
                }}>
                  Git
                </div>
                <div style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}>
                  尚未初始化 Git
                </div>
              </div>
            )}

          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", padding: "20px", opacity: 0.5 }}>
              <div style={{ fontSize: "24px", marginBottom: "10px" }}>←</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                選擇專案
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SmallBtn({ label, color, onClick, children }: {
  label: string; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 rounded-md transition-colors"
      style={{
        padding: "5px 9px",
        fontSize: "12px",
        color: "var(--text-secondary)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = color; e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

const GitBtn = forwardRef<HTMLButtonElement, {
  children: React.ReactNode;
  onClick: () => void;
  color: string;
}>(function GitBtn({ children, onClick, color }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className="flex items-center gap-1 rounded-md transition-colors"
      style={{
        padding: "5px 9px",
        fontSize: "12px",
        color,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
});
