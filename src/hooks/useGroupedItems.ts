import { useState, useMemo, useCallback } from "react";

export function useGroupedItems<T>(
  items: T[],
  getGroup: (item: T) => string | undefined,
) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { ungrouped, groupOrder, grouped } = useMemo(() => {
    const ungrouped: T[] = [];
    const groupOrder: string[] = [];
    const grouped: Record<string, T[]> = {};

    for (const item of items) {
      const g = getGroup(item);
      if (!g) {
        ungrouped.push(item);
      } else {
        if (!grouped[g]) {
          grouped[g] = [];
          groupOrder.push(g);
        }
        grouped[g].push(item);
      }
    }

    return { ungrouped, groupOrder, grouped };
  }, [items, getGroup]);

  const toggleCollapse = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (group: string) => collapsedGroups.has(group),
    [collapsedGroups],
  );

  return { ungrouped, groupOrder, grouped, toggleCollapse, isCollapsed };
}
