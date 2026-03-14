"use client";

interface Props {
  score: number; // 0–100
}

export function ProtectionScore({ score }: Props) {
  // SVG circle math
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  const label =
    score >= 75 ? "Well Protected" : score >= 50 ? "Moderate Risk" : "High Risk";

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full">
      <p className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
        Protection Score
      </p>

      {/* Circle gauge */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-muted"
          />
          {/* Progress */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-bold text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>

      <span
        className="text-xs font-semibold px-3 py-1 rounded-full"
        style={{ background: `${color}22`, color }}
      >
        {label}
      </span>
    </div>
  );
}
