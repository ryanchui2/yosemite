"use client";

import { Button } from "@/components/ui/button";
import { FlaggedTransactions } from "@/components/FlaggedTransactions";
import { ResultsTable } from "@/components/ResultsTable";
import { AlertTriangle } from "lucide-react";
import type {
  AnomaliesResponse,
  FraudResult,
} from "@/lib/api";

export interface ManualTx {
  customer_name: string;
  timestamp: string;
  amount: string;
  currency: string;
  payment_method: string;
  card_brand: string;
  card_last4: string;
  ip_country: string;
  ip_is_vpn: boolean;
  device_type: string;
  cvv_match: boolean;
  address_match: boolean;
}

const emptyTx: ManualTx = {
  customer_name: "",
  timestamp: "",
  amount: "",
  currency: "CAD",
  payment_method: "credit_card",
  card_brand: "Visa",
  card_last4: "",
  ip_country: "",
  ip_is_vpn: false,
  device_type: "desktop",
  cvv_match: true,
  address_match: true,
};

export { emptyTx as emptyManualTx };

interface AnomalyTabProps {
  hasData: boolean;
  onRunAnalysis: () => void;
  anomaliesLoading: boolean;
  fraudScanLoading: boolean;
  fraudResults: FraudResult[];
  anomaliesData: AnomaliesResponse | null;
  rowCount: number;
  csvOriginalFile: File | null;
}

export function AnomalyTab({
  hasData,
  onRunAnalysis,
  anomaliesLoading,
  fraudScanLoading,
  fraudResults,
  anomaliesData,
  rowCount,
  csvOriginalFile,
}: AnomalyTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_1fr] gap-px bg-border">
        <div className="bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border border-border flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Anomaly Detector
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Reports
              </p>
            </div>
          </div>

          {hasData ? (
            <>
              <p className="text-xs text-muted-foreground">
                {csvOriginalFile?.type === "application/pdf" ||
                  csvOriginalFile?.name.toLowerCase().endsWith(".pdf")
                  ? "1 PDF document"
                  : `${rowCount} row${rowCount !== 1 ? "s" : ""} from your transaction set`}
              </p>
              <Button
                className="w-full"
                disabled={anomaliesLoading}
                onClick={onRunAnalysis}
              >
                {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add transactions in the <strong>Transactions</strong> tab, then return here to run analysis.
            </p>
          )}
        </div>

        <div className="bg-card p-6 flex flex-col">
          {fraudScanLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse font-mono">
              Loading...
            </p>
          ) : (
            <FlaggedTransactions results={fraudResults} />
          )}
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
            Anomaly Report
          </span>
        </div>
        <div className="p-6 space-y-8">
          {hasData ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground font-mono">
                  {csvOriginalFile?.type === "application/pdf" ||
                    csvOriginalFile?.name.toLowerCase().endsWith(".pdf")
                    ? "1 PDF document"
                    : `${rowCount} row${rowCount !== 1 ? "s" : ""} scanned`}
                </p>
                <Button
                  disabled={anomaliesLoading}
                  onClick={onRunAnalysis}
                >
                  {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
                </Button>
              </div>
              {anomaliesData && (
                <ResultsTable type="anomalies" data={anomaliesData} />
              )}
              {!anomaliesData && !anomaliesLoading && (
                <p className="text-xs text-muted-foreground">
                  Run analysis above to see the anomaly report.
                </p>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              <AlertTriangle className="h-6 w-6 mx-auto mb-3 opacity-30" />
              <p className="text-xs uppercase tracking-wider">
                Add transactions in the Transactions tab to run analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
