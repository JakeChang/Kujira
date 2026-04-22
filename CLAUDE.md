# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

**Kujira**（鯨）— macOS 原生開發終端機，基於 **Tauri 2 + React 18 + xterm.js** 打造。整合多分頁終端、開發伺服器管理、Claude API 用量監控、Git 操作與 Gemini AI 指令建議。

## 常用指令

```bash
npm install                # 安裝前端依賴
npm run tauri dev          # 開發模式（Rust backend + React frontend 同時啟動）
npm run tauri build        # 建置 macOS .app
npm run build              # 僅建置前端（TypeScript + Vite）
npx tsc --noEmit           # TypeScript 型別檢查（無測試框架）
npm run deploy             # 建置並安裝到 /Applications/Kujira.app
```

Rust 編譯由 Tauri CLI 自動處理，不需手動 `cargo build`。若只改 Rust 程式碼，`npm run tauri dev` 會自動重新編譯。

## 架構

### IPC 通訊模式

前後端透過 Tauri `invoke()` 做 request/response，透過 `emit`/`listen` 做即時事件串流。

- **PTY 輸出**: backend 監聽 child process stdout → emit `pty-<id>-output` 事件 → frontend xterm.js 寫入
- **Server Log**: emit `server-log-<id>` 事件
- **Claude 狀態**: background thread 輪詢 `~/.kujira/status/claude-status-<pty-id>` 檔案 → emit `claude-status` 事件

所有 Tauri command 定義在 `src-tauri/src/commands/` 各模組，並在 `src-tauri/src/lib.rs` 統一註冊到 invoke handler。

### 前端狀態管理

單一 Zustand store（`src/store/index.ts`）管理全域狀態：tabs、layout、servers、claude usage/quota、font size。無 Redux、無 Context API。

設定持久化透過 `invoke("config_read")` / `invoke("config_write")` 讀寫 `~/.kujira/config.json`。

### Tab 類型

- `"shell"` — 互動式 shell（xterm.js + PTY）
- `"log"` — 伺服器 log 檢視器（唯讀）
- `"claude"` — Claude API 監控面板

### 行程管理

- Server PID 持久化在 `~/.config/kujira/server-pids.json`（app 崩潰後能回收 stale processes）
- App 啟動時 `cleanup_stale_servers()` 清理殘留行程；退出時 `lib.rs` exit handler 清理所有 PTY 和 server 行程
- 行程樹清理使用 `pgrep` (Unix)

### Claude Code Hooks 整合

Kujira 透過 Claude Code hooks 追蹤 Claude agent 即時狀態（working/idle/pending）：

1. `hooks_install` 寫入 `~/.claude/hooks/kujira-status.sh` 腳本並更新 `~/.claude/settings.json`
2. Hook 觸發時將狀態寫入 `~/.kujira/status/claude-status-<pty-id>`
3. Backend 每 200ms 輪詢 status 目錄，變更時 emit `claude-status` 事件到前端
4. PTY 環境變數 `KUJIRA_PTY_ID` 讓 hook 腳本識別來源分頁

### macOS 整合

- `objc2` / `objc2-foundation` 用於從 macOS NSHTTPCookieStorage 取得 Claude session cookies
- 視窗啟動後 300ms 延遲最大化（避免白閃）

### Tauri 權限

檔案系統存取透過 `src-tauri/capabilities/default.json` 以 scoped permissions 限制，僅允許 `~/.kujira/`、`~/.config/kujira/`、`~/.claude/` 等目錄。新增檔案路徑存取需更新此檔案。

### 主題系統

`src/themes.ts` 定義多組 CSS 變數主題（One Dark、Dracula、Nord 等），透過 `useTheme` hook 在 `document.documentElement` 套用 CSS 變數。xterm.js 使用 `getXtermTheme()` 將主題轉換成 xterm 顏色格式。

### Terminal Resize

`useTerminal.ts` 使用自訂 `computeSize()` 函式繞過 FitAddon，直接讀取 xterm 內部 `_core._renderService.dimensions` 取得實際 cell 尺寸，再扣除 padding 和 scrollbar 計算正確 cols/rows。

### Zustand Store 重要行為

- 新增 tab 時 `"claude"` tab 強制排在所有 tab 最後
- Layout 尺寸（rightPanelWidth、projectListWidth 等）在 `setConfig()` 時從 config 初始化

## 開發注意事項

- 前端使用 **TailwindCSS 4**（透過 Vite plugin），非 PostCSS 配置
- TypeScript 嚴格模式（`strict: true`，不允許 unused parameters/variables）
- Rust release profile 啟用 LTO + panic=abort（最小化 binary）
- Vite dev server 固定 port 1420，Tauri 透過此 URL 載入前端
- 專案語言為繁體中文（UI 文字、README、commit message）
- 全域型別定義在 `src/types/index.ts`
- 全域快捷鍵定義在 `src/App.tsx`（Cmd+T/W/B/P/K/[/]/1-9/+/-）
