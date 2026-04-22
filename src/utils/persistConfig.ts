import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import type { AppConfig } from "../types";

export async function persistConfig(updated: AppConfig): Promise<void> {
  await invoke("config_write", { config: updated });
  useStore.getState().setConfig(updated);
}
