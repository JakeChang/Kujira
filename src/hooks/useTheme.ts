import { useEffect } from "react";
import { useStore } from "../store";
import { getThemeById } from "../themes";
import { persistConfig } from "../utils/persistConfig";

export function useTheme() {
  const config = useStore((s) => s.config);
  const themeId = config?.terminal.theme ?? "one-dark";

  useEffect(() => {
    const theme = getThemeById(themeId);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value);
    }
  }, [themeId]);
}

export function setTheme(themeId: string) {
  const { config } = useStore.getState();
  if (!config) return;

  // Apply CSS vars immediately
  const theme = getThemeById(themeId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }

  // Persist to config
  persistConfig({
    ...config,
    terminal: { ...config.terminal, theme: themeId },
  }).catch(console.error);
}
