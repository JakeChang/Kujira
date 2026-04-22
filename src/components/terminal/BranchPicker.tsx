import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClickOutside } from "../../hooks/useClickOutside";
import { PopoverPortal } from "../shared/PopoverPortal";
import type { GitBranch } from "../../types";

interface BranchPickerProps {
  cwd: string;
  anchorRect: DOMRect;
  onSwitch: (branch: string) => void;
  onClose: () => void;
}

export function BranchPicker({ cwd, anchorRect, onSwitch, onClose }: BranchPickerProps) {
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<GitBranch[]>("git_branches", { path: cwd }).then(setBranches).catch(() => setBranches([]));
  }, [cwd]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useClickOutside(ref, onClose);

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PopoverPortal ref={ref} anchorRect={anchorRect} width="220px" maxHeight="280px">
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "280px" }}>
      <div style={{ padding: "8px 8px 6px" }}>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered.length === 1 && !filtered[0].is_current) {
              onSwitch(filtered[0].name);
            }
          }}
          placeholder="搜尋分支..."
          style={{
            width: "100%",
            fontSize: "12px",
            padding: "6px 8px",
            borderRadius: "5px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 4px" }}>
        {filtered.map((b) => (
          <button
            key={b.name}
            onClick={() => { if (!b.is_current) onSwitch(b.name); }}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "6px 8px",
              borderRadius: "5px",
              border: "none",
              background: b.is_current ? "var(--hover-bg)" : "transparent",
              color: b.is_current ? "var(--text-muted)" : "var(--text-primary)",
              fontSize: "12px",
              cursor: b.is_current ? "default" : "pointer",
              textAlign: "left",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!b.is_current) e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              if (!b.is_current) e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {b.name}
            </span>
            {b.is_current && (
              <span style={{ fontSize: "10px", color: "var(--accent-green)", marginLeft: "6px" }}>✓</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "12px 8px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
            找不到分支
          </div>
        )}
      </div>
      </div>
    </PopoverPortal>
  );
}
