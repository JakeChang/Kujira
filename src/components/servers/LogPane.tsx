import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Tab } from "../../types";

interface LogEvent {
  id: string;
  data: string;
  stream?: string;
}

interface LogLine {
  line: string;
  stream: string;
}

interface DisplayLine {
  text: string;
  stream: string;
  ts: string;
}

function makeTs() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
}

interface LogPaneProps {
  tab: Tab;
  isActive: boolean;
}

export function LogPane({ tab, isActive }: LogPaneProps) {
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  const userScrolledUp = useRef(false);

  // Load existing buffered logs on mount
  useEffect(() => {
    if (loadedRef.current || !tab.serverId) return;
    loadedRef.current = true;

    invoke<LogLine[]>("server_get_logs", { id: tab.serverId }).then((buffered) => {
      if (buffered.length > 0) {
        const ts = makeTs();
        setLines(buffered.map((l) => ({ text: l.line, stream: l.stream, ts })));
      }
    }).catch(() => {});
  }, [tab.serverId]);

  // Listen for new log events
  useEffect(() => {
    if (!tab.serverId) return;
    const unlisten = listen<LogEvent>("server-log", (event) => {
      if (event.payload.id === tab.serverId) {
        const text = event.payload.data.replace(/\n$/, "");
        if (!text) return;
        setLines((prev) => {
          const next = [...prev, { text, stream: event.payload.stream ?? "stdout", ts: makeTs() }];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [tab.serverId]);

  // Auto-scroll only when user is near bottom
  useEffect(() => {
    if (isActive && !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, isActive]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 40;
    userScrolledUp.current = el.scrollTop + el.clientHeight < el.scrollHeight - threshold;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full w-full overflow-y-auto font-mono"
      style={{
        background: "var(--bg-primary)",
        padding: "12px 16px",
        fontSize: "12px",
        lineHeight: "1.6",
      }}
    >
      {lines.length === 0 && (
        <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>
          等待 log 輸出...（請先啟動 server）
        </div>
      )}
      {lines.map((line, i) => (
        <div key={i} className="flex" style={{ gap: "8px" }}>
          <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: "11px" }}>{line.ts}</span>
          <span
            style={{
              color: line.stream === "stderr" ? "var(--accent-red)" : "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {line.text}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
