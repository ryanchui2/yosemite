type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const styles: Record<RiskLevel, string> = {
  CRITICAL: "bg-red-100 text-red-800 border border-red-200",
  HIGH:     "bg-orange-100 text-orange-800 border border-orange-200",
  MEDIUM:   "bg-yellow-100 text-yellow-800 border border-yellow-200",
  LOW:      "bg-green-100 text-green-800 border border-green-200",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[level]}`}>
      {level}
    </span>
  );
}
