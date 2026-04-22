import { useRef, useState, useEffect } from "react";
import { useFavorites } from "../../hooks/useFavorites";
import { useTabs } from "../../hooks/useTabs";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useStore } from "../../store";
import { ContextMenuItem, ContextDivider } from "../shared/ContextMenu";
import type { FavoriteConfig } from "../../types";

interface FavoriteMenuProps {
  favorite: FavoriteConfig;
  onClose: () => void;
}

type MenuView = "main" | "group";

export function FavoriteMenu({ favorite, onClose }: FavoriteMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { favorites, removeFavorite, moveFavorite, moveGroup, setFavoriteGroup, renameGroup, groups } = useFavorites();
  const { createShellTab } = useTabs();
  const servers = useStore((s) => s.servers);
  const favIdx = favorites.findIndex((f) => f.path === favorite.path);
  const canMoveUp = favIdx > 0;
  const canMoveDown = favIdx >= 0 && favIdx < favorites.length - 1;

  // Group ordering
  const groupIdx = favorite.group ? groups.indexOf(favorite.group) : -1;
  const canGroupUp = groupIdx > 0;
  const canGroupDown = groupIdx >= 0 && groupIdx < groups.length - 1;

  const [view, setView] = useState<MenuView>("main");
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);

  const server = favorite.projectId
    ? servers.find((s) => s.id === favorite.projectId)
    : null;

  useClickOutside(menuRef, onClose);

  useEffect(() => {
    if (view === "group" && newGroupInputRef.current) {
      newGroupInputRef.current.focus();
    }
  }, [view]);

  useEffect(() => {
    if (editingGroup && editGroupInputRef.current) {
      editGroupInputRef.current.focus();
      editGroupInputRef.current.select();
    }
  }, [editingGroup]);

  const handleOpen = () => {
    const folderName = favorite.path.split("/").pop() || favorite.name;
    createShellTab(favorite.path, folderName);
    onClose();
  };

  const handleRemove = async () => {
    await removeFavorite(favorite.path);
    onClose();
  };

  const handleSetGroup = async (group: string | undefined) => {
    await setFavoriteGroup(favorite.path, group);
    onClose();
  };

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    await setFavoriteGroup(favorite.path, trimmed);
    onClose();
  };

  const handleRenameGroup = async (oldName: string) => {
    const trimmed = editGroupValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingGroup(null);
      return;
    }
    await renameGroup(oldName, trimmed);
    setEditingGroup(null);
  };

  // Main menu view
  if (view === "main") {
    return (
      <div
        ref={menuRef}
        className="absolute z-50 rounded-xl shadow-2xl overflow-hidden"
        style={{
          left: "54px",
          top: "60px",
          width: "260px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px 10px" }}>
          <div className="font-semibold text-[13px]" style={{ color: "var(--text-primary)", marginBottom: "3px" }}>
            {favorite.name}
          </div>
          <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
            {favorite.path}
          </div>
          {favorite.group && (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)", marginTop: "5px" }}>
              <span style={{ fontSize: "7px", opacity: 0.7 }}>■</span>
              {favorite.group}
            </div>
          )}
          {server && (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)", marginTop: "5px" }}>
              <span style={{
                color: server.status === "running" ? "var(--accent-green)" :
                       server.status === "error" ? "var(--accent-red)" : "var(--text-muted)",
                fontSize: "6px",
              }}>●</span>
              {server.status} · port {server.port}
            </div>
          )}
        </div>

        <ContextDivider />

        <div style={{ padding: "5px 6px" }}>
          <ContextMenuItem label="在新分頁開啟" onClick={handleOpen} />
          <ContextMenuItem label="設定組織 …" onClick={() => setView("group")} />
        </div>

        <ContextDivider />

        <div style={{ padding: "5px 6px" }}>
          {canMoveUp && (
            <ContextMenuItem label="↑ 上移" onClick={() => { moveFavorite(favIdx, "up"); onClose(); }} />
          )}
          {canMoveDown && (
            <ContextMenuItem label="↓ 下移" onClick={() => { moveFavorite(favIdx, "down"); onClose(); }} />
          )}
        </div>

        {(canGroupUp || canGroupDown) && (
          <>
            <ContextDivider />
            <div style={{ padding: "5px 6px" }}>
              <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)", padding: "4px 10px 4px", letterSpacing: "0.05em" }}>
                組織「{favorite.group}」
              </div>
              {canGroupUp && (
                <ContextMenuItem label="↑ 組織上移" onClick={() => { moveGroup(favorite.group!, "up"); onClose(); }} />
              )}
              {canGroupDown && (
                <ContextMenuItem label="↓ 組織下移" onClick={() => { moveGroup(favorite.group!, "down"); onClose(); }} />
              )}
            </div>
          </>
        )}

        <ContextDivider />

        <div style={{ padding: "5px 6px 6px" }}>
          <ContextMenuItem label="移除最愛" onClick={handleRemove} danger />
        </div>
      </div>
    );
  }

  // Group management view
  return (
    <div
      ref={menuRef}
      className="absolute z-50 rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: "54px",
        top: "60px",
        width: "260px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Back header */}
      <div
        className="flex items-center gap-2"
        style={{ padding: "10px 12px 8px" }}
      >
        <button
          onClick={() => setView("main")}
          className="flex items-center justify-center rounded-md cursor-pointer transition-colors"
          style={{
            width: "24px",
            height: "24px",
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ‹
        </button>
        <span className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>
          設定組織
        </span>
      </div>

      <ContextDivider />

      {/* Remove from group */}
      {favorite.group && (
        <>
          <div style={{ padding: "5px 6px" }}>
            <ContextMenuItem label="移出目前組織" onClick={() => handleSetGroup(undefined)} muted />
          </div>
          <ContextDivider />
        </>
      )}

      {/* Existing groups */}
      {groups.length > 0 && (
        <>
          <div style={{ padding: "5px 6px" }}>
            <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)", padding: "4px 10px 6px", letterSpacing: "0.05em" }}>
              現有組織
            </div>
            {groups.map((g) => (
              <div key={g} className="flex items-center">
                {editingGroup === g ? (
                  <div className="flex items-center gap-1 flex-1" style={{ padding: "3px 6px" }}>
                    <input
                      ref={editGroupInputRef}
                      type="text"
                      value={editGroupValue}
                      onChange={(e) => setEditGroupValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameGroup(g);
                        if (e.key === "Escape") setEditingGroup(null);
                      }}
                      onBlur={() => handleRenameGroup(g)}
                      className="flex-1 text-[12.5px] rounded-md outline-none"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--accent-blue, var(--border-color))",
                        padding: "4px 8px",
                        minWidth: 0,
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => g !== favorite.group ? handleSetGroup(g) : undefined}
                      className="flex items-center flex-1 text-left text-[12.5px] rounded-lg transition-colors"
                      style={{
                        color: g === favorite.group ? "var(--text-muted)" : "var(--text-primary)",
                        padding: "7px 10px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="flex-1">{g}</span>
                      {g === favorite.group && (
                        <span style={{ fontSize: "11px", color: "var(--accent-green)" }}>✓</span>
                      )}
                    </button>
                    <button
                      onClick={() => { setEditingGroup(g); setEditGroupValue(g); }}
                      className="flex items-center justify-center rounded-md cursor-pointer transition-colors shrink-0"
                      style={{
                        width: "26px",
                        height: "26px",
                        color: "var(--text-muted)",
                        background: "transparent",
                        fontSize: "11px",
                        marginRight: "4px",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--hover-bg)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                      title="重新命名"
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <ContextDivider />
        </>
      )}

      {/* New group */}
      <div style={{ padding: "8px 10px 10px" }}>
        <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)", padding: "0 4px 6px", letterSpacing: "0.05em" }}>
          建立新組織
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={newGroupInputRef}
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateGroup();
              if (e.key === "Escape") setView("main");
            }}
            placeholder="組織名稱"
            className="flex-1 text-[12.5px] rounded-md outline-none"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              padding: "6px 10px",
              minWidth: 0,
            }}
          />
          <button
            onClick={handleCreateGroup}
            className="text-[12px] rounded-md cursor-pointer transition-colors shrink-0"
            style={{
              padding: "5px 10px",
              color: newGroupName.trim() ? "var(--text-primary)" : "var(--text-muted)",
              background: newGroupName.trim() ? "var(--hover-bg)" : "transparent",
              border: "1px solid var(--border-color)",
            }}
            onMouseEnter={(e) => {
              if (newGroupName.trim()) e.currentTarget.style.background = "var(--bg-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = newGroupName.trim() ? "var(--hover-bg)" : "transparent";
            }}
          >
            建立
          </button>
        </div>
      </div>
    </div>
  );
}

