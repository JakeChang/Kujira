interface AISuggestionPanelProps {
  command: string | null;
  explanation: string | null;
  loading: boolean;
  error: string | null;
}

export function AISuggestionPanel({ command, explanation, loading, error }: AISuggestionPanelProps) {
  return (
    <div
      className="select-none"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 14px",
        background: "var(--bg-tertiary)",
        borderTop: "1px solid var(--border-subtle)",
        fontSize: "12px",
        flexShrink: 0,
        minHeight: "38px",
      }}
    >
      {/* AI icon */}
      <span style={{ fontSize: "13px", flexShrink: 0, opacity: 0.7 }}>
        {loading ? "⟳" : "✦"}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading && (
          <span style={{ color: "var(--text-muted)" }}>
            思考中...
          </span>
        )}

        {error && (
          <span style={{ color: "var(--accent-red)" }}>
            {error}
          </span>
        )}

        {!loading && !error && command && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <code
              style={{
                fontFamily: '"SF Mono", Menlo, Monaco, monospace',
                fontSize: "12px",
                color: "var(--accent-green)",
                background: "rgba(152, 195, 121, 0.08)",
                padding: "2px 6px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {command}
            </code>
            {explanation && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {explanation}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      <div style={{ display: "flex", gap: "8px", fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>
        {!loading && !error && command && (
          <>
            <Hint label="Enter" text="執行" />
            <Hint label="Tab" text="編輯" />
          </>
        )}
        <Hint label="Esc" text="取消" />
      </div>
    </div>
  );
}

function Hint({ label, text }: { label: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
      <span
        style={{
          padding: "1px 4px",
          borderRadius: "3px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          fontSize: "10px",
          fontFamily: "-apple-system, sans-serif",
        }}
      >
        {label}
      </span>
      {text}
    </span>
  );
}
