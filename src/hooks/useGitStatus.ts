import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitInfo } from "../types";

function gitInfoEqual(a: GitInfo | null, b: GitInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.is_repo === b.is_repo &&
    a.branch === b.branch &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.staged === b.staged &&
    a.unstaged === b.unstaged &&
    a.untracked === b.untracked
  );
}

export function useGitStatus(ptyId: string | undefined, isActive: boolean) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const fetching = useRef(false);
  const lastGitRef = useRef<GitInfo | null>(null);
  const lastCwdRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!ptyId || fetching.current) return;
    fetching.current = true;
    try {
      const currentCwd = await invoke<string>("pty_get_cwd", { id: ptyId });
      if (currentCwd !== lastCwdRef.current) {
        lastCwdRef.current = currentCwd;
        setCwd(currentCwd);
      }
      const info = await invoke<GitInfo>("git_status", { path: currentCwd });
      if (!gitInfoEqual(info, lastGitRef.current)) {
        lastGitRef.current = info;
        setGitInfo(info);
      }
    } catch {
      if (lastGitRef.current !== null) {
        lastGitRef.current = null;
        setGitInfo(null);
      }
      if (lastCwdRef.current !== null) {
        lastCwdRef.current = null;
        setCwd(null);
      }
    } finally {
      fetching.current = false;
    }
  }, [ptyId]);

  useEffect(() => {
    if (!isActive || !ptyId) {
      return;
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [ptyId, isActive, fetchStatus]);

  return { gitInfo, cwd, refresh: fetchStatus };
}
