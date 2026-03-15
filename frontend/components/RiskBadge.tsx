type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const styles: Record<RiskLevel, string> = {
  CRITICAL: "border-foreground bg-foreground text-background",
  HIGH:     "border-foreground/60 text-foreground",
  MEDIUM:   "border-foreground/30 text-foreground/70",
  LOW:      "border-foreground/20 text-foreground/50",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] font-medium uppercase tracking-wider ${styles[level]}`}>
      {level}
    </span>
  );
}
