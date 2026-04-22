import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { persistConfig } from "../../utils/persistConfig";
import { themes } from "../../themes";
import { setTheme } from "../../hooks/useTheme";

type Section = "theme" | "ai" | "hooks";

interface SettingsModalProps {
  onClose: () => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "theme", label: "主題配色", icon: "◐" },
  { id: "ai", label: "AI 設定", icon: "✦" },
  { id: "hooks", label: "Claude 狀態", icon: "●" },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [section, setSection] = useState<Section>("theme");

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
          width: "520px",
          maxHeight: "400px",
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
            設定
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
          {section === "theme" && <ThemeSection />}
          {section === "ai" && <AISection />}
          {section === "hooks" && <HooksSection />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Theme Section ── */
function ThemeSection() {
  const currentThemeId = useStore((s) => s.config?.terminal.theme ?? "one-dark");

  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
        主題配色
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {themes.map((theme) => {
          const active = currentThemeId === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: active ? "1.5px solid var(--accent-blue)" : "1.5px solid var(--border-color)",
                background: active ? "var(--hover-bg)" : "transparent",
                color: "var(--text-primary)",
                fontSize: "12px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = "var(--text-muted)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = "var(--border-color)"; }}
            >
              <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                {[theme.vars["--accent-blue"], theme.vars["--accent-green"], theme.vars["--accent-purple"]].map((c, i) => (
                  <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />
                ))}
              </div>
              <span style={{ flex: 1 }}>{theme.name}</span>
              {active && <span style={{ fontSize: "11px", color: "var(--accent-green)" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── AI Section ── */
function AISection() {
  const config = useStore((s) => s.config);
  const [apiKey, setApiKey] = useState(config?.gemini?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!config) return;
    await persistConfig({
      ...config,
      gemini: { ...config.gemini, apiKey: apiKey.trim() },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
        AI 設定
      </div>

      {/* Gemini API Key */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px", fontWeight: 500 }}>
          Gemini API Key
        </div>
        <div style={{ position: "relative" }}>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="AIza..."
            autoFocus
            style={{
              width: "100%",
              fontSize: "12px",
              padding: "8px 32px 8px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: '"SF Mono", Menlo, monospace',
            }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "12px",
              padding: "2px 4px",
            }}
            title={showKey ? "隱藏" : "顯示"}
          >
            {showKey ? "◉" : "◎"}
          </button>
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.5 }}>
          在 terminal 輸入 <code style={{ color: "var(--accent-green)" }}>?</code> 或 <code style={{ color: "var(--accent-green)" }}>？</code> 加上問題，即可使用 AI 指令建議。
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          onClick={handleSave}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            padding: "6px 18px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: "var(--accent-blue)",
            color: "#1a1d23",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          儲存
        </button>
        {saved && (
          <span style={{ fontSize: "12px", color: "var(--accent-green)" }}>✓ 已儲存</span>
        )}
      </div>
    </div>
  );
}

/* ── Hooks Section ── */
function HooksSection() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    invoke<{ installed: boolean }>("hooks_check").then((r) => setInstalled(r.installed));
    invoke<boolean>("claude_has_session").then((has) => setHasSession(has));
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setResult(null);
    try {
      await invoke<string>("hooks_install");
      setInstalled(true);
      setResult({ ok: true, msg: "設定完成" });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.toString() ?? "設定失敗" });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
        Claude Code 狀態偵測
      </div>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "16px" }}>
        啟用後，在任何 tab 中執行 Claude Code 時，tab 會顯示狀態燈：
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
          <span style={{ color: "var(--accent-green)", fontSize: "10px" }}>●</span>
          <span style={{ color: "var(--text-primary)" }}>綠燈 + 綠色背景</span>
          <span style={{ color: "var(--text-muted)" }}>— Claude 正在執行</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
          <span style={{ color: "var(--accent-yellow)", fontSize: "10px" }}>●</span>
          <span style={{ color: "var(--text-primary)" }}>黃燈 + 黃色背景</span>
          <span style={{ color: "var(--text-muted)" }}>— 等待使用者授權</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>●</span>
          <span style={{ color: "var(--text-primary)" }}>灰色</span>
          <span style={{ color: "var(--text-muted)" }}>— 閒置 / 等待輸入</span>
        </div>
      </div>

      <div style={{
        padding: "12px",
        borderRadius: "8px",
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
        marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
              Claude Code Hooks
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {installed === null ? "檢查中..." : installed ? "已安裝" : "未安裝"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {installed && (
              <span style={{ fontSize: "10px", color: "var(--accent-green)" }}>✓</span>
            )}
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                fontSize: "11px",
                fontWeight: 500,
                padding: "5px 14px",
                borderRadius: "6px",
                border: "none",
                cursor: installing ? "default" : "pointer",
                background: installed ? "var(--hover-bg)" : "var(--accent-blue)",
                color: installed ? "var(--text-secondary)" : "#1a1d23",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {installing ? "設定中..." : installed ? "重新設定" : "一鍵設定"}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div style={{ fontSize: "12px", color: result.ok ? "var(--accent-green)" : "var(--accent-red)" }}>
          {result.ok ? "✓" : "✗"} {result.msg}
        </div>
      )}

      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "12px" }}>
        此功能透過 Claude Code 的 hooks 機制運作。
        點擊「一鍵設定」會自動建立 hook 腳本並更新 <code style={{ fontSize: "10px" }}>~/.claude/settings.json</code>。
      </div>

      {/* Claude Session */}
      {hasSession && (
        <>
          <div style={{ height: "1px", background: "var(--border-color)", margin: "16px 0" }} />
          <div style={{
            padding: "12px",
            borderRadius: "8px",
            background: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
                  Claude 登入狀態
                </div>
                <div style={{ fontSize: "11px", color: "var(--accent-green)" }}>
                  已登入
                </div>
              </div>
              <button
                onClick={async () => {
                  setLoggingOut(true);
                  try {
                    await invoke("claude_clear_session");
                    setHasSession(false);
                    useStore.getState().setClaudeQuota(null);
                    useStore.getState().setClaudeLoginStatus("logged_out");
                  } catch { /* ignore */ }
                  setLoggingOut(false);
                }}
                disabled={loggingOut}
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "5px 14px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: loggingOut ? "default" : "pointer",
                  background: "var(--accent-red)",
                  color: "#fff",
                  opacity: loggingOut ? 0.6 : 1,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (!loggingOut) e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { if (!loggingOut) e.currentTarget.style.opacity = "1"; }}
              >
                {loggingOut ? "登出中..." : "登出"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
