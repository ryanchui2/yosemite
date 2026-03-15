"use client";

import { Button } from "@/components/ui/button";
import { ResultsTable } from "@/components/ResultsTable";
import { Shield, Globe } from "lucide-react";
import type { SanctionsResponse, GeoRiskResponse } from "@/lib/api";

interface GeoSanctionsTabProps {
  hasEntities: boolean;
  entityCount: number;
  onRunScan: () => void;
  sanctionsLoading: boolean;
  geoRiskLoading: boolean;
  sanctionsData: SanctionsResponse | null;
  geoRiskData: GeoRiskResponse | null;
}

export function GeoSanctionsTab({
  hasEntities,
  entityCount,
  onRunScan,
  sanctionsLoading,
  geoRiskLoading,
  sanctionsData,
  geoRiskData,
}: GeoSanctionsTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_2fr] gap-px bg-border">
        <div className="bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border border-border flex items-center justify-center">
              <Shield className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Geo &amp; Sanctions
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Run scan on your entity list
              </p>
            </div>
          </div>

          {hasEntities ? (
            <>
              <p className="text-xs text-muted-foreground">
                {entityCount} entit{entityCount !== 1 ? "ies" : "y"} from the Entity tab
              </p>
              <Button
                className="w-full"
                disabled={sanctionsLoading || geoRiskLoading}
                onClick={onRunScan}
              >
                {sanctionsLoading || geoRiskLoading ? "Scanning..." : "Run Scan"}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add entities in the <strong>Entity</strong> tab, then return here to run sanctions and geo risk scan.
            </p>
          )}
        </div>

        <div className="bg-card p-6 flex flex-col min-h-0">
          {(sanctionsData || geoRiskData) ? (
            <div className="overflow-auto">
              {sanctionsData && (
                <ResultsTable type="sanctions" data={sanctionsData} />
              )}
              {!sanctionsData && geoRiskData && (
                <ResultsTable type="georisk" data={geoRiskData} />
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-muted-foreground flex-1 flex flex-col items-center justify-center">
              <Globe className="h-6 w-6 mb-3 opacity-30" />
              <p className="text-xs uppercase tracking-wider">
                {hasEntities
                  ? "Run scan above to see sanctions and geo risk results."
                  : "Add entities in the Entity tab to run scan."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
