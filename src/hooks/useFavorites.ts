import { useCallback } from "react";
import { useStore } from "../store";
import { persistConfig } from "../utils/persistConfig";
import type { FavoriteConfig } from "../types";

export function useFavorites() {
  const getFreshConfig = () => useStore.getState().config;
  const favorites = useStore((s) => s.config?.favorites ?? []);

  const addFavorite = useCallback(async (fav: FavoriteConfig) => {
    const config = getFreshConfig();
    if (!config) return;
    if (config.favorites.some((f) => f.path === fav.path)) return;
    await persistConfig({ ...config, favorites: [...config.favorites, fav] });
  }, []);

  const removeFavorite = useCallback(async (path: string) => {
    const config = getFreshConfig();
    if (!config) return;
    await persistConfig({ ...config, favorites: config.favorites.filter((f) => f.path !== path) });
  }, []);

  const moveFavorite = useCallback(async (idx: number, direction: "up" | "down") => {
    const config = getFreshConfig();
    if (!config) return;
    const toIdx = direction === "up" ? idx - 1 : idx + 1;
    if (toIdx < 0 || toIdx >= config.favorites.length) return;
    const favs = [...config.favorites];
    [favs[idx], favs[toIdx]] = [favs[toIdx], favs[idx]];
    await persistConfig({ ...config, favorites: favs });
  }, []);

  const setFavoriteGroup = useCallback(async (path: string, group: string | undefined) => {
    const config = getFreshConfig();
    if (!config) return;
    await persistConfig({
      ...config,
      favorites: config.favorites.map((f) => (f.path === path ? { ...f, group } : f)),
    });
  }, []);

  const moveGroup = useCallback(async (groupName: string, direction: "up" | "down") => {
    const config = getFreshConfig();
    if (!config) return;
    const favs = config.favorites;
    const order: string[] = [];
    for (const f of favs) {
      if (f.group && !order.includes(f.group)) order.push(f.group);
    }
    const idx = order.indexOf(groupName);
    const toIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || toIdx < 0 || toIdx >= order.length) return;
    [order[idx], order[toIdx]] = [order[toIdx], order[idx]];
    const ungrouped = favs.filter((f) => !f.group);
    const reordered = [
      ...ungrouped,
      ...order.flatMap((g) => favs.filter((f) => f.group === g)),
    ];
    await persistConfig({ ...config, favorites: reordered });
  }, []);

  const renameGroup = useCallback(async (oldName: string, newName: string) => {
    const config = getFreshConfig();
    if (!config) return;
    await persistConfig({
      ...config,
      favorites: config.favorites.map((f) => (f.group === oldName ? { ...f, group: newName } : f)),
    });
  }, []);

  const groups = [...new Set(favorites.map((f) => f.group).filter(Boolean))] as string[];

  return { favorites, addFavorite, removeFavorite, moveFavorite, moveGroup, setFavoriteGroup, renameGroup, groups };
}
