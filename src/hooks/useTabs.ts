import { useCallback } from "react";
import { useStore } from "../store";
import type { Tab } from "../types";

let tabCounter = 1;

export function useTabs() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, updateTabTitle } =
    useStore();

  const createShellTab = useCallback(
    (cwd?: string, title?: string) => {
      tabCounter++;
      const tab: Tab = {
        id: `tab-${tabCounter}`,
        type: "shell",
        title: title ?? `zsh ${tabCounter}`,
        ptyId: `pty-${tabCounter}`,
        cwd,
      };
      addTab(tab);
      return tab;
    },
    [addTab]
  );

  const createLogTab = useCallback(
    (serverId: string, serverName: string) => {
      const existing = tabs.find(
        (t) => t.type === "log" && t.serverId === serverId
      );
      if (existing) {
        setActiveTab(existing.id);
        return existing;
      }
      tabCounter++;
      const tab: Tab = {
        id: `log-${serverId}`,
        type: "log",
        title: `${serverName} log`,
        serverId,
      };
      addTab(tab);
      return tab;
    },
    [tabs, addTab, setActiveTab]
  );

  const switchToClaudeTab = useCallback(() => {
    const claudeTab = tabs.find((t) => t.type === "claude");
    if (claudeTab) {
      setActiveTab(claudeTab.id);
    } else {
      tabCounter++;
      const tab: Tab = {
        id: "claude-tab",
        type: "claude",
        title: "claude",
        ptyId: `pty-${tabCounter}`,
      };
      addTab(tab);
    }
  }, [tabs, setActiveTab, addTab]);

  const switchToTab = useCallback(
    (index: number) => {
      if (index >= 0 && index < tabs.length) {
        setActiveTab(tabs[index].id);
      }
    },
    [tabs, setActiveTab]
  );

  const nextTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = (idx + 1) % tabs.length;
    setActiveTab(tabs[next].id);
  }, [tabs, activeTabId, setActiveTab]);

  const prevTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = (idx - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[prev].id);
  }, [tabs, activeTabId, setActiveTab]);

  return {
    tabs,
    activeTabId,
    createShellTab,
    createLogTab,
    switchToClaudeTab,
    switchToTab,
    nextTab,
    prevTab,
    removeTab,
    setActiveTab,
    updateTabTitle,
  };
}
