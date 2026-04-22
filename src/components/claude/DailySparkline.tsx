import { formatTokens } from "../../utils/format";
import type { DailyUsage } from "../../types";

function formatCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function DailySparkline({ data, days = 7 }: { data: DailyUsage[]; days?: number }) {
  const slice = data.slice(-days);
  const max = Math.max(1, ...slice.map((d) => d.total));
  const today = slice[slice.length - 1];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
        <span style={{ color: "var(--text-secondary)" }}>今日用量</span>
        <span style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {today ? formatTokens(today.total) : "—"}
        </span>
      </div>
      {today && today.total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", marginBottom: "8px" }}>
          <span>↑{formatTokens(today.input)} ↓{formatTokens(today.output)} ⌘{formatTokens(today.cache)}</span>
          <span style={{ color: "var(--accent-yellow)" }}>≈ {formatCost(today.cost_usd)}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "32px" }}>
        {slice.map((d, i) => {
          const h = (d.total / max) * 100;
          const isToday = i === slice.length - 1;
          return (
            <div
              key={d.date}
              title={`${d.date.slice(5)}\n總計: ${formatTokens(d.total)}\n估算: ${formatCost(d.cost_usd)}`}
              style={{
                flex: 1,
                height: `${Math.max(2, h)}%`,
                background: isToday ? "var(--accent-cyan)" : "var(--border-color)",
                borderRadius: "2px",
                transition: "height 0.4s ease-out",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>
        <span>{slice[0]?.date.slice(5)}</span>
        <span>今天</span>
      </div>
    </div>
  );
}
