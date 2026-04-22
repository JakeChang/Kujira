import { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-shell";
import { useShallow } from "zustand/react/shallow";
import { useServers } from "../../hooks/useServers";
import { useStore } from "../../store";
import { useTabs } from "../../hooks/useTabs";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useGroupedItems } from "../../hooks/useGroupedItems";
import { ContextMenuItem, ContextDivider } from "../shared/ContextMenu";
import { persistConfig } from "../../utils/persistConfig";
import { STATUS_COLOR, formatUptime, inputStyle } from "../../utils/styles";
import type { AppConfig, ProjectConfig, ServerStatus } from "../../types";

export function ServerPanel() {
  const { servers, startServer, stopServer, restartServer, startAll, stopAll } = useServers();
  const { config, selectedServerId, setSelectedServerId } = useStore(
    useShallow((s) => ({ config: s.config, selectedServerId: s.selectedServerId, setSelectedServerId: s.setSelectedServerId })),
  );
  const { createLogTab } = useTabs();
  const [adding, setAdding] = useState(false);
  const [addPath, setAddPath] = useState("");
  const [addPort, setAddPort] = useState("");
  const [addCmd, setAddCmd] = useState("npm run dev");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPort, setEditPort] = useState("");
  const [editCmd, setEditCmd] = useState("");
  const [editPath, setEditPath] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ srv: ServerStatus; x: number; y: number } | null>(null);
  const [ctxView, setCtxView] = useState<"main" | "group">("main");
  const [newGroupName, setNewGroupName] = useState("");
  const ctxRef = useRef<HTMLDivElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const getServerGroup = useCallback(
    (srv: ServerStatus) => config?.projects.find((p) => p.id === srv.id)?.group,
    [config],
  );
  const { ungrouped: ungroupedServers, groupOrder: serverGroupOrder, grouped: groupedServers, toggleCollapse: toggleServerGroup, isCollapsed: isServerGroupCollapsed } = useGroupedItems(servers, getServerGroup);

  useClickOutside(ctxRef, () => {
    if (ctxMenu) {
      setCtxMenu(null);
      setCtxView("main");
    }
  });

  useEffect(() => {
    if (ctxView === "group" && newGroupInputRef.current) {
      newGroupInputRef.current.focus();
    }
  }, [ctxView]);

  const getProject = useCallback(
    (id: string) => config?.projects.find((p) => p.id === id),
    [config]
  );

  const handleAddProject = useCallback(async () => {
    if (!addPath.trim() || !config) return;
    const path = addPath.trim().replace(/\/$/, "");
    const parts = path.split("/").filter(Boolean);
    const name = parts[parts.length - 1] || "project";
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    if (config.projects.some((p) => p.path === path || p.id === id)) {
      setAdding(false);
      setAddPath("");
      return;
    }

    const usedPorts = config.projects.map((p) => p.port);
    let port = addPort ? parseInt(addPort, 10) : 3000;
    if (!addPort || isNaN(port)) {
      port = 3000;
      while (usedPorts.includes(port)) port++;
    }

    const newProject: ProjectConfig = { id, name, path, port, command: addCmd || "npm run dev" };
    const newConfig: AppConfig = {
      ...config,
      projects: [...config.projects, newProject],
    };

    try {
      await persistConfig(newConfig);
    } catch (e) {
      console.error("Failed to save config:", e);
    }

    setAdding(false);
    setAddPath("");
    setAddPort("");
    setAddCmd("npm run dev");
  }, [addPath, addPort, addCmd, config]);

  const handleRemoveProject = useCallback(async (id: string) => {
    if (!config) return;
    const srv = servers.find((s) => s.id === id);
    if (srv?.status === "running" || srv?.status === "building") {
      await stopServer(id);
    }
    const newConfig: AppConfig = {
      ...config,
      projects: config.projects.filter((p) => p.id !== id),
    };
    try {
      await persistConfig(newConfig);
      if (selectedServerId === id) setSelectedServerId(null);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }, [config, servers, stopServer, selectedServerId, setSelectedServerId]);

  const startEditing = useCallback((id: string) => {
    const proj = config?.projects.find((p) => p.id === id);
    if (!proj) return;
    setEditingId(id);
    setEditName(proj.name);
    setEditPort(String(proj.port ?? ""));
    setEditCmd(proj.command ?? "npm run dev");
    setEditPath(proj.path);
  }, [config]);

  const handleSaveEdit = useCallback(async () => {
    if (!config || !editingId) return;
    const name = editName.trim();
    const port = parseInt(editPort, 10);
    const command = editCmd.trim() || "npm run dev";
    const path = editPath.trim();
    if (!name || isNaN(port) || port < 1 || !path) return;
    await persistConfig({
      ...config,
      projects: config.projects.map((p) =>
        p.id === editingId ? { ...p, name, port, command, path } : p
      ),
    });
    setEditingId(null);
  }, [config, editingId, editName, editPort, editCmd, editPath]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const moveProject = useCallback(async (id: string, dir: "up" | "down") => {
    if (!config) return;
    const idx = config.projects.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= config.projects.length) return;
    const projects = [...config.projects];
    [projects[idx], projects[swap]] = [projects[swap], projects[idx]];
    await persistConfig({ ...config, projects });
  }, [config]);

  const setProjectGroup = useCallback(async (id: string, group: string | undefined) => {
    if (!config) return;
    await persistConfig({
      ...config,
      projects: config.projects.map((p) => p.id === id ? { ...p, group } : p),
    });
  }, [config]);

  const moveProjectGroup = useCallback(async (groupName: string, dir: "up" | "down") => {
    if (!config) return;
    // Collect group order
    const groupOrder: string[] = [];
    for (const p of config.projects) {
      if (p.group && !groupOrder.includes(p.group)) groupOrder.push(p.group);
    }
    const gi = groupOrder.indexOf(groupName);
    const swapGi = dir === "up" ? gi - 1 : gi + 1;
    if (gi < 0 || swapGi < 0 || swapGi >= groupOrder.length) return;
    [groupOrder[gi], groupOrder[swapGi]] = [groupOrder[swapGi], groupOrder[gi]];
    // Rebuild projects: ungrouped first, then by group order
    const ungrouped = config.projects.filter((p) => !p.group);
    const grouped: Record<string, ProjectConfig[]> = {};
    for (const p of config.projects) {
      if (!p.group) continue;
      if (!grouped[p.group]) grouped[p.group] = [];
      grouped[p.group].push(p);
    }
    const projects = [...ungrouped];
    for (const g of groupOrder) {
      if (grouped[g]) projects.push(...grouped[g]);
    }
    await persistConfig({ ...config, projects });
  }, [config]);

  const projectGroups = serverGroupOrder;

  const runningCount = servers.filter((s) => s.status === "running").length;

  const handleCtxMenu = (e: React.MouseEvent, srv: ServerStatus) => {
    e.preventDefault();
    setCtxMenu({ srv, x: e.clientX, y: e.clientY });
    setCtxView("main");
  };

  const renderServerRow = (srv: ServerStatus) => {
    const isSelected = srv.id === selectedServerId;
    const isRunning = srv.status === "running";
    const uptime = formatUptime(srv.uptime_secs);
    const isEditing = editingId === srv.id;

    if (isEditing) {
      return (
        <div
          key={srv.id}
          style={{
            borderRadius: "8px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            marginBottom: "2px",
          }}
        >
          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "4px" }}>
                名稱
              </label>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") handleCancelEdit(); }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "4px" }}>
                專案路徑
              </label>
              <input
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") handleCancelEdit(); }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ width: "80px", flexShrink: 0 }}>
                <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "4px" }}>
                  Port
                </label>
                <input
                  value={editPort}
                  onChange={(e) => setEditPort(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") handleCancelEdit(); }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "4px" }}>
                  啟動指令
                </label>
                <input
                  value={editCmd}
                  onChange={(e) => setEditCmd(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") handleCancelEdit(); }}
                />
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px",
              padding: "8px 10px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <button
              onClick={handleCancelEdit}
              style={{
                fontSize: "11px", padding: "5px 10px", borderRadius: "6px",
                color: "var(--text-muted)", background: "transparent",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              style={{
                fontSize: "11px", fontWeight: 500, padding: "5px 14px",
                borderRadius: "6px", background: "var(--accent-blue)", color: "#1a1d23",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              儲存
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={srv.id}
        onClick={() => setSelectedServerId(srv.id)}
        onContextMenu={(e) => handleCtxMenu(e, srv)}
        className="group"
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "7px 10px",
          borderRadius: "8px", cursor: "pointer",
          transition: "background 0.15s",
          background: isSelected ? "var(--bg-primary)" : "transparent",
          minWidth: 0,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
          if (confirmingDeleteId === srv.id) setConfirmingDeleteId(null);
        }}
      >
        <div
          style={{
            flexShrink: 0, width: "7px", height: "7px", borderRadius: "50%",
            background: STATUS_COLOR[srv.status],
            opacity: srv.status === "stopped" ? 0.6 : 1,
            boxShadow: isRunning ? `0 0 6px ${STATUS_COLOR[srv.status]}` : "none",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {srv.name}
            </span>
            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-secondary)", flexShrink: 0 }}>
              :{srv.port}
            </span>
          </div>
          {isRunning && uptime && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{uptime}</span>
          )}
        </div>
        {confirmingDeleteId === srv.id ? (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--accent-red)", whiteSpace: "nowrap" }}>確認移除？</span>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(null); handleRemoveProject(srv.id); }}
              style={{ fontSize: "11px", fontWeight: 500, padding: "2px 10px", borderRadius: "4px", border: "none", cursor: "pointer", background: "var(--accent-red)", color: "#fff", transition: "opacity 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >移除</button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(null); }}
              style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "none", cursor: "pointer", background: "var(--hover-bg)", color: "var(--text-muted)", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >取消</button>
          </div>
        ) : (
          <div className="hidden group-hover:flex" style={{ alignItems: "center", gap: "2px", flexShrink: 0 }}>
            {(srv.status === "stopped" || srv.status === "error") && (
              <HoverBtn title="啟動" hoverColor="var(--accent-green)" onClick={(e) => { e.stopPropagation(); const p = getProject(srv.id); if (p) startServer(p); }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
              </HoverBtn>
            )}
            {(srv.status === "running" || srv.status === "building") && (
              <>
                <HoverBtn title="停止" hoverColor="var(--accent-red)" onClick={(e) => { e.stopPropagation(); stopServer(srv.id); }}>
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
                </HoverBtn>
                <HoverBtn title="重啟" hoverColor="var(--accent-yellow)" onClick={(e) => { e.stopPropagation(); const p = getProject(srv.id); if (p) restartServer(p); }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 8a5.5 5.5 0 01-10.29 2.75l1.3-.75A4 4 0 108 4V6L5 3.5 8 1v2a5.5 5.5 0 015.5 5z"/></svg>
                </HoverBtn>
              </>
            )}
            <HoverBtn title="編輯" hoverColor="var(--accent-blue)" onClick={(e) => { e.stopPropagation(); startEditing(srv.id); }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M12.1 1.3a1 1 0 011.4 0l1.2 1.2a1 1 0 010 1.4L5.8 12.8 2 14l1.2-3.8L12.1 1.3zM4.5 11.5l-.7 2.2 2.2-.7L4.5 11.5z"/></svg>
            </HoverBtn>
            <HoverBtn title="Log" hoverColor="var(--accent-blue)" onClick={(e) => { e.stopPropagation(); const p = getProject(srv.id); if (p) createLogTab(srv.id, p.name); }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1H2zm0 3h10v1H2zm0 3h12v1H2zm0 3h8v1H2z"/></svg>
            </HoverBtn>
            <HoverBtn title="在瀏覽器開啟" hoverColor="var(--accent-blue)" onClick={(e) => { e.stopPropagation(); open(`http://localhost:${srv.port}`); }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M9 2h5v5l-2-2-4 4-1-1 4-4L9 2zM3 4h4v1H4v7h7V9h1v4H3V4z"/></svg>
            </HoverBtn>
            <HoverBtn title="移除" hoverColor="var(--accent-red)" onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(srv.id); }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3L8 6.5 11.5 3 13 4.5 9.5 8 13 11.5 11.5 13 8 9.5 4.5 13 3 11.5 6.5 8 3 4.5z"/></svg>
            </HoverBtn>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="select-none" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px 10px 6px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
            Servers
          </span>
          {servers.length > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 500,
                padding: "2px 7px",
                borderRadius: "9px",
                background: runningCount > 0 ? "rgba(152, 195, 121, 0.15)" : "rgba(92, 99, 112, 0.2)",
                color: runningCount > 0 ? "var(--accent-green)" : "var(--text-muted)",
              }}
            >
              {runningCount}/{servers.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "24px", height: "24px", borderRadius: "6px",
            color: "var(--text-muted)", fontSize: "16px",
            background: "transparent", border: "none", cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent-green)";
            e.currentTarget.style.background = "rgba(152, 195, 121, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.background = "transparent";
          }}
          title="加入專案"
        >
          +
        </button>
      </div>

      {/* Add project form */}
      {adding && (
        <div
          style={{
            marginBottom: "12px",
            borderRadius: "8px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* 專案路徑 */}
            <div>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
                專案路徑
              </label>
              <input
                autoFocus
                value={addPath}
                onChange={(e) => setAddPath(e.target.value)}
                placeholder="/Users/jake/projects/my-app"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
              />
            </div>
            {/* Port */}
            <div>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
                Port
              </label>
              <input
                value={addPort}
                onChange={(e) => setAddPort(e.target.value)}
                placeholder="自動分配"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
              />
            </div>
            {/* 啟動指令 */}
            <div>
              <label style={{ display: "block", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
                啟動指令
              </label>
              <input
                value={addCmd}
                onChange={(e) => setAddCmd(e.target.value)}
                placeholder="npm run dev"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
              />
            </div>
          </div>
          {/* Form actions */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px",
              padding: "10px 12px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <button
              onClick={() => { setAdding(false); setAddPath(""); setAddPort(""); setAddCmd("npm run dev"); }}
              style={{
                fontSize: "12px", padding: "6px 12px", borderRadius: "6px",
                color: "var(--text-muted)", background: "transparent",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              取消
            </button>
            <button
              onClick={handleAddProject}
              style={{
                fontSize: "12px", fontWeight: 500, padding: "6px 16px",
                borderRadius: "6px", background: "var(--accent-blue)", color: "#1a1d23",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              加入專案
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 && !adding ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "40px", height: "40px", borderRadius: "12px",
                margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "18px", background: "var(--hover-bg)", color: "var(--text-muted)",
              }}
            >
              +
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
              尚未設定 dev server
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
              加入專案來管理開發伺服器
            </div>
            <button
              onClick={() => setAdding(true)}
              style={{
                fontSize: "11px", padding: "6px 16px", borderRadius: "6px",
                color: "var(--accent-green)", background: "transparent",
                border: "1px dashed var(--border-color)", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-green)";
                e.currentTarget.style.background = "rgba(152, 195, 121, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              + 加入專案
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Server list */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {ungroupedServers.map((srv) => renderServerRow(srv))}
              {serverGroupOrder.map((group, gi) => {
                const collapsed = isServerGroupCollapsed(group);
                const groupSrvs = groupedServers[group];
                return (
                  <div key={group}>
                    <button
                      onClick={() => toggleServerGroup(group)}
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        width: "100%", padding: "6px 10px 4px",
                        background: "transparent", border: "none", cursor: "pointer",
                        marginTop: ungroupedServers.length > 0 || gi > 0 ? "4px" : "0",
                      }}
                    >
                      <span style={{ fontSize: "8px", color: "var(--text-muted)", transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                        ▼
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                        {group}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", opacity: 0.6 }}>
                        ({groupSrvs.length})
                      </span>
                    </button>
                    {!collapsed && groupSrvs.map((srv) => renderServerRow(srv))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom toolbar */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              marginTop: "8px", paddingTop: "8px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <ToolbarBtn title="全部啟動" hoverColor="var(--accent-green)" onClick={startAll}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l7 6-7 6V2zm7 0l7 6-7 6V2z"/></svg>
            </ToolbarBtn>
            <ToolbarBtn title="全部停止" hoverColor="var(--accent-red)" onClick={stopAll}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="5" height="10" rx="1"/><rect x="10" y="3" width="5" height="10" rx="1"/></svg>
            </ToolbarBtn>
          </div>
        </>
      )}

      {/* Context menu portal */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            width: "200px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "5px 6px",
            zIndex: 9999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {ctxView === "main" ? (
            <>
              {/* Move */}
              {(() => {
                const idx = config?.projects.findIndex((p) => p.id === ctxMenu.srv.id) ?? -1;
                const total = config?.projects.length ?? 0;
                return (idx > 0 || idx < total - 1) && (
                  <>
                    {idx > 0 && (
                      <ContextMenuItem label="↑ 上移" onClick={() => { moveProject(ctxMenu.srv.id, "up"); setCtxMenu(null); }} />
                    )}
                    {idx < total - 1 && (
                      <ContextMenuItem label="↓ 下移" onClick={() => { moveProject(ctxMenu.srv.id, "down"); setCtxMenu(null); }} />
                    )}
                    <ContextDivider />
                  </>
                );
              })()}

              {/* Group */}
              <ContextMenuItem label="設定組織 …" onClick={() => setCtxView("group")} />

              {/* Group reorder */}
              {(() => {
                const proj = getProject(ctxMenu.srv.id);
                if (!proj?.group) return null;
                const gi = projectGroups.indexOf(proj.group);
                const canUp = gi > 0;
                const canDown = gi < projectGroups.length - 1;
                if (!canUp && !canDown) return null;
                return (
                  <>
                    <ContextDivider />
                    <div style={{ fontSize: "10px", fontWeight: 500, color: "var(--text-muted)", padding: "4px 10px 4px", letterSpacing: "0.05em" }}>
                      組織「{proj.group}」
                    </div>
                    {canUp && <ContextMenuItem label="↑ 組織上移" onClick={() => { moveProjectGroup(proj.group!, "up"); setCtxMenu(null); }} />}
                    {canDown && <ContextMenuItem label="↓ 組織下移" onClick={() => { moveProjectGroup(proj.group!, "down"); setCtxMenu(null); }} />}
                  </>
                );
              })()}

              <ContextDivider />
              <ContextMenuItem label="編輯設定" onClick={() => { startEditing(ctxMenu.srv.id); setCtxMenu(null); }} />
              <ContextMenuItem label="移除專案" danger onClick={() => { setConfirmingDeleteId(ctxMenu.srv.id); setCtxMenu(null); }} />
            </>
          ) : (
            <>
              {/* Group assignment view */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px 6px" }}>
                <button
                  onClick={() => setCtxView("main")}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "14px", padding: "0 4px" }}
                >‹</button>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>設定組織</span>
              </div>
              <ContextDivider />

              {/* Remove from group */}
              {getProject(ctxMenu.srv.id)?.group && (
                <>
                  <ContextMenuItem label="移出目前組織" muted onClick={() => { setProjectGroup(ctxMenu.srv.id, undefined); setCtxMenu(null); }} />
                  <ContextDivider />
                </>
              )}

              {/* Existing groups */}
              {projectGroups.length > 0 && (
                <>
                  {projectGroups.map((g) => {
                    const isCurrent = getProject(ctxMenu.srv.id)?.group === g;
                    return (
                      <ContextMenuItem
                        key={g}
                        label={g}
                        suffix={isCurrent ? "✓" : undefined}
                        muted={isCurrent}
                        onClick={() => { if (!isCurrent) { setProjectGroup(ctxMenu.srv.id, g); setCtxMenu(null); } }}
                      />
                    );
                  })}
                  <ContextDivider />
                </>
              )}

              {/* New group */}
              <div style={{ padding: "6px 6px 4px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    ref={newGroupInputRef}
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newGroupName.trim()) {
                        setProjectGroup(ctxMenu.srv.id, newGroupName.trim());
                        setNewGroupName("");
                        setCtxMenu(null);
                      }
                      if (e.key === "Escape") { setCtxMenu(null); }
                    }}
                    placeholder="新組織名稱"
                    style={{
                      flex: 1, fontSize: "12px", padding: "5px 8px",
                      borderRadius: "5px", border: "1px solid var(--border-color)",
                      background: "var(--bg-secondary)", color: "var(--text-primary)",
                      outline: "none", minWidth: 0,
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!newGroupName.trim()) return;
                      setProjectGroup(ctxMenu.srv.id, newGroupName.trim());
                      setNewGroupName("");
                      setCtxMenu(null);
                    }}
                    style={{
                      fontSize: "11px", padding: "4px 10px", borderRadius: "5px",
                      border: "1px solid var(--border-color)", cursor: "pointer",
                      background: newGroupName.trim() ? "var(--hover-bg)" : "transparent",
                      color: newGroupName.trim() ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >建立</button>
                </div>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function HoverBtn({ title, hoverColor, onClick, children }: {
  title: string; hoverColor: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "22px", height: "22px", borderRadius: "4px",
        color: "var(--text-secondary)", background: "transparent",
        border: "none", cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}


function ToolbarBtn({ title, hoverColor, onClick, children }: {
  title: string; hoverColor: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "28px", height: "28px", borderRadius: "6px",
        color: "var(--text-secondary)", background: "transparent",
        border: "none", cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}
