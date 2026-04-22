# Kujira（鯨）

> macOS 原生開發終端機，整合多分頁終端、Claude AI 用量監控、Gemini 指令建議與 Git 操作

![cover](cover.png)

基於 **Tauri 2 + React 18 + xterm.js** 打造，專為日常開發工作流設計。

## 功能

- **多分頁終端** — xterm.js + PTY，支援 shell、server log、Claude 監控三種分頁類型，中文 IME 最佳化
- **Claude AI 用量監控** — 即時讀取 JSONL 記錄，顯示每日 token 消耗、費用與 quota 狀態
- **Gemini AI 指令建議** — 輸入 `? 問題` 即可獲得 shell 指令建議
- **Git 操作面板** — status、commit、branch、push/pull，不離開視窗完成所有 Git 操作
- **開發伺服器管理** — 啟停伺服器，PID 持久化，App 崩潰重啟後能正確回收殘留行程
- **Claude Code Hooks 整合** — 即時追蹤 Claude agent 狀態（working / idle / pending）
- **自動更新** — 內建更新檢查，設定頁面一鍵安裝最新版本

## 下載

前往 [Releases](https://github.com/JakeChang/Kujira/releases/latest) 下載最新版 DMG。

首次安裝需執行：

```bash
xattr -cr /Applications/Kujira.app
```

## 開發

```bash
npm install
npm run tauri dev   # 開發模式（Rust + React 同時啟動）
npm run tauri build # 建置 .app
```

**需求：** Node.js ≥ 18、Rust stable、macOS 15.0+

## 技術架構

```
src/                        # 前端 (React + TypeScript + Tailwind CSS 4)
├── components/
│   ├── claude/             # Claude 用量監控面板
│   ├── layout/             # FavoriteBar, SettingsPanel, RightPanel
│   ├── servers/            # ServerPanel, LogPane
│   └── terminal/           # TerminalPane (xterm.js)
├── hooks/
└── store/                  # Zustand 全域狀態

src-tauri/src/              # 後端 (Rust)
├── commands/
│   ├── claude.rs           # Claude usage / quota / session
│   ├── pty.rs              # PTY 生成與串流
│   ├── server.rs           # 伺服器行程管理
│   ├── git.rs              # Git 操作
│   └── hooks.rs            # Claude Code hooks 狀態輪詢
└── lib.rs
```

## License

MIT
