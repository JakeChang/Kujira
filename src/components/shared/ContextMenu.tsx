export function ContextMenuItem({ label, onClick, danger, muted, suffix }: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  muted?: boolean;
  suffix?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full text-left text-[12.5px] rounded-lg transition-colors"
      style={{
        color: danger ? "var(--accent-red)" : muted ? "var(--text-muted)" : "var(--text-primary)",
        padding: "7px 10px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && <span style={{ fontSize: "10px", color: "var(--accent-green)" }}>{suffix}</span>}
    </button>
  );
}

export function ContextDivider() {
  return <div style={{ height: "1px", background: "var(--border-color)", margin: "4px 8px" }} />;
}
