import { useState, useEffect } from "react";
import { useStore } from "../../store";

function OrcaLogo() {
  return (
    <div style={{ position: "relative", width: "220px", height: "170px" }}>
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          inset: "-30px",
          background: "radial-gradient(ellipse, rgba(100,180,240,0.1) 0%, transparent 70%)",
          animation: "orcaGlow 4s ease-in-out infinite",
        }}
      />
      <svg viewBox="0 0 220 170" style={{ width: "100%", height: "100%", filter: "drop-shadow(0 4px 20px rgba(100,180,240,0.15))" }}>
        <defs>
          <linearGradient id="orcaBody" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(140,180,220,0.6)" />
            <stop offset="45%" stopColor="rgba(140,180,220,0.6)" />
            <stop offset="55%" stopColor="rgba(220,235,248,0.9)" />
            <stop offset="100%" stopColor="rgba(220,235,248,0.9)" />
          </linearGradient>
          <linearGradient id="finGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(140,180,220,0.7)" />
            <stop offset="100%" stopColor="rgba(100,150,200,0.4)" />
          </linearGradient>
        </defs>

        {/* Body outline style */}
        <path
          d="M175,80 C175,52 152,30 118,26 C90,22 56,32 40,52 C26,68 24,86 32,100 C42,114 62,120 90,120 C112,120 140,116 160,104 C170,98 175,90 175,80Z"
          fill="url(#orcaBody)"
          stroke="rgba(150,200,240,0.5)"
          strokeWidth="1.2"
        />

        {/* Back darker region */}
        <path
          d="M175,80 C175,52 152,30 118,26 C90,22 56,32 40,52 C34,60 30,68 30,76 C44,66 72,56 105,54 C138,52 165,60 175,80Z"
          fill="rgba(60,100,150,0.5)"
          stroke="rgba(150,200,240,0.3)"
          strokeWidth="0.5"
        />

        {/* Dorsal fin */}
        <path
          d="M112,54 Q116,18 128,6 Q125,26 132,50"
          fill="url(#finGrad)"
          stroke="rgba(150,200,240,0.6)"
          strokeWidth="1"
          style={{ transformOrigin: "122px 50px", animation: "dorsalSway 3s ease-in-out infinite" }}
        />

        {/* Eye patch */}
        <ellipse cx="160" cy="68" rx="11" ry="8" fill="rgba(220,235,248,0.95)" transform="rotate(-8,160,68)" />

        {/* Eye */}
        <circle cx="162" cy="67" r="3.8" fill="rgba(20,40,70,0.9)" />
        <circle cx="163.5" cy="65.8" r="1.3" fill="rgba(130,200,255,0.8)" />

        {/* Saddle patch */}
        <path d="M95,52 Q112,47 128,53 Q115,57 100,55Z" fill="rgba(100,140,180,0.3)" />

        {/* Belly highlight line */}
        <path
          d="M50,90 Q90,102 155,88"
          fill="none"
          stroke="rgba(220,240,255,0.3)"
          strokeWidth="0.8"
        />

        {/* Pectoral fin */}
        <path
          d="M130,98 Q124,120 108,132 Q118,118 124,102"
          fill="url(#finGrad)"
          stroke="rgba(150,200,240,0.4)"
          strokeWidth="0.8"
          style={{ transformOrigin: "128px 98px", animation: "pecSwim 2s ease-in-out infinite" }}
        />

        {/* Tail */}
        <g style={{ transformOrigin: "38px 78px", animation: "tailSwim 1.5s ease-in-out infinite" }}>
          <path
            d="M34,70 Q16,52 8,40 Q20,54 32,64"
            fill="url(#finGrad)"
            stroke="rgba(150,200,240,0.4)"
            strokeWidth="0.8"
          />
          <path
            d="M32,88 Q14,106 6,120 Q18,108 30,96"
            fill="url(#finGrad)"
            stroke="rgba(150,200,240,0.4)"
            strokeWidth="0.8"
          />
        </g>

        {/* Mouth */}
        <path d="M178,84 Q183,82 180,80" fill="none" stroke="rgba(150,200,240,0.35)" strokeWidth="0.8" strokeLinecap="round" />

        {/* Top sheen */}
        <ellipse cx="125" cy="62" rx="38" ry="5" fill="rgba(180,220,255,0.08)" />
      </svg>
      <style>{`
        @keyframes orcaGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes dorsalSway {
          0%, 100% { transform: skewX(0deg); }
          50% { transform: skewX(-2deg); }
        }
        @keyframes pecSwim {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(6deg); }
        }
        @keyframes tailSwim {
          0%, 100% { transform: rotate(0deg); }
          35% { transform: rotate(6deg); }
          65% { transform: rotate(-5deg); }
        }
      `}</style>
    </div>
  );
}

export function WelcomeOverlay() {
  const claudeQuota = useStore((s) => s.claudeQuota);
  const servers = useStore((s) => s.servers);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  const weekday = ["日", "一", "二", "三", "四", "五", "六"][time.getDay()];
  const dateStr = `${time.getMonth() + 1}/${time.getDate()} 週${weekday}`;
  const timeStr = time.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });

  const runningServers = servers.filter((s) => s.status === "running").length;

  const shortcuts = [
    ["⌘T", "新增分頁"],
    ["⌘W", "關閉分頁"],
    ["⌘B", "最愛列"],
    ["⌘P", "側邊面板"],
    ["⌘K", "Claude"],
    ["⌘+/-", "字體大小"],
  ];

  return (
    <div
      className="absolute inset-0 flex items-center justify-center select-none"
      style={{ pointerEvents: "none", zIndex: 0 }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", opacity: 0.7 }}>
        {/* Orca Logo */}
        <OrcaLogo />

        {/* Time & Date */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "72px", fontWeight: 200, color: "var(--text-primary)", letterSpacing: "-3px", fontVariantNumeric: "tabular-nums" }}>
            {timeStr}
          </div>
          <div style={{ fontSize: "18px", color: "var(--text-secondary)", marginTop: "6px" }}>
            {dateStr}
          </div>
        </div>

        {/* Status pills */}
        <div style={{ display: "flex", gap: "12px", fontSize: "14px", fontWeight: 500 }}>
          {servers.length > 0 && (
            <span style={{
              padding: "6px 16px",
              borderRadius: "12px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-color)",
              color: runningServers > 0 ? "var(--accent-green)" : "var(--text-secondary)",
            }}>
              {runningServers}/{servers.length} 伺服器運行中
            </span>
          )}
          {claudeQuota && (
            <span style={{
              padding: "6px 16px",
              borderRadius: "12px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-color)",
              color: claudeQuota.sessionUtilization >= 0.9 ? "var(--accent-red)"
                : claudeQuota.sessionUtilization >= 0.75 ? "var(--accent-yellow)"
                : "var(--accent-green)",
            }}>
              Claude {Math.round((1 - claudeQuota.sessionUtilization) * 100)}%
            </span>
          )}
        </div>

        {/* Shortcuts */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 36px",
          fontSize: "13px",
        }}>
          {shortcuts.map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{
                display: "inline-block",
                minWidth: "48px",
                textAlign: "right",
                color: "var(--text-secondary)",
                fontFamily: "-apple-system, sans-serif",
                fontSize: "12px",
                fontWeight: 500,
              }}>
                {key}
              </span>
              <span style={{ color: "var(--text-primary)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
