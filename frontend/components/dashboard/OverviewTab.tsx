"use client";

import { ProtectionScore } from "@/components/ProtectionScore";
import { RiskOverview } from "@/components/RiskOverview";
import { KeyMetrics } from "@/components/dashboard/KeyMetrics";
import type {
  FraudReportSummary,
  FraudResult,
  StatsResponse,
} from "@/lib/api";

interface OverviewTabProps {
  fraudScanLoading: boolean;
  protectionScore: number;
  fraudResults: FraudResult[];
  totalScanned: number;
  fraudReportSummary: FraudReportSummary | null;
  stats: StatsResponse | null;
  statsLoading: boolean;
  onRunScan: () => void;
}

export function OverviewTab({
  fraudScanLoading,
  protectionScore,
  fraudResults,
  totalScanned,
  fraudReportSummary,
  stats,
  statsLoading,
  onRunScan,
}: OverviewTabProps) {
  return (
    <div className="space-y-8">
      {/* Protection Score as main centerpiece */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <p className="text-center text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
            Your protection at a glance
          </p>
        </div>
        <div className="flex justify-center px-6 pb-8 pt-2">
          {fraudScanLoading ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-sm text-muted-foreground animate-pulse font-mono">
                Calculating protection score…
              </p>
            </div>
          ) : (
            <ProtectionScore score={protectionScore} />
          )}
        </div>
      </section>

      <KeyMetrics
        stats={stats}
        loading={statsLoading}
        onRunScan={onRunScan}
        lastScanLabel="Last fraud scan"
      />

      <section className="bg-card border border-border rounded-lg p-6">
        {fraudScanLoading ? (
          <p className="text-xs text-muted-foreground animate-pulse font-mono">
            Analyzing…
          </p>
        ) : (
          <RiskOverview
            results={fraudResults}
            totalScanned={totalScanned}
            summary={fraudReportSummary}
          />
        )}
      </section>
    </div>
  );
}
