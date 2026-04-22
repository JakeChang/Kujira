import { useState } from "react";
import { createPortal } from "react-dom";

type Section = "shortcuts" | "terminal" | "panels" | "server";

interface HelpModalProps {
  onClose: () => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "shortcuts", label: "快捷鍵", icon: "⌘" },
  { id: "terminal", label: "終端機", icon: "▸" },
  { id: "panels", label: "面板與最愛", icon: "◫" },
  { id: "server", label: "伺服器管理", icon: "◉" },
];

export function HelpModal({ onClose }: HelpModalProps) {
  const [section, setSection] = useState<Section>("shortcuts");

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "580px",
          maxHeight: "520px",
          display: "flex",
          borderRadius: "12px",
          overflow: "hidden",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
        }}
      >
        {/* Left nav */}
        <div
          style={{
            width: "150px",
            background: "var(--bg-tertiary)",
            borderRight: "1px solid var(--border-subtle)",
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", padding: "6px 8px 8px" }}>
            使用說明
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "7px 10px",
                borderRadius: "6px",
                border: "none",
                background: section === item.id ? "var(--hover-bg)" : "transparent",
                color: section === item.id ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: "12px",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (section !== item.id) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { if (section !== item.id) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: "13px", width: "18px", textAlign: "center", opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
          {section === "shortcuts" && <ShortcutsSection />}
          {section === "terminal" && <TerminalSection />}
          {section === "panels" && <PanelsSection />}
          {section === "server" && <ServerSection />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Shortcut Row ── */
function Kbd({ keys }: { keys: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: "3px",
        fontSize: "11px",
        fontFamily: '"SF Mono", Menlo, monospace',
        color: "var(--text-primary)",
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        padding: "2px 6px",
        lineHeight: 1.4,
      }}
    >
      {keys}
    </span>
  );
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{desc}</span>
      <Kbd keys={keys} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginTop: "14px", marginBottom: "6px" }}>
      {children}
    </div>
  );
}

/* ── Shortcuts Section ── */
function ShortcutsSection() {
  return (
    <div>
      <SectionTitle>快捷鍵</SectionTitle>

      <SubTitle>分頁操作</SubTitle>
      <ShortcutRow keys="⌘ T" desc="新增分頁" />
      <ShortcutRow keys="⌘ W" desc="關閉目前分頁" />
      <ShortcutRow keys="⌘ ]" desc="切換至下一個分頁" />
      <ShortcutRow keys="⌘ [" desc="切換至上一個分頁" />
      <ShortcutRow keys="⌘ 1–9" desc="跳至第 N 個分頁" />

      <SubTitle>面板</SubTitle>
      <ShortcutRow keys="⌘ B" desc="顯示 / 隱藏最愛列" />
      <ShortcutRow keys="⌘ P" desc="顯示 / 隱藏右側面板" />
      <ShortcutRow keys="⌘ K" desc="開啟 Claude 用量面板" />

      <SubTitle>字體</SubTitle>
      <ShortcutRow keys="⌘ =" desc="放大字體" />
      <ShortcutRow keys="⌘ -" desc="縮小字體" />
    </div>
  );
}

