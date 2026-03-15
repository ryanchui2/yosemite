"use client";

import type { StatsResponse } from "@/lib/api";

interface KeyMetricsProps {
  stats: StatsResponse | null;
  loading?: boolean;
  onRunScan?: () => void;
  lastScanLabel?: string;
}

function formatVolume(v: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function formatLastScan(lastScanAt: string | null): string {
  if (!lastScanAt) return "Never";
  const d = new Date(lastScanAt);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week(s) ago`;
  return d.toLocaleDateString();
}

export function KeyMetrics({
  stats,
  loading,
  onRunScan,
  lastScanLabel = "Last fraud scan",
}: KeyMetricsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-card border border-border p-4 animate-pulse"
          >
            <div className="h-3 w-16 bg-muted rounded mb-2" />
            <div className="h-6 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Stats unavailable. Run a scan to see metrics.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Transactions
          </p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">
            {stats.total_transactions.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">in database</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Total volume
          </p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">
            {formatVolume(stats.total_volume)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">in database</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {lastScanLabel}
          </p>
          <p className="text-sm font-medium mt-0.5">
            {formatLastScan(stats.last_scan_at)}
          </p>
          {onRunScan && (
            <button
              type="button"
              onClick={onRunScan}
              className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
            >
              Run scan
            </button>
          )}
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            This month
          </p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">
            {formatVolume(stats.volume_this_month)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Last month: {formatVolume(stats.volume_last_month)}
          </p>
        </div>
      </div>
      {stats.top_vendors.length > 0 && (
        <div className="bg-card border border-border p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Top vendors by volume
          </p>
          <ul className="space-y-1.5 text-sm">
            {stats.top_vendors.map((v) => (
              <li
                key={v.name}
                className="flex justify-between gap-2 text-foreground/90"
              >
                <span className="truncate">{v.name}</span>
                <span className="tabular-nums flex-shrink-0">
                  {formatVolume(v.volume)} ({v.transaction_count} txns)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
