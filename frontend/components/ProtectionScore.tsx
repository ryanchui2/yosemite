"use client";

interface Props {
  score: number; // 0–100
}

export function ProtectionScore({ score }: Props) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const label =
    score >= 75 ? "Well Protected" : score >= 50 ? "Moderate Risk" : "High Risk";

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full">
      <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase ">
        Protection Score
      </p>

      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-border"
          />
          {/* Progress */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-foreground"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-bold text-foreground ">{score}</span>
          <span className="text-[10px] text-muted-foreground font-mono">/100</span>
        </div>
      </div>

      <span className="text-[10px] font-medium px-3 py-1 border border-border text-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