/* ── Terminal Section ── */
function TerminalSection() {
  return (
    <div>
      <SectionTitle>終端機</SectionTitle>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <p style={{ marginBottom: "12px" }}>
          每個分頁是一個獨立的 shell 工作階段，支援完整的終端模擬（xterm.js）。
        </p>

        <SubTitle>基本操作</SubTitle>
        <ul style={{ paddingLeft: "16px", margin: "6px 0 12px" }}>
          <li>拖放檔案或資料夾到終端，會自動貼上路徑</li>
          <li>雙擊分頁標題可重新命名</li>
          <li>拖曳分頁可重新排列順序</li>
        </ul>

        <SubTitle>AI 指令建議</SubTitle>
        <p style={{ marginBottom: "8px" }}>
          在終端輸入 <code style={{ color: "var(--accent-green)", fontFamily: '"SF Mono", Menlo, monospace', fontSize: "12px" }}>?</code> 或 <code style={{ color: "var(--accent-green)", fontFamily: '"SF Mono", Menlo, monospace', fontSize: "12px" }}>？</code> 加上問題，即可呼叫 Gemini AI 產生指令建議。
        </p>
        <p>
          需先在設定中填入 Gemini API Key。
        </p>

        <SubTitle>Git 狀態列</SubTitle>
        <p style={{ marginBottom: "8px" }}>
          終端下方會顯示目前 Git 分支、檔案變更數、ahead/behind 狀態。
        </p>
        <ul style={{ paddingLeft: "16px", margin: "6px 0" }}>
          <li>點擊分支名稱可切換分支</li>
          <li>支援快速 commit、pull、push 操作</li>
        </ul>
      </div>
    </div>
  );
}

/* ── Panels Section ── */
function PanelsSection() {
  return (
    <div>
      <SectionTitle>面板與最愛</SectionTitle>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <SubTitle>左側最愛列</SubTitle>
        <ul style={{ paddingLeft: "16px", margin: "6px 0 12px" }}>
          <li>點擊最愛項目會開新分頁並切換到該目錄</li>
          <li>右鍵最愛項目可重新命名、移動分組、移除</li>
          <li>點擊分組標題會同時開啟該組所有項目</li>
          <li>右鍵分組標題可收合/展開</li>
          <li>點擊虛線「+」按鈕可將目前 shell 的路徑加入最愛</li>
          <li>綁定伺服器的最愛會顯示狀態邊框（綠色運行中、黃色建置中、紅色錯誤）</li>
        </ul>

        <SubTitle>右側面板</SubTitle>
        <ul style={{ paddingLeft: "16px", margin: "6px 0 12px" }}>
          <li>上半部：伺服器管理面板</li>
          <li>下半部：Claude API 用量監控</li>
          <li>中間分隔線可拖曳調整上下比例</li>
          <li>左側邊緣可拖曳調整面板寬度</li>
        </ul>

        <SubTitle>Claude 狀態燈</SubTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "6px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--accent-green)", fontSize: "9px" }}>●</span>
            <span>綠燈 + 脈動 — Claude 正在執行</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--accent-yellow)", fontSize: "9px" }}>●</span>
            <span>黃燈 — 等待使用者授權</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>●</span>
            <span>灰色 — 閒置 / 無 Claude 執行</span>
          </div>
        </div>
        <p style={{ marginTop: "8px" }}>
          需先在設定 → Claude 狀態中安裝 hooks 才能啟用狀態偵測。
        </p>
      </div>
    </div>
  );
}

/* ── Server Section ── */
function ServerSection() {
  return (
    <div>
      <SectionTitle>伺服器管理</SectionTitle>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
        <SubTitle>新增專案</SubTitle>
        <p style={{ marginBottom: "8px" }}>
          在右側伺服器面板點擊「+」，設定專案名稱、工作目錄、啟動指令與 port。
        </p>

        <SubTitle>操作</SubTitle>
        <ul style={{ paddingLeft: "16px", margin: "6px 0 12px" }}>
          <li>啟動 / 停止 / 重啟伺服器</li>
          <li>點擊 Log 按鈕可在新分頁中檢視即時 log</li>
          <li>點擊瀏覽器圖示會開啟 <code style={{ fontFamily: '"SF Mono", Menlo, monospace', fontSize: "11px" }}>http://localhost:PORT</code></li>
          <li>支援一鍵全部啟動 / 全部停止</li>
        </ul>

        <SubTitle>行程管理</SubTitle>
        <p>
          伺服器 PID 會持久化儲存。即使 app 異常關閉，下次啟動時也會自動清理殘留行程。
        </p>
      </div>
    </div>
  );
}
