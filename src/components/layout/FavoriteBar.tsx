import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import { useFavorites } from "../../hooks/useFavorites";
import { useTabs } from "../../hooks/useTabs";
import { useGroupedItems } from "../../hooks/useGroupedItems";
import { useStore } from "../../store";
import { FavoriteMenu } from "./FavoriteMenu";
import { SettingsModal } from "./SettingsModal";
import type { FavoriteConfig } from "../../types";

export function FavoriteBar() {
  const { favorites, addFavorite } = useFavorites();
  const { createShellTab, switchToClaudeTab } = useTabs();
  const { servers, tabs, activeTabId } = useStore(useShallow((s) => ({ servers: s.servers, tabs: s.tabs, activeTabId: s.activeTabId })));
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [menuFav, setMenuFav] = useState<FavoriteConfig | null>(null);
  const [addStatus, setAddStatus] = useState<"idle" | "success" | "error">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const getFavGroup = useCallback((f: FavoriteConfig) => f.group, []);
  const { ungrouped, groupOrder, grouped, toggleCollapse, isCollapsed } = useGroupedItems(favorites, getFavGroup);

  const getInitials = (name: string) => {
    const clean = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "");
    return (clean.slice(0, 2) || name.slice(0, 2)).toUpperCase();
  };

  const getServerStatus = (fav: FavoriteConfig) => {
    if (!fav.projectId) return null;
    return servers.find((s) => s.id === fav.projectId);
  };

  const statusBorderColor = (status?: string) => {
    switch (status) {
      case "running": return "var(--accent-green)";
      case "building": return "var(--accent-yellow)";
      case "error": return "var(--accent-red)";
      default: return "var(--border-color)";
    }
  };

  const handleFavoriteClick = (fav: FavoriteConfig) => {
    const parts = fav.path.split("/").filter(Boolean);
    const folderName = parts[parts.length - 1] || fav.name;
    createShellTab(fav.path, folderName);
  };

  const handleContextMenu = (e: React.MouseEvent, fav: FavoriteConfig) => {
    e.preventDefault();
    setMenuFav(menuFav?.path === fav.path ? null : fav);
  };

  const flashStatus = (status: "success" | "error") => {
    setAddStatus(status);
    setTimeout(() => setAddStatus("idle"), 1000);
  };

  const handleAddCurrentFolder = async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || activeTab.type !== "shell") {
      flashStatus("error");
      return;
    }
    const ptyId = activeTab.ptyId ?? activeTab.id;
    try {
      const cwd = await invoke<string>("pty_get_cwd", { id: ptyId });
      if (!cwd || !cwd.startsWith("/")) { flashStatus("error"); return; }
      if (favorites.some((f) => f.path === cwd)) { flashStatus("error"); return; }
      const parts = cwd.split("/").filter(Boolean);
      const folderName = parts[parts.length - 1] || "root";
      await addFavorite({ name: folderName, path: cwd });
      flashStatus("success");
    } catch {
      flashStatus("error");
    }
  };

  const renderFavButton = (fav: FavoriteConfig) => {
    const server = getServerStatus(fav);
    const isHovered = hoveredPath === fav.path;
    return (
      <div key={fav.path} className="shrink-0">
        <button
          onClick={() => handleFavoriteClick(fav)}
          onContextMenu={(e) => handleContextMenu(e, fav)}
          onMouseEnter={() => setHoveredPath(fav.path)}
          onMouseLeave={() => setHoveredPath(null)}
          className="flex items-center justify-center rounded-[10px] font-semibold transition-all cursor-pointer"
          style={{
            width: "36px",
            height: "36px",
            fontSize: "11px",
            fontFamily: "-apple-system, sans-serif",
            background: isHovered ? "var(--bg-elevated)" : "var(--bg-secondary)",
            color: isHovered ? "var(--text-primary)" : "var(--text-secondary)",
            border: `2px solid ${statusBorderColor(server?.status)}`,
            letterSpacing: "0.02em",
          }}
          title={`${fav.name} — ${fav.path}${fav.group ? `\n組織: ${fav.group}` : ""}\n點擊開新分頁，右鍵選單`}
        >
          {getInitials(fav.name)}
        </button>
      </div>
    );
  };

  const addBtnColor =
    addStatus === "success" ? "var(--accent-green)" :
    addStatus === "error" ? "var(--accent-red)" :
    "var(--text-muted)";

  return (
    <>
      <div
        className="flex flex-col items-center gap-1 h-full overflow-y-auto overflow-x-hidden shrink-0 grow-0 select-none"
        style={{
          width: "50px",
          background: "var(--bg-tertiary)",
          borderRight: "1px solid var(--border-subtle)",
          paddingTop: "8px",
          paddingBottom: "8px",
        }}
      >
        {/* Ungrouped favorites */}
        {ungrouped.map((fav) => renderFavButton(fav))}

        {/* Grouped favorites */}
        {groupOrder.map((group) => {
          const collapsed = isCollapsed(group);
          const groupFavs = grouped[group];
          const groupInitial = group.slice(0, 2).toUpperCase();
          return (
            <div key={group} className="flex flex-col items-center w-full shrink-0">
              <button
                onClick={() => {
                  for (const fav of groupFavs) {
                    const parts = fav.path.split("/").filter(Boolean);
                    const folderName = parts[parts.length - 1] || fav.name;
                    createShellTab(fav.path, folderName);
                  }
                }}
                onContextMenu={(e) => { e.preventDefault(); toggleCollapse(group); }}
                className="flex items-center justify-center cursor-pointer shrink-0 transition-all w-full"
                style={{
                  height: "20px",
                  marginTop: ungrouped.length > 0 || groupOrder.indexOf(group) > 0 ? "4px" : "0",
                  marginBottom: "2px",
                }}
                title={`${group}\n點擊開啟所有分頁 (${groupFavs.length} 個)\n右鍵收合/展開`}
              >
                <div className="flex items-center gap-0.5" style={{ width: "40px" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", lineHeight: 1, whiteSpace: "nowrap" }}>
                    {groupInitial}
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
                </div>
              </button>
              {!collapsed && (
                <div className="flex flex-col items-center gap-1">
                  {groupFavs.map((fav) => renderFavButton(fav))}
                </div>
              )}
              {collapsed && (
                <div
                  style={{ width: "24px", height: "4px", borderRadius: "2px", background: "var(--border-color)", opacity: 0.5 }}
                  title={`${group} — ${groupFavs.length} 個項目`}
                />
              )}
            </div>
          );
        })}

        {/* Add current folder */}
        <button
          onClick={handleAddCurrentFolder}
          className="flex items-center justify-center rounded-[10px] cursor-pointer shrink-0 transition-all"
          style={{ width: "36px", height: "36px", color: addBtnColor, borderWidth: "1.5px", borderStyle: "dashed", borderColor: addBtnColor }}
          title="將目前 shell 分頁的路徑加入最愛"
        >
          {addStatus === "success" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : addStatus === "error" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          )}
        </button>

        <div className="flex-1" />

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center rounded-[10px] cursor-pointer shrink-0 transition-all"
          style={{
            width: "36px",
            height: "36px",
            background: "var(--bg-secondary)",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-elevated)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-secondary)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
          title="設定 (主題、AI)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Claude shortcut */}
        <button
          onClick={() => switchToClaudeTab()}
          className="flex items-center justify-center rounded-[10px] cursor-pointer shrink-0 transition-all"
          style={{ width: "36px", height: "36px", background: "var(--bg-secondary)", color: "var(--accent-purple)", fontSize: "16px" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
          title="Claude Code (⌘K)"
        >
          ◆
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {menuFav && (
        <FavoriteMenu favorite={menuFav} onClose={() => setMenuFav(null)} />
      )}
    </>
  );
}
