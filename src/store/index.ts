import { create } from "zustand";
import type {
  AppConfig,
  Tab,
  ServerStatus,
  ClaudeQuota,
  DailyUsage,
} from "../types";

interface AppState {
  // Config
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Tabs
  tabs: Tab[];
  activeTabId: string;
  addTab: (tab: Tab) => void;
  removeTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;

  // Layout
  favoriteBarVisible: boolean;
  rightPanelVisible: boolean;
  projectListVisible: boolean;
  projectListCollapsed: boolean;
  toggleFavoriteBar: () => void;
  toggleRightPanel: () => void;
  toggleProjectList: () => void;
  toggleProjectListCollapsed: () => void;

  // Servers
  servers: ServerStatus[];
  setServers: (servers: ServerStatus[]) => void;
  updateServerStatus: (id: string, status: string) => void;
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;

  // Claude
  claudeQuota: ClaudeQuota | null;
  setClaudeQuota: (quota: ClaudeQuota | null) => void;
  claudeLoginStatus: "checking" | "logged_out" | "logged_in" | "logging_in";
  setClaudeLoginStatus: (status: "checking" | "logged_out" | "logged_in" | "logging_in") => void;
  claudeDaily: DailyUsage[] | null;
  setClaudeDaily: (daily: DailyUsage[] | null) => void;

  // Layout sizing
  rightPanelWidth: number;
  setRightPanelWidth: (w: number) => void;
  rightPanelSplitRatio: number;
  setRightPanelSplitRatio: (r: number) => void;
  projectListWidth: number;
  setProjectListWidth: (w: number) => void;

  // Selected project
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Font size
  fontSize: number;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;

}

export const useStore = create<AppState>((set) => ({
  // Config
  config: null,
  setConfig: (config) =>
    set({
      config,
      favoriteBarVisible: config.layout.favoriteBarVisible,
      rightPanelVisible: config.layout.rightPanelVisible,
      rightPanelWidth: config.layout.rightPanelWidth ?? 260,
      rightPanelSplitRatio: config.layout.rightPanelSplitRatio ?? 0.6,
      projectListVisible: config.layout.projectListVisible ?? true,
      projectListWidth: config.layout.projectListWidth ?? 160,
      projectListCollapsed: config.layout.projectListCollapsed ?? false,
      fontSize: config.terminal.fontSize,
    }),

  // Tabs
  tabs: [],
  activeTabId: "",
  addTab: (tab) => set((s) => {
    // Insert before claude tab
    const claudeIdx = s.tabs.findIndex((t) => t.type === "claude");
    const newTabs = [...s.tabs];
    if (claudeIdx >= 0) {
      newTabs.splice(claudeIdx, 0, tab);
    } else {
      newTabs.push(tab);
    }
    return { tabs: newTabs, activeTabId: tab.id };
  }),
  reorderTabs: (fromIndex, toIndex) =>
    set((s) => {
      const newTabs = [...s.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    }),
  removeTab: (id) =>
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newActive =
        s.activeTabId === id
          ? newTabs[Math.max(0, newTabs.length - 2)]?.id ?? newTabs[0]?.id ?? ""
          : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActive };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTabTitle: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  // Layout
  favoriteBarVisible: true,
  rightPanelVisible: true,
  projectListVisible: true,
  projectListCollapsed: false,
  toggleFavoriteBar: () =>
    set((s) => ({ favoriteBarVisible: !s.favoriteBarVisible })),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  toggleProjectList: () =>
    set((s) => ({ projectListVisible: !s.projectListVisible })),
  toggleProjectListCollapsed: () =>
    set((s) => ({ projectListCollapsed: !s.projectListCollapsed })),

  // Servers
  servers: [],
  setServers: (servers) => set({ servers }),
  updateServerStatus: (id, status) =>
    set((s) => ({
      servers: s.servers.map((srv) =>
        srv.id === id ? { ...srv, status: status as ServerStatus["status"] } : srv
      ),
    })),
  selectedServerId: null,
  setSelectedServerId: (id) => set({ selectedServerId: id }),

  // Claude
  claudeQuota: null,
  setClaudeQuota: (quota) => set({ claudeQuota: quota }),
  claudeLoginStatus: "checking",
  setClaudeLoginStatus: (status) => set({ claudeLoginStatus: status }),
  claudeDaily: null,
  setClaudeDaily: (daily) => set({ claudeDaily: daily }),

  // Layout sizing
  rightPanelWidth: 260,
  setRightPanelWidth: (w) => set({ rightPanelWidth: w }),
  rightPanelSplitRatio: 0.6,
  setRightPanelSplitRatio: (r) => set({ rightPanelSplitRatio: r }),
  projectListWidth: 160,
  setProjectListWidth: (w) => set({ projectListWidth: w }),

  // Selected project
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  // Font size
  fontSize: 14,
  increaseFontSize: () =>
    set((s) => ({ fontSize: Math.min(s.fontSize + 1, 24) })),
  decreaseFontSize: () =>
    set((s) => ({ fontSize: Math.max(s.fontSize - 1, 10) })),

}));
