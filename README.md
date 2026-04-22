# dev-terminal

macOS 原生開發終端機，整合終端模擬器、開發伺服器管理與 Claude API 用量監控。

基於 Tauri 2 + React + xterm.js 打造，專為日常開發工作流設計。

## 功能

- **終端模擬器** — 多分頁 shell，支援拖放檔案路徑、字體大小調整、全域快捷鍵（`⌘T` 新分頁、`⌘W` 關閉、`⌘[`/`⌘]` 切換）
- **開發伺服器管理** — 啟動 / 停止 / 重啟伺服器，即時 log 輸出，行程樹清理（app 崩潰重啟後也能正確回收）
- **Claude API 監控** — 即時 quota 用量（5 小時 / 7 天 / Sonnet 額度）、每日 / 每月花費追蹤（讀取 Claude Code 本地 JSONL log）
- **我的最愛** — 快速存取專案目錄與伺服器捷徑，支援分組、拖曳排序、摺疊
- **可調面板** — 左側我的最愛列（`⌘B`）、右側伺服器 + 用量面板（`⌘P`），寬度可拖曳調整

## 技術架構

```
src/                        # 前端 (React + TypeScript + Tailwind CSS 4)
├── components/
│   ├── claude/             # Claude 用量面板、登入流程
│   ├── layout/             # FavoriteBar, RightPanel, TabBar
│   ├── servers/            # ServerPanel, LogPane
│   └── terminal/           # TerminalPane (xterm.js)
├── hooks/                  # useClaudeUsage, useFavorites, useServers, useTabs, useTerminal
├── store/                  # Zustand 全域狀態
└── types/

src-tauri/src/              # 後端 (Rust)
├── commands/
│   ├── claude.rs           # Claude API session / quota / 本地花費
│   ├── config.rs           # 讀寫 ~/.dev-terminal/config.json
│   ├── pty.rs              # PTY 生成、輸入輸出串流
│   └── server.rs           # 伺服器行程管理、log 串流
├── lib.rs
└── main.rs
```

## 開發

```bash
# 安裝前端依賴
npm install

# 啟動開發模式（前端 + Tauri 同時啟動）
npm run tauri dev

# 建置 .app
npm run tauri build
```

### 需求

- Node.js ≥ 18
- Rust (stable)
- Tauri CLI 2（`npm run tauri` 會使用 devDependencies 中的 `@tauri-apps/cli`）

## 設定

應用程式設定檔位於 `~/.dev-terminal/config.json`，包含：

- 終端偏好（字體大小、shell 路徑）
- 面板佈局（寬度、可見性）
- 我的最愛（目錄捷徑、分組）
- 伺服器清單（名稱、指令、工作目錄）
- Claude 預算上限與 usage log 路徑
