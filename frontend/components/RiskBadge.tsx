type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const styles: Record<RiskLevel, string> = {
  CRITICAL: "border-red-500 bg-red-500 text-white",
  HIGH:     "border-orange-400 text-orange-500",
  MEDIUM:   "border-yellow-400 text-yellow-600",
  LOW:      "border-green-400 text-green-600",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] font-medium uppercase tracking-wider ${styles[level]}`}>
      {level}
    </span>
  );
}
