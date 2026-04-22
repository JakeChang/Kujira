import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import type { ServerStatus, ProjectConfig } from "../types";

export function useServers() {
  const { servers, setServers, updateServerStatus, config } = useStore(
    useShallow((s) => ({ servers: s.servers, setServers: s.setServers, updateServerStatus: s.updateServerStatus, config: s.config })),
  );

  // Listen for server status changes from Rust backend
  useEffect(() => {
    const unlisten = listen<{ id: string; status: string }>(
      "server-status-change",
      (event) => {
        updateServerStatus(event.payload.id, event.payload.status);
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [updateServerStatus]);

  // Sync server list with config.projects (only when projects with ports change)
  const lastProjectKeysRef = useRef("");

  useEffect(() => {
    if (!config) return;

    const serverProjects = config.projects.filter((p) => p.port != null);
    // Create a stable key from project IDs+names+ports
    const projectKeys = serverProjects.map((p) => `${p.id}:${p.name}:${p.port}`).join("|");

    if (projectKeys === lastProjectKeysRef.current) return;
    lastProjectKeysRef.current = projectKeys;

    // Merge: keep existing status, add new projects as stopped, remove deleted ones
    const currentServers = useStore.getState().servers;
    const newServers: ServerStatus[] = serverProjects.map((p) => {
      const existing = currentServers.find((s) => s.id === p.id);
      if (existing) {
        // Preserve status, update name/port in case they changed
        return { ...existing, name: p.name, port: p.port! };
      }
      return { id: p.id, name: p.name, port: p.port!, status: "stopped" as const };
    });

    setServers(newServers);
  }, [config, setServers]);

  const startServer = useCallback(
    async (project: ProjectConfig) => {
      updateServerStatus(project.id, "building");
      await invoke("server_start", {
        id: project.id,
        name: project.name,
        path: project.path,
        port: project.port,
        command: project.command ?? null,
      });
    },
    [updateServerStatus]
  );

  const stopServer = useCallback(
    async (id: string) => {
      await invoke("server_stop", { id });
      updateServerStatus(id, "stopped");
    },
    [updateServerStatus]
  );

  const restartServer = useCallback(
    async (project: ProjectConfig) => {
      updateServerStatus(project.id, "building");
      await invoke("server_restart", {
        id: project.id,
        name: project.name,
        path: project.path,
        port: project.port,
        command: project.command ?? null,
      });
    },
    [updateServerStatus]
  );

  const stopAll = useCallback(async () => {
    await invoke("server_stop_all");
    const current = useStore.getState().servers;
    setServers(current.map((s) => ({ ...s, status: "stopped" as const, pid: undefined, uptime_secs: undefined })));
  }, [setServers]);

  const startAll = useCallback(async () => {
    if (!config) return;
    await Promise.all(config.projects.filter((p) => p.port != null).map((p) => startServer(p)));
  }, [config, startServer]);

  return { servers, startServer, stopServer, restartServer, stopAll, startAll };
}
