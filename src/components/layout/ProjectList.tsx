import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { useTabs } from "../../hooks/useTabs";
import { useGroupedItems } from "../../hooks/useGroupedItems";
import { useClickOutside } from "../../hooks/useClickOutside";
import { persistConfig } from "../../utils/persistConfig";
import { HOVER_BG } from "../../utils/styles";
import { ContextMenuItem, ContextDivider } from "../shared/ContextMenu";
import type { ProjectConfig } from "../../types";

function getInitials(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function ProjectList() {
  const { config, projectListWidth, setProjectListWidth, selectedProjectId, setSelectedProjectId, tabs, activeTabId, collapsed, _toggleCollapsed } = useStore(
    useShallow((s) => ({
      config: s.config,
      projectListWidth: s.projectListWidth,
      setProjectListWidth: s.setProjectListWidth,
      selectedProjectId: s.selectedProjectId,
      setSelectedProjectId: s.setSelectedProjectId,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      collapsed: s.projectListCollapsed,
      _toggleCollapsed: s.toggleProjectListCollapsed,
    })),
  );
  // Subscribe to servers separately to ensure reactivity
  const servers = useStore((s) => s.servers);
  const { createShellTab, setActiveTab } = useTabs();
  const projects = config?.projects ?? [];

  const toggleCollapsed = useCallback(() => {
    _toggleCollapsed();
    const s = useStore.getState();
    if (s.config) {
      persistConfig({ ...s.config, layout: { ...s.config.layout, projectListCollapsed: s.projectListCollapsed } }).catch(console.error);
    }
  }, [_toggleCollapsed]);

  const getGroup = useCallback((p: ProjectConfig) => p.group, []);
  const { ungrouped, groupOrder, grouped, toggleCollapse: toggleGroupCollapse, isCollapsed: isGroupCollapsed } = useGroupedItems(projects, getGroup);

  const [addStatus, setAddStatus] = useState<"idle" | "success" | "error">("idle");

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ project: ProjectConfig; x: number; y: number } | null>(null);
  const [ctxView, setCtxView] = useState<"main" | "group">("main");
  const [newGroupName, setNewGroupName] = useState("");
  const ctxRef = useRef<HTMLDivElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useClickOutside(ctxRef, () => { if (ctxMenu) { setCtxMenu(null); setCtxView("main"); } });
  useEffect(() => { if (ctxView === "group" && newGroupInputRef.current) newGroupInputRef.current.focus(); }, [ctxView]);

  // Drag resize (only in expanded mode)
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(projectListWidth);
  useEffect(() => { latestWidth.current = projectListWidth; }, [projectListWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setProjectListWidth(Math.min(320, Math.max(100, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const cfg = useStore.getState().config;
      if (cfg) persistConfig({ ...cfg, layout: { ...cfg.layout, projectListWidth: latestWidth.current } }).catch(console.error);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [setProjectListWidth]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = projectListWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [projectListWidth]);

  // Add current terminal cwd as project
  const handleAddCurrentFolder = useCallback(async () => {
    if (!config) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab?.ptyId) { setAddStatus("error"); setTimeout(() => setAddStatus("idle"), 1000); return; }
    try {
      const cwd = await invoke<string>("pty_get_cwd", { id: activeTab.ptyId });
      if (!cwd || cwd === "/") { setAddStatus("error"); setTimeout(() => setAddStatus("idle"), 1000); return; }
      const path = cwd.replace(/\/$/, "");
      if (config.projects.some((p) => p.path === path)) {
        const existing = config.projects.find((p) => p.path === path);
        if (existing) setSelectedProjectId(existing.id);
        setAddStatus("success"); setTimeout(() => setAddStatus("idle"), 1000); return;
      }
      const parts = path.split("/").filter(Boolean);
      const name = parts[parts.length - 1] || "project";
      const id = name.toLowerCase().replace(/[^a-z0-9-]/g, "-") + "-" + Date.now().toString(36);
      await persistConfig({ ...config, projects: [...config.projects, { id, name, path }] });
      setSelectedProjectId(id);
      setAddStatus("success"); setTimeout(() => setAddStatus("idle"), 1000);
    } catch { setAddStatus("error"); setTimeout(() => setAddStatus("idle"), 1000); }
  }, [config, tabs, activeTabId, setSelectedProjectId]);

  const handleClick = useCallback((project: ProjectConfig) => {
    setSelectedProjectId(project.id);
    const existing = tabs.find((t) => t.type === "shell" && t.cwd === project.path);
    if (existing) setActiveTab(existing.id);
    else createShellTab(project.path, project.name);
  }, [tabs, setSelectedProjectId, setActiveTab, createShellTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, project: ProjectConfig) => {
    e.preventDefault();
    setCtxMenu({ project, x: e.clientX, y: e.clientY });
    setCtxView("main");
  }, []);

  const moveProject = useCallback(async (id: string, dir: "up" | "down") => {
    if (!config) return;
    const idx = config.projects.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= config.projects.length) return;
    const ps = [...config.projects];
    [ps[idx], ps[swap]] = [ps[swap], ps[idx]];
    await persistConfig({ ...config, projects: ps });
  }, [config]);

  const setProjectGroup = useCallback(async (id: string, group: string | undefined) => {
    if (!config) return;
    await persistConfig({ ...config, projects: config.projects.map((p) => p.id === id ? { ...p, group } : p) });
  }, [config]);

  const moveProjectGroup = useCallback(async (groupName: string, dir: "up" | "down") => {
    if (!config) return;
    const order: string[] = [];
    for (const p of config.projects) { if (p.group && !order.includes(p.group)) order.push(p.group); }
    const gi = order.indexOf(groupName);
    const swapGi = dir === "up" ? gi - 1 : gi + 1;
    if (gi < 0 || swapGi < 0 || swapGi >= order.length) return;
    [order[gi], order[swapGi]] = [order[swapGi], order[gi]];
    const ug = config.projects.filter((p) => !p.group);
    const gd: Record<string, ProjectConfig[]> = {};
    for (const p of config.projects) { if (!p.group) continue; if (!gd[p.group]) gd[p.group] = []; gd[p.group].push(p); }
    const ps = [...ug]; for (const g of order) { if (gd[g]) ps.push(...gd[g]); }
    await persistConfig({ ...config, projects: ps });
  }, [config]);

  const removeProject = useCallback(async (id: string) => {
    if (!config) return;
    await persistConfig({ ...config, projects: config.projects.filter((p) => p.id !== id) });
    if (selectedProjectId === id) setSelectedProjectId(null);
  }, [config, selectedProjectId, setSelectedProjectId]);

  const getServerStatus = (projectId: string) => servers.find((s) => s.id === projectId);

  // ─── Collapsed icon view ───
  if (collapsed) {
    const renderIconBtn = (project: ProjectConfig) => {
      const isSelected = project.id === selectedProjectId;
      const server = getServerStatus(project.id);
      const isRunning = server?.status === "running";
      const isBuilding = server?.status === "building";
      const hasError = server?.status === "error";
      const hasStatusColor = isRunning || isBuilding || hasError;
      const borderColor = isRunning ? "var(--accent-green)"
        : isBuilding ? "var(--accent-yellow)"
        : hasError ? "var(--accent-red)"
        : isSelected ? "var(--border-color)" : "var(--border-subtle)";

      return (
        <button
          key={project.id}
          onClick={() => handleClick(project)}
          onContextMenu={(e) => handleContextMenu(e, project)}
          title={project.name}
          style={{
            width: "38px", height: "38px",
            borderRadius: "10px",
            border: `1.5px solid ${borderColor}`,
            background: isSelected ? "rgba(255,255,255,0.07)" : "transparent",
            color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
            fontSize: "12px", fontWeight: 600,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.12s",
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = HOVER_BG;
              if (!hasStatusColor) e.currentTarget.style.borderColor = "var(--border-color)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = "transparent";
              if (!hasStatusColor) e.currentTarget.style.borderColor = borderColor;
            }
          }}
        >
          {getInitials(project.name)}
        </button>
      );
    };

    return (
      <div
        className="flex flex-col items-center h-full shrink-0 grow-0 select-none"
        style={{
          width: "54px",
          background: "var(--bg-tertiary)",
          borderRight: "1px solid var(--border-subtle)",
          padding: "8px 0",
          gap: "4px",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {ungrouped.map((p) => renderIconBtn(p))}
        {groupOrder.map((group) => {
          const groupCollapsed = isGroupCollapsed(group);
          const groupItems = grouped[group];
          return (
            <div key={group} className="flex flex-col items-center" style={{ width: "100%", marginTop: "4px" }}>
              <button
                onClick={() => toggleGroupCollapse(group)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "100%", padding: "2px 0", gap: "3px",
                  background: "transparent", border: "none", cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, height: "1px", background: "var(--border-color)", margin: "0 6px" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {group.slice(0, 4).toUpperCase()}
                </span>
                <div style={{ flex: 1, height: "1px", background: "var(--border-color)", margin: "0 6px" }} />
              </button>
              {!groupCollapsed && (
                <div className="flex flex-col items-center" style={{ gap: "4px", marginTop: "4px" }}>
                  {groupItems.map((p) => renderIconBtn(p))}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Add button */}
        <button
          onClick={handleAddCurrentFolder}
          title="加入目前目錄"
          style={{
            width: "38px", height: "38px",
            borderRadius: "10px",
            border: `1.5px dashed ${addStatus === "success" ? "var(--accent-green)" : addStatus === "error" ? "var(--accent-red)" : "var(--border-color)"}`,
            background: "transparent",
            color: addStatus === "success" ? "var(--accent-green)" : addStatus === "error" ? "var(--accent-red)" : "var(--text-muted)",
            fontSize: "16px",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            if (addStatus === "idle") { e.currentTarget.style.borderColor = "var(--accent-green)"; e.currentTarget.style.color = "var(--accent-green)"; }
          }}
          onMouseLeave={(e) => {
            if (addStatus === "idle") { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-muted)"; }
          }}
        >
          {addStatus === "success" ? "✓" : addStatus === "error" ? "✗" : "+"}
        </button>

        {/* Expand button */}
        <button
          onClick={toggleCollapsed}
          title="展開專案列表"
          style={{
            width: "38px", height: "28px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: "4px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = HOVER_BG; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        {/* Context menu portal */}
        {renderContextMenu()}
      </div>
    );
  }

  // ─── Expanded full view ───

  const renderProject = (project: ProjectConfig) => {
    const isSelected = project.id === selectedProjectId;
    const server = getServerStatus(project.id);
    const showDot = server && server.status !== "stopped";

    return (
      <div
        key={project.id}
        onClick={() => handleClick(project)}
        onContextMenu={(e) => handleContextMenu(e, project)}
        className="cursor-pointer"
        style={{
          padding: "5px 8px",
          borderRadius: "6px",
          background: isSelected ? "rgba(255,255,255,0.07)" : "transparent",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = HOVER_BG; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
          {showDot ? (
            <span style={{
              flexShrink: 0, width: "5px", height: "5px", borderRadius: "50%",
              background: server!.status === "running" ? "var(--accent-green)"
                : server!.status === "building" ? "var(--accent-yellow)"
                : "var(--accent-red)",
              boxShadow: server!.status === "running" ? "0 0 4px var(--accent-green)" : "none",
            }} />
          ) : (
            <span style={{ flexShrink: 0, width: "5px" }} />
          )}
          <span className="truncate" style={{
            fontSize: "12px", fontWeight: isSelected ? 500 : 400,
            color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
            letterSpacing: "0.01em",
          }}>
            {project.name}
          </span>
        </div>
      </div>
    );
  };

  // Shared context menu renderer
  function renderContextMenu() {
    if (!ctxMenu) return null;
    return createPortal(
      <div
        ref={ctxRef}
        style={{
          position: "fixed", left: ctxMenu.x, top: ctxMenu.y, width: "210px",
          background: "var(--bg-elevated)", border: "1px solid var(--border-color)",
          borderRadius: "10px", padding: "5px 6px", zIndex: 9999,
          boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
        }}
      >
        {ctxView === "main" ? (
          <>
            <div style={{ padding: "6px 10px 8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{ctxMenu.project.name}</div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctxMenu.project.path}</div>
            </div>
            <ContextDivider />
            {(() => {
              const idx = config?.projects.findIndex((p) => p.id === ctxMenu.project.id) ?? -1;
              const total = config?.projects.length ?? 0;
              if (idx < 0 || total <= 1) return null;
              return (<>{idx > 0 && <ContextMenuItem label="↑ 上移" onClick={() => { moveProject(ctxMenu.project.id, "up"); setCtxMenu(null); }} />}{idx < total - 1 && <ContextMenuItem label="↓ 下移" onClick={() => { moveProject(ctxMenu.project.id, "down"); setCtxMenu(null); }} />}<ContextDivider /></>);
            })()}
            <ContextMenuItem label="設定組織 …" onClick={() => setCtxView("group")} />
            {(() => {
              const proj = ctxMenu.project;
              if (!proj.group) return null;
              const gi = groupOrder.indexOf(proj.group);
              const canUp = gi > 0; const canDown = gi < groupOrder.length - 1;
              if (!canUp && !canDown) return null;
              return (<><ContextDivider /><div style={{ fontSize: "10px", fontWeight: 500, color: "var(--text-muted)", padding: "4px 10px 4px", letterSpacing: "0.05em" }}>組織「{proj.group}」</div>{canUp && <ContextMenuItem label="↑ 組織上移" onClick={() => { moveProjectGroup(proj.group!, "up"); setCtxMenu(null); }} />}{canDown && <ContextMenuItem label="↓ 組織下移" onClick={() => { moveProjectGroup(proj.group!, "down"); setCtxMenu(null); }} />}</>);
            })()}
            <ContextDivider />
            <ContextMenuItem label="移除專案" danger onClick={() => { removeProject(ctxMenu.project.id); setCtxMenu(null); }} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px 6px" }}>
              <button onClick={() => setCtxView("main")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "14px", padding: "0 4px" }}>‹</button>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>設定組織</span>
            </div>
            <ContextDivider />
            {ctxMenu.project.group && (<><ContextMenuItem label="移出目前組織" muted onClick={() => { setProjectGroup(ctxMenu.project.id, undefined); setCtxMenu(null); }} /><ContextDivider /></>)}
            {groupOrder.length > 0 && (<>{groupOrder.map((g) => { const cur = ctxMenu.project.group === g; return <ContextMenuItem key={g} label={g} suffix={cur ? "✓" : undefined} muted={cur} onClick={() => { if (!cur) { setProjectGroup(ctxMenu.project.id, g); setCtxMenu(null); } }} />; })}<ContextDivider /></>)}
            <div style={{ padding: "6px 6px 4px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input ref={newGroupInputRef} type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newGroupName.trim()) { setProjectGroup(ctxMenu.project.id, newGroupName.trim()); setNewGroupName(""); setCtxMenu(null); } if (e.key === "Escape") setCtxMenu(null); }} placeholder="新組織名稱" style={{ flex: 1, fontSize: "12px", padding: "5px 8px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)", outline: "none", minWidth: 0 }} />
                <button onClick={() => { if (!newGroupName.trim()) return; setProjectGroup(ctxMenu.project.id, newGroupName.trim()); setNewGroupName(""); setCtxMenu(null); }} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border-color)", cursor: "pointer", background: newGroupName.trim() ? "var(--hover-bg)" : "transparent", color: newGroupName.trim() ? "var(--text-primary)" : "var(--text-muted)" }}>建立</button>
              </div>
            </div>
          </>
        )}
      </div>,
      document.body,
    );
  }

  return (
    <div className="flex h-full shrink-0 grow-0" style={{ width: `${projectListWidth}px` }}>
      <div className="flex flex-col h-full overflow-hidden flex-1 select-none" style={{ background: "var(--bg-tertiary)" }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "12px 12px 6px" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
            Projects
          </span>
          <button
            onClick={toggleCollapsed}
            title="收合為圖示"
            style={{
              width: "22px", height: "22px", borderRadius: "5px",
              border: "none", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = HOVER_BG; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>

        {/* Project list */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "2px 6px" }}>
          {ungrouped.map((p) => renderProject(p))}
          {groupOrder.map((group, gi) => {
            const groupCollapsed = isGroupCollapsed(group);
            const groupItems = grouped[group];
            return (
              <div key={group} style={{ marginTop: ungrouped.length > 0 || gi > 0 ? "8px" : "4px" }}>
                <button
                  onClick={() => toggleGroupCollapse(group)}
                  className="flex items-center gap-1.5 w-full"
                  style={{ padding: "3px 8px", background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <span style={{ fontSize: "7px", color: "var(--text-muted)", transition: "transform 0.15s", transform: groupCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", opacity: 0.7 }}>{group}</span>
                </button>
                {!groupCollapsed && groupItems.map((p) => renderProject(p))}
              </div>
            );
          })}
          {projects.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 8px", fontSize: "11px", color: "var(--text-muted)", opacity: 0.6 }}>尚未加入專案</div>
          )}
        </div>

        {/* Bottom: Add button */}
        <div style={{ padding: "8px 10px 10px" }}>
          <button
            onClick={handleAddCurrentFolder}
            className="flex items-center justify-center w-full rounded-md transition-all"
            style={{
              height: "30px", fontSize: "11px", fontWeight: 500, borderRadius: "8px",
              color: addStatus === "success" ? "var(--accent-green)" : addStatus === "error" ? "var(--accent-red)" : "var(--text-muted)",
              background: "transparent",
              border: `1px dashed ${addStatus === "success" ? "var(--accent-green)" : addStatus === "error" ? "var(--accent-red)" : "var(--border-color)"}`,
              cursor: "pointer", letterSpacing: "0.02em",
            }}
            onMouseEnter={(e) => { if (addStatus === "idle") { e.currentTarget.style.borderColor = "var(--accent-green)"; e.currentTarget.style.color = "var(--accent-green)"; e.currentTarget.style.background = "rgba(152, 195, 121, 0.05)"; } }}
            onMouseLeave={(e) => { if (addStatus === "idle") { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; } }}
            title="加入當前終端機目錄為專案"
          >
            {addStatus === "success" ? "✓ 已加入" : addStatus === "error" ? "✗ 無法加入" : "+ 加入目前目錄"}
          </button>
        </div>
      </div>

      {/* Right drag handle */}
      <div onMouseDown={onDragStart} className="h-full shrink-0 cursor-col-resize group" style={{ width: "5px", position: "relative" }}>
        <div className="absolute inset-y-0 right-0 transition-colors group-hover:bg-[var(--accent-blue)]" style={{ width: "1px", background: "var(--border-subtle)" }} />
      </div>

      {renderContextMenu()}
    </div>
  );
}
