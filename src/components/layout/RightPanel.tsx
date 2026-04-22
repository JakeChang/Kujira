import { useCallback, useRef, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { persistConfig } from "../../utils/persistConfig";
import { ServerPanel } from "../servers/ServerPanel";
import { ClaudeUsage } from "../claude/ClaudeUsage";

export function RightPanel() {
  const {
    rightPanelWidth,
    setRightPanelWidth,
    rightPanelSplitRatio,
    setRightPanelSplitRatio,
    config,
  } = useStore(
    useShallow((s) => ({
      rightPanelWidth: s.rightPanelWidth, setRightPanelWidth: s.setRightPanelWidth,
      rightPanelSplitRatio: s.rightPanelSplitRatio, setRightPanelSplitRatio: s.setRightPanelSplitRatio,
      config: s.config,
    })),
  );

  // === Horizontal resize (panel width) ===
  const hDragging = useRef(false);
  const hStartX = useRef(0);
  const hStartWidth = useRef(0);
  const latestWidth = useRef(rightPanelWidth);

  useEffect(() => {
    latestWidth.current = rightPanelWidth;
  }, [rightPanelWidth]);

  const onHMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      hDragging.current = true;
      hStartX.current = e.clientX;
      hStartWidth.current = rightPanelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [rightPanelWidth]
  );

  // === Vertical resize (split ratio) ===
  const vDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRatio = useRef(rightPanelSplitRatio);

  useEffect(() => {
    latestRatio.current = rightPanelSplitRatio;
  }, [rightPanelSplitRatio]);

  const onVMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    vDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Combined mouse listeners
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (hDragging.current) {
        const delta = hStartX.current - e.clientX;
        const newWidth = Math.min(500, Math.max(180, hStartWidth.current + delta));
        setRightPanelWidth(newWidth);
      }
      if (vDragging.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = Math.min(0.85, Math.max(0.15, y / rect.height));
        setRightPanelSplitRatio(ratio);
      }
    };

    const onMouseUp = () => {
      const wasHDragging = hDragging.current;
      const wasVDragging = vDragging.current;

      if (wasHDragging) {
        hDragging.current = false;
      }
      if (wasVDragging) {
        vDragging.current = false;
      }

      if (wasHDragging || wasVDragging) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Persist to config
        if (config) {
          persistConfig({
            ...config,
            layout: {
              ...config.layout,
              rightPanelWidth: latestWidth.current,
              rightPanelSplitRatio: latestRatio.current,
            },
          }).catch(console.error);
        }
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setRightPanelWidth, setRightPanelSplitRatio, config]);

  return (
    <div
      className="flex h-full shrink-0 grow-0"
      style={{ width: `${rightPanelWidth}px` }}
    >
      {/* Horizontal drag handle */}
      <div
        onMouseDown={onHMouseDown}
        className="h-full shrink-0 cursor-col-resize group"
        style={{ width: "5px", position: "relative" }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-colors group-hover:bg-[var(--accent-blue)]"
          style={{ width: "1px", background: "var(--border-subtle)" }}
        />
      </div>

      {/* Panel content */}
      <div
        ref={containerRef}
        className="flex flex-col h-full overflow-hidden flex-1"
        style={{ background: "var(--bg-tertiary)" }}
      >
        {/* Dev Servers - top */}
        <div
          className="min-h-0 overflow-hidden"
          style={{
            flex: `${rightPanelSplitRatio} 1 0%`,
            margin: "6px 6px 0",
            borderRadius: "8px",
            background: "var(--bg-secondary)",
          }}
        >
          <ServerPanel />
        </div>

        {/* Vertical drag handle */}
        <div
          onMouseDown={onVMouseDown}
          className="shrink-0 cursor-row-resize group"
          style={{ height: "7px", position: "relative", margin: "0 6px" }}
        >
          <div
            className="absolute inset-x-4 top-1/2 transition-colors group-hover:bg-[var(--accent-blue)]"
            style={{ height: "1px", background: "var(--border-color)", borderRadius: "1px" }}
          />
        </div>

        {/* Claude Usage - bottom */}
        <div
          className="min-h-0 overflow-hidden"
          style={{
            flex: `${1 - rightPanelSplitRatio} 1 0%`,
            margin: "0 6px 6px",
            borderRadius: "8px",
            background: "var(--bg-secondary)",
          }}
        >
          <ClaudeUsage />
        </div>
      </div>
    </div>
  );
}
