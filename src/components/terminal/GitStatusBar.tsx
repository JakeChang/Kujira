import { useState, useRef, useCallback, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BranchPicker } from "./BranchPicker";
import { CommitPanel } from "./CommitPanel";
import type { GitInfo } from "../../types";

interface GitStatusBarProps {
  gitInfo: GitInfo | null;
  cwd: string | null;
  ptyId: string;
  onRefresh: () => void;
}

export function GitStatusBar({ gitInfo, cwd, ptyId, onRefresh }: GitStatusBarProps) {
  const [showBranches, setShowBranches] = useState(false);
  const [showCommit, setShowCommit] = useState(false);
  const branchRef = useRef<HTMLButtonElement>(null);
  const commitRef = useRef<HTMLButtonElement>(null);

  const writePty = useCallback(
    (cmd: string) => {
      invoke("pty_write", { id: ptyId, data: cmd + "\n" }).catch(console.error);
    },
    [ptyId],
  );

  if (!gitInfo || !gitInfo.is_repo || !cwd) return null;

  const totalChanges = gitInfo.staged + gitInfo.unstaged + gitInfo.untracked;

  return (
    <div
      className="select-none"
      style={{
        height: "28px",
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "0 12px",
        background: "var(--bg-tertiary)",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: "12px",
        flexShrink: 0,
      }}
    >
      {/* Branch */}
      <StatusBtn
        ref={branchRef}
        onClick={() => setShowBranches(!showBranches)}
        title="目前分支 — 點擊切換"
        color="var(--accent-purple)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: "4px", opacity: 0.7 }}>
          <path d="M5 3.25a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zM7.25 2a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM5 12.75a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm2.25-1.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM11.25 6.5a2.25 2.25 0 110 4.5 2.25 2.25 0 010-4.5zm0 1a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM7.75 5.25v5.5h-1V9.5A2.25 2.25 0 009 7.25h1.19A3.25 3.25 0 007.75 5.25z" />
        </svg>
        {gitInfo.branch ?? "HEAD"}
        <span style={{ marginLeft: "2px", fontSize: "10px", opacity: 0.5 }}>▾</span>
      </StatusBtn>

      {showBranches && branchRef.current && (
        <BranchPicker
          cwd={cwd}
          anchorRect={branchRef.current.getBoundingClientRect()}
          onSwitch={(branch) => {
            writePty(`git checkout ${branch}`);
            setShowBranches(false);
            setTimeout(onRefresh, 1000);
          }}
          onClose={() => setShowBranches(false)}
        />
      )}

      <Separator />

      {/* Changes */}
      {totalChanges > 0 && (
        <>
          <StatusBtn
            ref={commitRef}
            onClick={() => setShowCommit(!showCommit)}
            title={`已暫存 ${gitInfo.staged} / 未暫存 ${gitInfo.unstaged} / 未追蹤 ${gitInfo.untracked}`}
            color="var(--accent-yellow)"
          >
            ✱ {totalChanges}
          </StatusBtn>

          {showCommit && commitRef.current && (
            <CommitPanel
              cwd={cwd}
              gitInfo={gitInfo}
              anchorRect={commitRef.current.getBoundingClientRect()}
              onDone={() => {
                setShowCommit(false);
                onRefresh();
              }}
              onClose={() => setShowCommit(false)}
            />
          )}

          <Separator />
        </>
      )}

      {/* Ahead / Behind */}
      {(gitInfo.ahead > 0 || gitInfo.behind > 0) && (
        <>
          {gitInfo.ahead > 0 && (
            <span style={{ color: "var(--accent-blue)", fontVariantNumeric: "tabular-nums" }} title={`領先遠端 ${gitInfo.ahead} 個提交`}>
              ↑{gitInfo.ahead}
            </span>
          )}
          {gitInfo.behind > 0 && (
            <span style={{ color: "var(--accent-red)", fontVariantNumeric: "tabular-nums", marginLeft: gitInfo.ahead > 0 ? "4px" : "0" }} title={`落後遠端 ${gitInfo.behind} 個提交`}>
              ↓{gitInfo.behind}
            </span>
          )}
          <Separator />
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Pull */}
      {gitInfo.behind > 0 && (
        <StatusBtn
          onClick={() => { writePty("git pull"); setTimeout(onRefresh, 2000); }}
          title="執行 git pull"
          color="var(--accent-blue)"
        >
          ↓ Pull
        </StatusBtn>
      )}

      {/* Push */}
      {gitInfo.ahead > 0 && (
        <StatusBtn
          onClick={() => { writePty("git push"); setTimeout(onRefresh, 2000); }}
          title="執行 git push"
          color="var(--accent-green)"
        >
          ↑ Push
        </StatusBtn>
      )}

      {/* Commit button (always visible if changes) */}
      {totalChanges > 0 && (
        <StatusBtn
          onClick={() => setShowCommit(!showCommit)}
          title="快速 commit"
          color="var(--text-secondary)"
        >
          Commit
        </StatusBtn>
      )}
    </div>
  );
}

function Separator() {
  return (
    <div style={{ width: "1px", height: "14px", background: "var(--border-color)", margin: "0 6px", flexShrink: 0 }} />
  );
}

const StatusBtn = forwardRef<HTMLButtonElement, {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  color: string;
}>(function StatusBtn({ children, onClick, title, color }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "2px 6px",
        borderRadius: "4px",
        border: "none",
        background: "transparent",
        color,
        fontSize: "12px",
        cursor: "pointer",
        transition: "background 0.1s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
});
