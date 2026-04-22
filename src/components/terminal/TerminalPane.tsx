import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useTerminal } from "../../hooks/useTerminal";
import { useStore } from "../../store";
import type { Tab } from "../../types";

interface TerminalPaneProps {
  tab: Tab;
  isActive: boolean;
}

// ANSI helpers
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const ERASE_DOWN = "\x1b[J"; // erase from cursor to end of screen

export function TerminalPane({ tab, isActive }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ptyId = tab.ptyId ?? tab.id;
  const command = tab.type === "claude" ? "claude" : undefined;

  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true);
    }
  }, [isActive, hasBeenActive]);

  // AI suggestion state
  const [aiState, setAiState] = useState<{
    loading: boolean;
    query: string;
    command: string | null;
    explanation: string | null;
    error: string | null;
  } | null>(null);
  const aiLinesRef = useRef(0);
  const aiHistoryRef = useRef<{ query: string; command: string }[]>([]);

  const onAIQuery = useCallback(async (query: string) => {
    const config = useStore.getState().config;
    const apiKey = config?.gemini?.apiKey;
    if (!apiKey) {
      setAiState({ loading: false, query, command: null, explanation: null, error: "未設定 Gemini API Key — 點擊左側 ⚙ 按鈕新增" });
      return;
    }
    setAiState({ loading: true, query, command: null, explanation: null, error: null });
    try {
      const currentCwd = tab.cwd ?? "~";
      const result = await invoke<{ command: string; explanation: string }>("gemini_suggest", {
        query,
        cwd: currentCwd,
        apiKey,
        history: aiHistoryRef.current.slice(-10), // last 10 turns
      });
      setAiState({ loading: false, query, command: result.command, explanation: result.explanation, error: null });
    } catch (err: any) {
      setAiState({ loading: false, query, command: null, explanation: null, error: err?.toString() ?? "Unknown error" });
    }
  }, [tab.cwd]);

  const { term, focus, refit, inputPausedRef } = useTerminal(
    containerRef,
    tab.id,
    ptyId,
    tab.cwd,
    command,
    hasBeenActive,
    tab.type === "shell" ? onAIQuery : undefined,
  );

  // Pause terminal input when AI panel is visible
  useEffect(() => {
    inputPausedRef.current = aiState !== null;
  }, [aiState, inputPausedRef]);

  // Write AI suggestion inline into terminal
  useEffect(() => {
    const t = term.current;
    if (!t || !aiState) return;

    // Clear previous AI lines if any
    if (aiLinesRef.current > 0) {
      // Move up N lines and erase to end
      t.write(`\x1b[${aiLinesRef.current}A${ERASE_DOWN}`);
      aiLinesRef.current = 0;
    }

    if (aiState.loading) {
      t.write(`\r\n  ${DIM}✦ 思考中...${RESET}`);
      aiLinesRef.current = 1;
      return;
    }

    if (aiState.error) {
      t.write(`\r\n  ${RED}✦ ${aiState.error}${RESET}`);
      t.write(`\r\n  ${DIM}[Esc] 取消${RESET}`);
      aiLinesRef.current = 2;
      return;
    }

    if (aiState.command) {
      t.write(`\r\n  ${CYAN}✦${RESET} ${GREEN}${aiState.command}${RESET}`);
      let lines = 1;
      if (aiState.explanation) {
        t.write(`\r\n    ${DIM}${aiState.explanation}${RESET}`);
        lines++;
      }
      t.write(`\r\n    ${DIM}[Enter] 執行  [Tab] 編輯  [Esc] 取消${RESET}`);
      lines++;
      aiLinesRef.current = lines;
    }
  }, [aiState, term]);

  // Restore cursor to saved position (before AI lines) and erase suggestion
  const clearAILines = useCallback(() => {
    const t = term.current;
    if (t && aiLinesRef.current > 0) {
      // ESC 8 = restore cursor (back to end of ?query on prompt line)
      // Then erase from cursor to end of screen
      t.write(`\x1b8${ERASE_DOWN}`);
      aiLinesRef.current = 0;
    }
  }, [term]);

  // Refit every time tab becomes active (handles panel toggle, window resize, etc.)
  useEffect(() => {
    if (!isActive) return;
    let raf: number;
    const doRefit = () => {
      refit();
      focus();
    };
    raf = requestAnimationFrame(() => {
      doRefit();
      raf = requestAnimationFrame(doRefit);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, focus, refit]);

  // Tauri file drag-and-drop
  useEffect(() => {
    if (!isActive) return;

    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      } else if (event.payload.type === "drop") {
        setIsDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const text = paths.join(" ");
          invoke("pty_write", { id: ptyId, data: text }).catch(console.error);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isActive, ptyId]);

  // AI keyboard handler — capture phase to intercept before xterm
  useEffect(() => {
    if (!aiState) return;

    const handler = (e: KeyboardEvent) => {
      if (aiState.loading) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          clearAILines();
          const t = term.current;
          if (t) t.write("\x1b[K");
          setAiState(null);
          focus();
        }
        return;
      }
      if (e.key === "Enter" && aiState.command) {
        e.preventDefault();
        e.stopPropagation();
        aiHistoryRef.current.push({ query: aiState.query, command: aiState.command });
        clearAILines();
        const t = term.current;
        if (t) t.write("\x1b[K\r\n");
        setAiState(null);
        invoke("pty_write", { id: ptyId, data: aiState.command + "\n" }).catch(console.error);
      } else if (e.key === "Tab" && aiState.command) {
        e.preventDefault();
        e.stopPropagation();
        aiHistoryRef.current.push({ query: aiState.query, command: aiState.command });
        clearAILines();
        const t = term.current;
        if (t) t.write("\x1b[K");
        setAiState(null);
        invoke("pty_write", { id: ptyId, data: aiState.command }).catch(console.error);
        focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        clearAILines();
        // Erase ?query from prompt line
        const t = term.current;
        if (t) t.write("\x1b[K");
        setAiState(null);
        focus();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [aiState, ptyId, focus, clearAILines]);

  return (
    <div className="h-full w-full flex flex-col" style={{ background: "var(--bg-primary)" }}>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative"
        style={{ padding: "8px 4px 8px 12px" }}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{
              background: "rgba(97, 175, 239, 0.08)",
              border: "2px dashed var(--accent-blue)",
              borderRadius: "8px",
              margin: "4px",
            }}
          >
            <span
              style={{
                color: "var(--accent-blue)",
                fontSize: "14px",
                fontWeight: 500,
                background: "var(--bg-primary)",
                padding: "6px 16px",
                borderRadius: "6px",
              }}
            >
              拖放檔案到此處
            </span>
          </div>
        )}
      </div>
      {/* Git status moved to ProjectDetail panel */}
    </div>
  );
}
