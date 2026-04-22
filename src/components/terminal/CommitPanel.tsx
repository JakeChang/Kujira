import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClickOutside } from "../../hooks/useClickOutside";
import { PopoverPortal } from "../shared/PopoverPortal";
import type { GitInfo } from "../../types";

interface CommitPanelProps {
  cwd: string;
  gitInfo: GitInfo;
  anchorRect: DOMRect;
  onDone: () => void;
  onClose: () => void;
}

export function CommitPanel({ cwd, gitInfo, anchorRect, onDone, onClose }: CommitPanelProps) {
  const [message, setMessage] = useState("");
  const [stageAll, setStageAll] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useClickOutside(ref, onClose);

  const totalChanges = gitInfo.staged + gitInfo.unstaged + gitInfo.untracked;

  const handleCommit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await invoke("git_commit", { path: cwd, message: message.trim(), stageAll });
      onDone();
    } catch (e: any) {
      setError(e?.toString() || "Commit 失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PopoverPortal ref={ref} anchorRect={anchorRect} width="300px">
      {/* Header */}
      <div style={{ padding: "10px 12px 8px", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
        Git Commit
      </div>

      {/* Stats */}
      <div style={{ padding: "0 12px 10px", display: "flex", gap: "12px", fontSize: "11px" }}>
        {gitInfo.staged > 0 && (
          <span style={{ color: "var(--accent-green)" }}>已暫存 {gitInfo.staged}</span>
        )}
        {gitInfo.unstaged > 0 && (
          <span style={{ color: "var(--accent-yellow)" }}>未暫存 {gitInfo.unstaged}</span>
        )}
        {gitInfo.untracked > 0 && (
          <span style={{ color: "var(--text-muted)" }}>未追蹤 {gitInfo.untracked}</span>
        )}
      </div>

      {/* Stage all toggle */}
      {(gitInfo.unstaged > 0 || gitInfo.untracked > 0) && (
        <div style={{ padding: "0 12px 8px" }}>
          <label
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={stageAll}
              onChange={(e) => setStageAll(e.target.checked)}
              style={{ accentColor: "var(--accent-blue)" }}
            />
            全部加入暫存 (git add -A)
          </label>
        </div>
      )}

      {/* Message input */}
      <div style={{ padding: "0 12px 10px" }}>
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && message.trim()) handleCommit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Commit 訊息..."
          style={{
            width: "100%",
            fontSize: "12px",
            padding: "8px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            outline: "none",
          }}
          disabled={submitting}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "0 12px 8px", fontSize: "11px", color: "var(--accent-red)" }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: "flex", justifyContent: "flex-end", gap: "8px",
        padding: "8px 12px",
        borderTop: "1px solid var(--border-color)",
      }}>
        <button
          onClick={onClose}
          style={{
            fontSize: "11px", padding: "5px 12px", borderRadius: "5px",
            border: "none", cursor: "pointer",
            background: "transparent", color: "var(--text-muted)",
          }}
        >
          取消
        </button>
        <button
          onClick={handleCommit}
          disabled={!message.trim() || submitting || totalChanges === 0}
          style={{
            fontSize: "11px", fontWeight: 500, padding: "5px 14px", borderRadius: "5px",
            border: "none", cursor: message.trim() && !submitting ? "pointer" : "default",
            background: message.trim() && !submitting ? "var(--accent-green)" : "var(--border-color)",
            color: message.trim() && !submitting ? "#1a1d23" : "var(--text-muted)",
            transition: "all 0.15s",
          }}
        >
          {submitting ? "提交中..." : "Commit"}
        </button>
      </div>
    </PopoverPortal>
  );
}
