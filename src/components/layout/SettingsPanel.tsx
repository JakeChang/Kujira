import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useStore } from "../../store";
import { persistConfig } from "../../utils/persistConfig";

interface SettingsPanelProps {
  anchorPos: { x: number; y: number };
  onClose: () => void;
}

export function SettingsPanel({ anchorPos, onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useStore((s) => s.config);
  const [apiKey, setApiKey] = useState(config?.gemini?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  type UpdateStatus = "idle" | "checking" | "up_to_date" | "available" | "downloading" | "done" | "error";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const pendingUpdate = useRef<Update | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const update = await check();
      if (update) {
        pendingUpdate.current = update;
        setAvailableVersion(update.version);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up_to_date");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch {
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  const handleInstallUpdate = async () => {
    if (!pendingUpdate.current) return;
    setUpdateStatus("downloading");
    try {
      await pendingUpdate.current.downloadAndInstall();
      setUpdateStatus("done");
    } catch {
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  useClickOutside(ref, onClose);

  const handleSave = async () => {
    if (!config) return;
    await persistConfig({
      ...config,
      gemini: { ...config.gemini, apiKey: apiKey.trim() },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: anchorPos.x,
        bottom: window.innerHeight - anchorPos.y,
        width: "280px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "10px 12px 8px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
        設定
      </div>

      {/* Gemini API Key */}
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px" }}>
          Gemini API Key
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onClose();
              }}
              placeholder="AIza..."
              autoFocus
              style={{
                width: "100%",
                fontSize: "12px",
                padding: "6px 28px 6px 8px",
                borderRadius: "5px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "monospace",
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                position: "absolute",
                right: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "11px",
                padding: "2px 4px",
              }}
              title={showKey ? "隱藏" : "顯示"}
            >
              {showKey ? "◉" : "◎"}
            </button>
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.4 }}>
          在 terminal 輸入 <code style={{ color: "var(--accent-green)", fontSize: "10px" }}>? 問題</code> 即可使用 AI 指令建議
        </div>
      </div>

      {/* 應用程式更新 */}
      <div style={{ borderTop: "1px solid var(--border-color)", padding: "10px 12px" }}>
        <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px" }}>
          應用程式
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            {appVersion ? `v${appVersion}` : "Kujira"}
          </span>
          {updateStatus === "idle" && (
            <button
              onClick={handleCheckUpdate}
              style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              檢查更新
            </button>
          )}
          {updateStatus === "checking" && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>檢查中…</span>
          )}
          {updateStatus === "up_to_date" && (
            <span style={{ fontSize: "11px", color: "var(--accent-green)" }}>✓ 已是最新版本</span>
          )}
          {updateStatus === "available" && (
            <button
              onClick={handleInstallUpdate}
              style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "5px", border: "none", background: "var(--accent-blue)", color: "#1a1d23", cursor: "pointer", fontWeight: 500 }}
            >
              安裝 v{availableVersion}
            </button>
          )}
          {updateStatus === "downloading" && (
            <span style={{ fontSize: "11px", color: "var(--accent-blue)" }}>下載中…</span>
          )}
          {updateStatus === "done" && (
            <span style={{ fontSize: "11px", color: "var(--accent-green)" }}>✓ 安裝完成，請重啟</span>
          )}
          {updateStatus === "error" && (
            <span style={{ fontSize: "11px", color: "var(--accent-red)" }}>✗ 更新失敗</span>
          )}
        </div>
      </div>

      {/* Save */}
      <div style={{
        display: "flex", justifyContent: "flex-end",
        padding: "8px 12px",
        borderTop: "1px solid var(--border-color)",
      }}>
        {saved && (
          <span style={{ fontSize: "11px", color: "var(--accent-green)", marginRight: "auto", alignSelf: "center" }}>
            ✓ 已儲存
          </span>
        )}
        <button
          onClick={handleSave}
          style={{
            fontSize: "11px",
            fontWeight: 500,
            padding: "5px 14px",
            borderRadius: "5px",
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
      </div>
    </div>,
    document.body,
  );
}
