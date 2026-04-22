import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { useTabs } from "./hooks/useTabs";
import { useClaudeUsage } from "./hooks/useClaudeUsage";
import { useServers } from "./hooks/useServers";
import { useTheme } from "./hooks/useTheme";
import { ProjectList } from "./components/layout/ProjectList";
import { ProjectDetail } from "./components/layout/ProjectDetail";
import { persistConfig } from "./utils/persistConfig";
import { TabBar } from "./components/terminal/TabBar";
import { TerminalPane } from "./components/terminal/TerminalPane";
import { WelcomeOverlay } from "./components/terminal/WelcomeOverlay";
import { LogPane } from "./components/servers/LogPane";
import type { AppConfig } from "./types";

export default function App() {
  const { config, setConfig, projectListVisible, rightPanelVisible, toggleProjectList, toggleRightPanel, increaseFontSize, decreaseFontSize } = useStore(
    useShallow((s) => ({
      config: s.config, setConfig: s.setConfig,
      projectListVisible: s.projectListVisible, rightPanelVisible: s.rightPanelVisible,
      toggleProjectList: s.toggleProjectList, toggleRightPanel: s.toggleRightPanel,
      increaseFontSize: s.increaseFontSize, decreaseFontSize: s.decreaseFontSize,
    })),
  );
  const { tabs, activeTabId, createShellTab, switchToClaudeTab, switchToTab, nextTab, prevTab, removeTab, setActiveTab } = useTabs();
  useClaudeUsage();
  useServers();
  useTheme();

  // Wrap toggles with config persistence
  const handleToggleRightPanel = useCallback(() => {
    toggleRightPanel();
    const s = useStore.getState();
    if (s.config) {
      persistConfig({ ...s.config, layout: { ...s.config.layout, rightPanelVisible: s.rightPanelVisible } }).catch(console.error);
    }
  }, [toggleRightPanel]);

  const handleToggleProjectList = useCallback(() => {
    toggleProjectList();
    const s = useStore.getState();
    if (s.config) {
      persistConfig({ ...s.config, layout: { ...s.config.layout, projectListVisible: s.projectListVisible } }).catch(console.error);
    }
  }, [toggleProjectList]);

  // Sync selectedProjectId when active tab changes
  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab?.cwd || !config) return;
    const matchingProject = config.projects.find((p) => activeTab.cwd === p.path);
    if (matchingProject) {
      const s = useStore.getState();
      if (s.selectedProjectId !== matchingProject.id) {
        s.setSelectedProjectId(matchingProject.id);
      }
    }
  }, [activeTabId, tabs, config]);

  // Load config on mount
  useEffect(() => {
    invoke<AppConfig>("config_read")
      .then(setConfig)
      .catch(console.error);
  }, [setConfig]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey) return;

      switch (e.key) {
        case "t":
          e.preventDefault();
          createShellTab();
          break;
        case "w":
          e.preventDefault();
          removeTab(activeTabId);
          break;
        case "b":
          e.preventDefault();
          handleToggleProjectList();
          break;
        case "p":
          e.preventDefault();
          handleToggleRightPanel();
          break;
        case "k":
          e.preventDefault();
          switchToClaudeTab();
          break;
        case "]":
          e.preventDefault();
          nextTab();
          break;
        case "[":
          e.preventDefault();
          prevTab();
          break;
        case "=":
          e.preventDefault();
          increaseFontSize();
          break;
        case "-":
          e.preventDefault();
          decreaseFontSize();
          break;
        default:
          // Cmd+1-9
          if (e.key >= "1" && e.key <= "9") {
            e.preventDefault();
            switchToTab(parseInt(e.key) - 1);
          }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, createShellTab, removeTab, handleToggleProjectList, handleToggleRightPanel, switchToClaudeTab, nextTab, prevTab, switchToTab, increaseFontSize, decreaseFontSize]);

  // Remove splash screen once config is loaded
  useEffect(() => {
    if (config) {
      const splash = document.getElementById("splash");
      if (splash) {
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 300);
      }
    }
  }, [config]);

  if (!config) return null;

  return (
    <div className="h-full w-full flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Main: three columns filling full height */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Project List (left, full height) */}
        {projectListVisible && <ProjectList />}

        {/* Center: Tab Bar + Terminal */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Tab Bar (center only) */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTab}
            onClose={removeTab}
            onNewTab={createShellTab}
          />

          {/* Terminal Area */}
          <div className="flex-1 min-h-0 relative">
            {tabs.length === 0 && <WelcomeOverlay />}
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className="absolute inset-0"
                  style={{
                    visibility: active ? "visible" : "hidden",
                    zIndex: active ? 1 : 0,
                    pointerEvents: active ? "auto" : "none",
                  }}
                >
                  {tab.type === "log" ? (
                    <LogPane tab={tab} isActive={active} />
                  ) : (
                    <TerminalPane tab={tab} isActive={active} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Detail (right, full height) */}
        {rightPanelVisible && <ProjectDetail />}
      </div>
    </div>
  );
}
