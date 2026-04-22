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

export function useProjectGitStatus(path: string | null) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const fetching = useRef(false);
  const lastRef = useRef<GitInfo | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!path || fetching.current) return;
    fetching.current = true;
    try {
      const info = await invoke<GitInfo>("git_status", { path });
      if (!gitInfoEqual(info, lastRef.current)) {
        lastRef.current = info;
        setGitInfo(info);
      }
    } catch {
      if (lastRef.current !== null) {
        lastRef.current = null;
        setGitInfo(null);
      }
    } finally {
      fetching.current = false;
    }
  }, [path]);

  useEffect(() => {
    if (!path) {
      setGitInfo(null);
      lastRef.current = null;
      return;
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [path, fetchStatus]);

  return { gitInfo, refresh: fetchStatus };
}
