import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import type { ClaudeQuota, DailyUsage } from "../types";

function quotaEqual(a: ClaudeQuota | null, b: ClaudeQuota | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sessionUtilization === b.sessionUtilization &&
    a.weeklyUtilization === b.weeklyUtilization &&
    a.sonnetUtilization === b.sonnetUtilization &&
    a.sessionResetsAt === b.sessionResetsAt &&
    a.weeklyResetsAt === b.weeklyResetsAt &&
    a.sonnetResetsAt === b.sonnetResetsAt &&
    a.isLoggedIn === b.isLoggedIn
  );
}

export function useClaudeUsage() {
  const { setClaudeQuota, setClaudeDaily, claudeLoginStatus, setClaudeLoginStatus } = useStore(
    useShallow((s) => ({
      setClaudeQuota: s.setClaudeQuota,
      setClaudeDaily: s.setClaudeDaily,
      claudeLoginStatus: s.claudeLoginStatus,
      setClaudeLoginStatus: s.setClaudeLoginStatus,
    })),
  );
  const lastQuotaRef = useRef<ClaudeQuota | null>(null);

  // Daily token usage from local JSONL — incremental, cheap after first run.
  // Independent of login state.
  useEffect(() => {
    let cancelled = false;
    const fetchDaily = async () => {
      try {
        const daily = await invoke<DailyUsage[]>("claude_daily_usage_read", { days: 14 });
        if (!cancelled) setClaudeDaily(daily);
      } catch { /* ignore — projects dir may not exist */ }
    };
    fetchDaily();
    const iv = setInterval(fetchDaily, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [setClaudeDaily]);

  useEffect(() => {
    invoke<boolean>("claude_has_session").then((has) => {
      setClaudeLoginStatus(has ? "logged_in" : "logged_out");
    });
  }, [setClaudeLoginStatus]);

  useEffect(() => {
    if (claudeLoginStatus !== "logged_in") return;
    const fetchQuota = async () => {
      try {
        const q = await invoke<ClaudeQuota>("claude_quota_read");
        if (!quotaEqual(q, lastQuotaRef.current)) {
          lastQuotaRef.current = q;
          setClaudeQuota(q);
        }
      } catch (e: unknown) {
        const msg = String(e);
        if (msg.includes("expired") || msg.includes("Not logged in") || msg.includes("401") || msg.includes("403")) {
          setClaudeLoginStatus("logged_out");
          setClaudeQuota(null);
          lastQuotaRef.current = null;
          const has = await invoke<boolean>("claude_has_session").catch(() => false);
          if (has) await invoke("claude_clear_session").catch(() => {});
        }
      }
    };
    fetchQuota();
    const iv = setInterval(fetchQuota, 60_000);
    return () => clearInterval(iv);
  }, [claudeLoginStatus, setClaudeQuota, setClaudeLoginStatus]);
}
