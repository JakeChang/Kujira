import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../store";
import { getThemeById, getXtermTheme } from "../themes";

/**
 * Manually compute cols/rows from the container and xterm renderer cell size.
 * Bypasses FitAddon entirely to avoid CSS box-model conflicts.
 */
function computeSize(
  term: Terminal,
  container: HTMLElement
): { cols: number; rows: number } | null {
  const core = (term as any)._core;
  const dims = core?._renderService?.dimensions;
  if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) {
    return null;
  }

  const cellWidth: number = dims.css.cell.width;
  const cellHeight: number = dims.css.cell.height;

  // container has padding — clientWidth includes padding, so subtract it
  const style = window.getComputedStyle(container);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const padB = parseFloat(style.paddingBottom) || 0;

  // Scrollbar: measure from xterm viewport if available
  const scrollbarWidth: number =
    term.options.scrollback === 0
      ? 0
      : core.viewport?.scrollBarWidth ?? 0;

  const availableWidth = container.clientWidth - padL - padR - scrollbarWidth;
  const availableHeight = container.clientHeight - padT - padB;

  const cols = Math.max(2, Math.floor(availableWidth / cellWidth));
  const rows = Math.max(1, Math.floor(availableHeight / cellHeight));

  return { cols, rows };
}

function applySize(term: Terminal, size: { cols: number; rows: number }) {
  if (term.cols !== size.cols || term.rows !== size.rows) {
    const core = (term as any)._core;
    core._renderService?.clear();
    term.resize(size.cols, size.rows);
  }
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  _tabId: string,
  ptyId: string,
  cwd?: string,
  command?: string,
  enabled: boolean = true,
  onAIQuery?: (query: string) => void,
) {
  const termRef = useRef<Terminal | null>(null);
  const spawnedRef = useRef(false);
  const onAIQueryRef = useRef(onAIQuery);
  onAIQueryRef.current = onAIQuery;
  const inputPausedRef = useRef(false);
  const fontSize = useStore((s) => s.fontSize);
  const themeId = useStore((s) => s.config?.terminal.theme ?? "one-dark");
  const ptyIdRef = useRef(ptyId);
  const cwdRef = useRef(cwd);
  const commandRef = useRef(command);
  const lastColsRef = useRef(0);
  const lastRowsRef = useRef(0);

  const fontFamily = '"SF Mono", Menlo, Monaco, monospace';

  const doResize = useCallback(() => {
    const term = termRef.current;
    const container = containerRef.current;
    if (!term || !container || !spawnedRef.current) return;

    const size = computeSize(term, container);
    if (!size) return;

    if (size.cols !== lastColsRef.current || size.rows !== lastRowsRef.current) {
      lastColsRef.current = size.cols;
      lastRowsRef.current = size.rows;
      applySize(term, size);
      invoke("pty_resize", {
        id: ptyIdRef.current,
        cols: size.cols,
        rows: size.rows,
      }).catch(() => {});
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || termRef.current) return;

    const state = useStore.getState();
    const fs = state.fontSize;
    const initialThemeId = state.config?.terminal.theme ?? "one-dark";
    const appTheme = getThemeById(initialThemeId);

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: fs,
      fontFamily,
      lineHeight: 1.15,
      theme: getXtermTheme(appTheme),
      scrollback: 10000,
      allowProposedApi: true,
    });

    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // Activate after open — addon sets activeVersion to '15-graphemes' automatically
    // This ensures xterm.js and TUI apps (Claude Code/Ink) agree on character widths
    term.loadAddon(new UnicodeGraphemesAddon());

    termRef.current = term;

    // compositionend 後清空 textarea，避免殘留值被後續事件當 diff 重送
    const textarea = term.textarea;
    if (textarea) {
      textarea.addEventListener("compositionend", () => {
        setTimeout(() => { textarea.value = ""; }, 0);
      });
    }

    // Let Cmd+key shortcuts pass through
    term.attachCustomKeyEventHandler((e) => {
      if (e.metaKey) return false;
      return true;
    });

    // User input → PTY (with ? prefix interception for AI query)
    // When user types "? query", we enter AI mode: characters are echoed
    // locally in xterm but NEVER sent to the shell, avoiding glob issues.
    const inputBuffer = { current: "" };
    const aiMode = { current: false };

    let lastImeData = "";
    let lastImeAt = 0;
    term.onData((data) => {
      if (inputPausedRef.current) return;

      // IME 去重：compositionend 與緊隨的 input 事件會讓多字元輸入重送一次
      if (data.length > 1 && /[^\x00-\x7f]/.test(data)) {
        const now = Date.now();
        if (data === lastImeData && now - lastImeAt < 150) {
          return;
        }
        lastImeData = data;
        lastImeAt = now;
      }

      const id = ptyIdRef.current;

      // --- AI mode: input stays local, never touches shell ---
      if (aiMode.current) {
        if (data === "\r") {
          // Enter in AI mode → trigger query
          const query = inputBuffer.current.replace(/^\?[\s]?/, "").trim();
          // Save cursor position (at end of ?query on prompt line)
          // Then write newline for AI suggestion display
          term.write("\x1b7\r\n"); // ESC 7 = save cursor, then newline
          aiMode.current = false;
          inputBuffer.current = "";
          if (onAIQueryRef.current && query.length > 0) {
            onAIQueryRef.current(query);
          }
          return;
        }
        if (data === "\x1b" || data === "\x03") {
          // Escape / Ctrl+C → cancel AI mode, erase the local echo
          const len = inputBuffer.current.length;
          if (len > 0) term.write("\x1b[2K\r"); // erase line
          aiMode.current = false;
          inputBuffer.current = "";
          // Show fresh prompt from shell
          invoke("pty_write", { id, data: "" }).catch(() => {});
          return;
        }
        if (data === "\x7f") {
          // Backspace in AI mode
          if (inputBuffer.current.length <= 1) {
            // Backspace past "?" → exit AI mode, erase line
            term.write("\x1b[2K\r");
            aiMode.current = false;
            inputBuffer.current = "";
            return;
          }
          inputBuffer.current = inputBuffer.current.slice(0, -1);
          term.write("\b \b");
          return;
        }
        if (data.startsWith("\x1b[")) {
          // Arrow keys etc — ignore in AI mode
          return;
        }
        // Regular character in AI mode → local echo only
        inputBuffer.current += data;
        term.write(data);
        return;
      }

      // --- Normal mode ---
      if (data === "\r") {
        inputBuffer.current = "";
        invoke("pty_write", { id, data }).catch(console.error);
      } else if (data === "\x7f") {
        inputBuffer.current = inputBuffer.current.slice(0, -1);
        invoke("pty_write", { id, data }).catch(console.error);
      } else if (data.startsWith("\x1b") || data === "\x03" || data === "\x04") {
        inputBuffer.current = "";
        invoke("pty_write", { id, data }).catch(console.error);
      } else {
        // Check if this starts an AI query
        // Handle both single char "?" and IME composed strings like "？刪除資料夾"
        if (onAIQueryRef.current && inputBuffer.current === "" && (data === "?" || data === "\uff1f" || data.startsWith("?") || data.startsWith("\uff1f"))) {
          aiMode.current = true;
          // Strip leading ? or ？, keep the rest as pre-filled query
          const rest = data.replace(/^[?\uff1f]/, "");
          inputBuffer.current = "?" + rest;
          term.write("\x1b[36m?\x1b[0m" + rest); // echo in terminal
          return; // don't send to shell
        }
        inputBuffer.current += data;
        invoke("pty_write", { id, data }).catch(console.error);
      }
    });

    // Wait for renderer to be ready, then fit & spawn
    let spawnRaf: number;
    const trySpawn = () => {
      const size = computeSize(term, container);
      if (size && !spawnedRef.current) {
        lastColsRef.current = size.cols;
        lastRowsRef.current = size.rows;
        applySize(term, size);
        spawnedRef.current = true;
        invoke("pty_spawn", {
          id: ptyIdRef.current,
          cwd: cwdRef.current ?? null,
          command: commandRef.current ?? null,
          cols: size.cols,
          rows: size.rows,
        }).catch(console.error);
      } else if (!spawnedRef.current) {
        spawnRaf = requestAnimationFrame(trySpawn);
      }
    };
    spawnRaf = requestAnimationFrame(trySpawn);

    // ResizeObserver for ongoing changes
    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 50);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(spawnRaf);
      clearTimeout(resizeTimer);
      observer.disconnect();
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
      spawnedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // PTY output
  useEffect(() => {
    const unlisten = listen<{ id: string; data: string }>("pty-output", (event) => {
      if (event.payload.id === ptyId && termRef.current) {
        termRef.current.write(event.payload.data);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [ptyId]);

  // PTY exit
  useEffect(() => {
    const unlisten = listen<{ id: string }>("pty-exit", (event) => {
      if (event.payload.id === ptyId && termRef.current) {
        termRef.current.write("\r\n[Process exited]\r\n");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [ptyId]);

  // Font size changes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    requestAnimationFrame(doResize);
  }, [fontSize, doResize]);

  // Theme sync
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const appTheme = getThemeById(themeId);
    term.options.theme = getXtermTheme(appTheme);
  }, [themeId]);

  const focus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const refit = useCallback(() => {
    doResize();
  }, [doResize]);

  return { term: termRef, focus, refit, inputPausedRef };
}
