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

- **PTY 輸出**: backend reader thread 讀取 PTY stdout（8KB chunks）→ emit `pty-output` 事件 → frontend xterm.js 寫入
- **Server Log**: emit `server-log-<id>` 事件（每行一事件）
- **Claude 狀態**: background thread 每 200ms 輪詢 `~/.kujira/status/claude-status-<pty-id>` 檔案 → 變更時 emit `claude-status` 事件

所有 Tauri command 定義在 `src-tauri/src/commands/` 各模組，並在 `src-tauri/src/lib.rs` 統一註冊到 invoke handler。

### Backend 模組職責

| 模組 | 狀態管理 | 職責 |
|------|---------|------|
| `pty.rs` | `PtyState` (HashMap<id, PtySession>) | PTY 生命週期、spawn/write/resize/kill、UTF-8 邊界處理 |
| `server.rs` | `ServerState` (HashMap + logs buffer) | 開發伺服器啟停、PID 持久化、行程樹清理 |
| `config.rs` | 無（讀寫 JSON 檔） | `~/.kujira/config.json` 讀寫，serde camelCase ↔ snake_case 轉換 |
| `git.rs` | 無 | Git 操作（status/commit/push/pull/branch），解析 `--porcelain=v1` |
| `claude.rs` | 無 | JSONL 用量解析、quota 讀取（透過 macOS cookie）、session 檢查 |
| `gemini.rs` | 無 | AI 指令建議，多輪對話，回傳 JSON `{command, explanation}` |
| `hooks.rs` | 無 | Claude Code hook 安裝與檢查 |

### 前端狀態管理

單一 Zustand store（`src/store/index.ts`）管理全域狀態：tabs、layout、servers、claude usage/quota、font size。無 Redux、無 Context API。

設定持久化流程：UI 變更 → `persistConfig()` (`src/utils/persistConfig.ts`) → `invoke("config_write")` → Rust 寫入 `~/.kujira/config.json` + 更新 Zustand store。

### 前端 Hooks 架構

| Hook | 職責 | 輪詢間隔 |
|------|------|---------|
| `useTerminal` | xterm.js 初始化、PTY 通訊、AI 查詢模式、IME 處理 | — |
| `useTabs` | Tab CRUD、排序邏輯 | — |
| `useServers` | 伺服器狀態同步 | 事件驅動 |
| `useClaudeUsage` | API quota 與每日 token 追蹤 | 60s |
| `useProjectGitStatus` | 專案列表 git 狀態 | 3s |
| `useGitStatus` | 當前分頁 git 狀態 | 3s |
| `useTheme` | CSS 變數主題注入 | — |
| `useFavorites` | 收藏路徑管理（群組、排序） | — |

### Tab 類型

- `"shell"` — 互動式 shell（xterm.js + PTY）
- `"log"` — 伺服器 log 檢視器（唯讀）
- `"claude"` — Claude API 監控面板（強制排在最後）

### 行程管理

- Server PID 持久化在 `~/.config/kujira/server-pids.json`（app 崩潰後能回收 stale processes）
- App 啟動時 `cleanup_stale_servers()` 清理殘留行程；退出時 `lib.rs` exit handler 清理所有 PTY 和 server 行程
- 行程樹清理：遞迴 `pgrep -P <pid>` 找所有子行程 → SIGTERM（等 300ms）→ SIGKILL

### Claude Code Hooks 整合

Kujira 透過 Claude Code hooks 追蹤 Claude agent 即時狀態（working/idle/pending）：

1. `hooks_install` 寫入 `~/.claude/hooks/kujira-status.sh` 腳本並更新 `~/.claude/settings.json`
2. Hook 觸發時將狀態寫入 `~/.kujira/status/claude-status-<pty-id>`
3. Backend 每 200ms 輪詢 status 目錄，變更時 emit `claude-status` 事件到前端
4. PTY 環境變數 `KUJIRA_PTY_ID` 讓 hook 腳本識別來源分頁

### macOS 整合

- `objc2` / `objc2-foundation` 用於從 macOS NSHTTPCookieStorage 取得 Claude session cookies
- 視窗啟動後 300ms 延遲最大化（避免白閃）
- System tray icon 隨 Claude 狀態變色（green=working、orange=pending、gray=idle）

### Tauri 權限

檔案系統存取透過 `src-tauri/capabilities/default.json` 以 scoped permissions 限制，僅允許 `~/.kujira/`、`~/.config/kujira/`、`~/.claude/`、`~/Library/Application Support/Claude/` 等目錄。新增檔案路徑存取需更新此檔案。

### 主題系統

`src/themes.ts` 定義 6 組暗色主題（One Dark、Dracula、Nord、Gruvbox、Tokyo Night、Material），透過 `useTheme` hook 在 `document.documentElement` 套用 CSS 變數。xterm.js 使用 `getXtermTheme()` 將主題轉換成 xterm 顏色格式。

### Terminal Resize

`useTerminal.ts` 使用自訂 `computeSize()` 函式繞過 FitAddon，直接讀取 xterm 內部 `_core._renderService.dimensions` 取得實際 cell 尺寸，再扣除 padding 和 scrollbar 計算正確 cols/rows。

### AI 指令建議流程

1. 使用者輸入 `?` → 進入 AI 模式（輸入保持本地 echo，不送 PTY）
2. 輸入問題 + Enter → 呼叫 `gemini_suggest()`（含對話歷史 + CWD）
3. Gemini 回傳 `{command, explanation}` → 寫入 xterm
4. Enter 執行、Tab 編輯、Esc 取消

## 開發注意事項

- 前端使用 **TailwindCSS 4**（透過 Vite plugin），非 PostCSS 配置
- TypeScript 嚴格模式（`strict: true`，`noUnusedLocals`，`noUnusedParameters`）
- Rust release profile 啟用 LTO + panic=abort + strip（最小化 binary）
- Vite dev server 固定 port 1420，Tauri 透過此 URL 載入前端
- **專案語言為繁體中文**（UI 文字、README、commit message）
- 全域型別定義在 `src/types/index.ts`
- 全域快捷鍵定義在 `src/App.tsx`（Cmd+T/W/B/P/K/[/]/1-9/+/-）
- PTY spawn 時手動補 PATH（`~/.local/bin`、`~/.cargo/bin`、`/opt/homebrew/bin`），確保 .app bundle 內工具可用
- PTY reader thread 處理 UTF-8 不完整邊界（`valid_up_to()` 分割）
- IME 去重：150ms 內相同 data 視為重複，避免 compositionend + input 雙重觸發

## 設計規範

- **視覺基調**: macOS 原生工具感，IDE 風格資訊密度，暗色主題為主
- **設計語言**: 扁平、低對比邊框、微妙層次（bg-primary → secondary → tertiary → elevated）。圓角 6-8px。hover 用極淡白色覆蓋層（rgba 255,255,255, 0.04-0.07）
- **色彩語意**: green=成功/執行、yellow=警告/修改、red=錯誤/刪除、blue=資訊/連結、purple=Git 分支
- **動態**: 極簡 — 僅 hover transition（0.15s）與面板寬度過渡（0.2s ease）。無彈跳、無華麗動畫
- **原則**: 工具透明性（UI 不擋路）、資訊密度優先、一致的視覺語言（所有元件遵循同一套 CSS 變數）、狀態即時可見（色彩編碼）、macOS 原生感
