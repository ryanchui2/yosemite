"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ResultsTable } from "@/components/ResultsTable";
import { PDFExport } from "@/components/PDFExport";
import { CSVDataTable } from "@/components/CSVDataTable";
import { Button } from "@/components/ui/button";
import { ProtectionScore } from "@/components/ProtectionScore";
import { FlaggedTransactions } from "@/components/FlaggedTransactions";
import { RiskOverview } from "@/components/RiskOverview";
import { FraudAgentProgress } from "@/components/FraudAgentProgress";
import {
  scanSanctions,
  scanAnomalies,
  analyzeGeoRisk,
  fetchCachedFraudScan,
  fetchFraudReportSummary,
  fetchTransactions,
  agentScan,
  saveCsvData,
  fetchSavedCsvList,
  saveEntityList,
  fetchSavedEntityList,
} from "@/lib/api";
import type {
  SanctionsResponse,
  AnomaliesResponse,
  GeoRiskResponse,
  FraudScanResponse,
  FraudReportSummary,
  AgentScanReport,
  SavedCsvData,
  AnomalyResult,
  SavedEntityData,
} from "@/lib/api";
import {
  AlertTriangle,
  Globe,
  Shield,
  Upload,
  Cuboid,
  Drama,
  Ship,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";

type SidebarTab = "overview" | "anomaly" | "geosanctions" | "aifraud";

/** RFC 4180-compliant CSV line parser — handles quoted fields with embedded commas. */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]);
  const rows = lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const values = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });
  return { headers, rows };
}

function rowsToCSVFile(
  headers: string[],
  rows: Record<string, string>[],
): File {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(quote).join(","),
    ...rows.map((r) => headers.map((h) => quote(r[h] ?? "")).join(",")),
  ];
  return new File([lines.join("\n")], "data.csv", { type: "text/csv" });
}

/** Compact drag-and-drop upload zone */
function DropZone({
  hint,
  onFile,
  onRemove,
  fileName,
}: {
  hint: string;
  onFile: (f: File) => void;
  onRemove?: () => void;
  fileName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="relative">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border border-border px-4 py-5 text-center cursor-pointer transition-all ${dragging ? "border-foreground bg-accent" : "hover:border-foreground/40"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {fileName ? (
          <div className="pr-4">
            <p className="text-xs font-medium text-foreground truncate font-mono">
              {fileName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drop to replace
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Drop CSV/PDF or click to browse
            </p>
            <p className="text-[11px] text-muted-foreground/60">{hint}</p>
          </div>
        )}
      </div>
      {fileName && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1.5 right-1.5 h-5 w-5 border border-border hover:border-foreground/40 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
          title="Remove file"
        >
          <span className="text-[10px] font-bold leading-none">✕</span>
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("overview");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [sanctionsData, setSanctionsData] = useState<SanctionsResponse | null>(
    null,
  );
  const [anomaliesData, setAnomaliesData] = useState<AnomaliesResponse | null>(
    null,
  );
  const [geoRiskData, setGeoRiskData] = useState<GeoRiskResponse | null>(null);
  const [fraudScanData, setFraudScanData] = useState<FraudScanResponse | null>(
    null,
  );
  const [fraudReportSummary, setFraudReportSummary] =
    useState<FraudReportSummary | null>(null);
  const [fraudScanLoading, setFraudScanLoading] = useState(true);
  const [agentScanReport, setAgentScanReport] = useState<AgentScanReport | null>(null);
  const [agentScanLoading, setAgentScanLoading] = useState(false);
  const [agentScanDocument, setAgentScanDocument] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFraudScanLoading(true);
    Promise.allSettled([fetchCachedFraudScan(), fetchFraudReportSummary()])
      .then(([scanResult, summaryResult]) => {
        if (cancelled) return;
        if (scanResult.status === "fulfilled")
          setFraudScanData(scanResult.value);
        if (summaryResult.status === "fulfilled")
          setFraudReportSummary(summaryResult.value);
      })
      .finally(() => {
        if (!cancelled) setFraudScanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fraudResults = fraudScanData?.results ?? [];
  const totalScanned = fraudScanData?.total_scanned ?? 0;

  async function handleRunAgentScan() {
    setAgentScanLoading(true);
    setError(null);
    setAgentScanReport(null);
    try {
      const transactions = await fetchTransactions();
      if (transactions.length === 0) {
        setError("No transactions in the database. Add transactions first.");
        return;
      }
      const payload = transactions.map((t) => ({
        transaction_id: t.transaction_id,
        order_id: t.order_id,
        customer_id: t.customer_id ?? t.customer_name,
        amount: t.amount,
        cvv_match: t.cvv_match,
        address_match: t.address_match,
        ip_is_vpn: t.ip_is_vpn,
        card_present: t.card_present,
        timestamp: t.timestamp,
      }));
      let docOptions: { document_base64?: string; mime_type?: string } | undefined;
      if (agentScanDocument) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const dataUrl = r.result as string;
            const b64 = dataUrl.split(",")[1];
            resolve(b64 ?? "");
          };
          r.onerror = () => reject(new Error("Failed to read document"));
          r.readAsDataURL(agentScanDocument);
        });
        const mime = agentScanDocument.type || "application/octet-stream";
        docOptions = { document_base64: base64, mime_type: mime };
      }
      const report = await agentScan(payload, docOptions);
      setAgentScanReport(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent scan failed.");
      setAgentScanReport(null);
    } finally {
      setAgentScanLoading(false);
    }
  }

  // Protection score from anomaly detector, geo & sanctions (not fraud scan)
  const protectionScore = (() => {
    const components: number[] = [];
    if (anomaliesData && anomaliesData.total_transactions > 0) {
      const pct =
        (anomaliesData.flagged / anomaliesData.total_transactions) * 100;
      components.push(Math.max(0, 100 - pct));
    }
    if (sanctionsData && sanctionsData.total_entities > 0) {
      const pct = (sanctionsData.flagged / sanctionsData.total_entities) * 100;
      components.push(Math.max(0, 100 - pct));
    }
    if (geoRiskData && geoRiskData.results.length > 0) {
      const geoFlagged = geoRiskData.results.filter(
        (r) => r.risk_level === "CRITICAL" || r.risk_level === "HIGH",
      ).length;
      const pct = (geoFlagged / geoRiskData.results.length) * 100;
      components.push(Math.max(0, 100 - pct));
    }
    if (components.length === 0) return 100;
    return Math.round(
      components.reduce((a, b) => a + b, 0) / components.length,
    );
  })();

  const [sanctionsLoading, setSanctionsLoading] = useState(false);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [geoRiskLoading, setGeoRiskLoading] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | undefined>();
  const [csvOriginalFile, setCsvOriginalFile] = useState<File | null>(null);

  type ManualTx = {
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
  };
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
  const [manualTransactions, setManualTransactions] = useState<ManualTx[]>([]);
  const [manualTxInput, setManualTxInput] = useState<ManualTx>(emptyTx);

  const [sanctionsFile, setSanctionsFile] = useState<File | null>(null);
  const [uploadedSanctionsEntities, setUploadedSanctionsEntities] = useState<
    { description: string; country: string }[]
  >([]);
  const [manualEntities, setManualEntities] = useState<
    { description: string; country: string }[]
  >([]);
  const [manualInput, setManualInput] = useState({
    description: "",
    country: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [csvSaveMessage, setCsvSaveMessage] = useState<string | null>(null);
  const [csvSaveLoading, setCsvSaveLoading] = useState(false);
  const [saveLogName, setSaveLogName] = useState("");
  const [lastScannedCount, setLastScannedCount] = useState(0);

  const [entitySaveMessage, setEntitySaveMessage] = useState<string | null>(
    null,
  );
  const [entitySaveLoading, setEntitySaveLoading] = useState(false);
  const [saveEntityLogName, setSaveEntityLogName] = useState("");

  /** Parse a CSV string into entity rows using same column rules as backend (description|name|entity_name|company|vendor|customer_name, country|ip_country). */
  function parseSanctionsCsv(
    text: string,
  ): { description: string; country: string }[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const hdrs = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const entityNameColumns = [
      "description",
      "name",
      "entity_name",
      "company",
      "vendor",
      "customer_name",
    ];
    const entityCol = entityNameColumns.find((col) => hdrs.includes(col));
    const nameIdx = entityCol !== undefined ? hdrs.indexOf(entityCol) : -1;
    const countryIdx =
      hdrs.indexOf("country") !== -1
        ? hdrs.indexOf("country")
        : hdrs.indexOf("ip_country");
    const out: { description: string; country: string }[] = [];
    if (nameIdx === -1) return [];
    for (const line of lines.slice(1)) {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const desc = vals[nameIdx];
      if (desc)
        out.push({ description: desc, country: vals[countryIdx] ?? "" });
    }
    return out;
  }

  function handleAnomalyFile(file: File) {
    setCsvOriginalFile(file);
    setCsvFileName(file.name);
    setAnomaliesData(null);
    setError(null);
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      setCsvHeaders([]);
      setCsvRows([]);
    } else {
      file.text().then((text) => {
        const { headers: newHeaders, rows: newRows } = parseCSV(text);
        setCsvHeaders((prevHeaders) => {
          const merged = prevHeaders.length ? [...prevHeaders] : [];
          for (const h of newHeaders) {
            if (!merged.includes(h)) merged.push(h);
          }
          return merged.length ? merged : newHeaders;
        });
        setCsvRows((prevRows) => {
          const mergedHeaders = csvHeaders.length
            ? [...csvHeaders]
            : [...newHeaders];
          for (const h of newHeaders) {
            if (!mergedHeaders.includes(h)) mergedHeaders.push(h);
          }
          const existingRows = prevRows.map((r) =>
            Object.fromEntries(mergedHeaders.map((col) => [col, r[col] ?? ""])),
          );
          const appended = newRows.map((r) =>
            Object.fromEntries(mergedHeaders.map((col) => [col, r[col] ?? ""])),
          );
          return [...existingRows, ...appended];
        });
      });
    }
  }

  function addManualTransaction() {
    if (!manualTxInput.customer_name.trim()) return;
    setManualTransactions((prev) => [
      ...prev,
      {
        ...manualTxInput,
        timestamp:
          manualTxInput.timestamp ||
          new Date().toISOString().replace("T", " ").slice(0, 19),
      },
    ]);
    setManualTxInput(emptyTx);
  }

  function removeManualTransaction(index: number) {
    setManualTransactions((prev) => prev.filter((_, i) => i !== index));
  }

  function addManualEntity() {
    const description = manualInput.description.trim();
    if (!description) return;
    setManualEntities((prev) => [
      ...prev,
      { description, country: manualInput.country.trim() },
    ]);
    setManualInput({ description: "", country: "" });
  }

  function removeManualEntity(index: number) {
    setManualEntities((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleRunAnalysis() {
    if (!csvRows.length && !manualTransactions.length && !csvOriginalFile)
      return;
    setAnomaliesLoading(true);
    setError(null);
    const TX_HEADERS = [
      "transaction_id",
      "customer_name",
      "timestamp",
      "amount",
      "currency",
      "payment_method",
      "card_last4",
      "card_brand",
      "ip_country",
      "ip_is_vpn",
      "device_type",
      "cvv_match",
      "address_match",
    ];
    const headers = csvHeaders.length ? csvHeaders : TX_HEADERS;
    const allRows: Record<string, string>[] = [
      ...csvRows,
      ...manualTransactions.map((t) => ({
        transaction_id: crypto.randomUUID(),
        customer_name: t.customer_name,
        timestamp: t.timestamp,
        amount: t.amount,
        currency: t.currency,
        payment_method: t.payment_method,
        card_last4: t.card_last4,
        card_brand: t.card_brand,
        ip_country: t.ip_country,
        ip_is_vpn: String(t.ip_is_vpn),
        device_type: t.device_type,
        cvv_match: String(t.cvv_match),
        address_match: String(t.address_match),
      })),
    ];
    const totalRows = allRows.length;
    // Only do incremental (skip already-scanned rows) when we have a prior run and new rows were added
    const doFullScan =
      lastScannedCount === 0 || lastScannedCount >= totalRows || !anomaliesData;

    try {
      let file: File;
      let rowsToSend: Record<string, string>[];

      if (
        csvOriginalFile &&
        (csvOriginalFile.type === "application/pdf" ||
          csvOriginalFile.name.toLowerCase().endsWith(".pdf"))
      ) {
        file = csvOriginalFile;
        setLastScannedCount(0);
        rowsToSend = allRows;
      } else if (doFullScan) {
        setLastScannedCount(0);
        rowsToSend = allRows;
        if (
          manualTransactions.length === 0 &&
          csvOriginalFile &&
          totalRows === csvRows.length
        ) {
          // No manual entries — send the original uploaded file untouched to avoid
          // any lossy parse→reconstruct round-trip corrupting fraud signal columns.
          file = csvOriginalFile;
        } else {
          setCsvHeaders(headers);
          setCsvRows(allRows);
          file = rowsToCSVFile(headers, allRows);
        }
      } else {
        // Send only new rows (indices lastScannedCount..totalRows-1)
        const newRowsOnly = allRows.slice(lastScannedCount);
        rowsToSend = newRowsOnly;
        setCsvHeaders(headers);
        setCsvRows(allRows);
        file = rowsToCSVFile(headers, newRowsOnly);
      }

      const data = await scanAnomalies(file);

      let finalAnomalyState: {
        scan_id: string;
        total_transactions: number;
        flagged: number;
        results: AnomalyResult[];
      };
      if (!doFullScan && anomaliesData && data.results.length > 0) {
        const existingResults = anomaliesData.results;
        const newResults = data.results.map((r, i) => ({
          ...r,
          row_index: lastScannedCount + i,
        }));
        const mergedResults = [...existingResults, ...newResults];
        const mergedFlagged = mergedResults.filter(
          (r) => r.risk_level === "HIGH" || r.risk_level === "MEDIUM",
        ).length;
        finalAnomalyState = {
          scan_id: anomaliesData.scan_id,
          total_transactions: totalRows,
          flagged: mergedFlagged,
          results: mergedResults,
        };
        setAnomaliesData(finalAnomalyState);
      } else {
        finalAnomalyState = data;
        setAnomaliesData(data);
      }
      setLastScannedCount(totalRows);

      // Persist scan so it loads on next visit
      const name = `Transactions – ${new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
      saveCsvData({
        name,
        stage: "after_scan",
        file_name: undefined,
        headers,
        rows: allRows,
        scan_id: finalAnomalyState.scan_id,
        scan_summary: {
          total_transactions: finalAnomalyState.total_transactions,
          flagged: finalAnomalyState.flagged,
        },
        scan_results: finalAnomalyState.results,
      }).catch(() => { });
    } catch {
      setError("Anomaly scan failed. Is the backend running?");
    } finally {
      setAnomaliesLoading(false);
    }
  }

  /** Build current transaction set (CSV + manual) for save/scan. */
  function getCurrentTransactionSet(): {
    headers: string[];
    rows: Record<string, string>[];
  } {
    const TX_HEADERS = [
      "transaction_id",
      "customer_name",
      "timestamp",
      "amount",
      "currency",
      "payment_method",
      "card_last4",
      "card_brand",
      "ip_country",
      "ip_is_vpn",
      "device_type",
      "cvv_match",
      "address_match",
    ];
    const headers = csvHeaders.length ? csvHeaders : TX_HEADERS;
    const rows: Record<string, string>[] = [
      ...csvRows,
      ...manualTransactions.map((t) => ({
        transaction_id: crypto.randomUUID(),
        customer_name: t.customer_name,
        timestamp: t.timestamp,
        amount: t.amount,
        currency: t.currency,
        payment_method: t.payment_method,
        card_last4: t.card_last4,
        card_brand: t.card_brand,
        ip_country: t.ip_country,
        ip_is_vpn: String(t.ip_is_vpn),
        device_type: t.device_type,
        cvv_match: String(t.cvv_match),
        address_match: String(t.address_match),
      })),
    ];
    return { headers, rows };
  }

  /** Save current transaction log (with optional name). Includes scan results if we have them. */
  async function handleSaveTransactionLog() {
    const { headers, rows } = getCurrentTransactionSet();
    if (!rows.length) return;
    setCsvSaveLoading(true);
    setCsvSaveMessage(null);
    try {
      const name =
        saveLogName.trim() ||
        `Transactions – ${new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
      await saveCsvData({
        name,
        stage: anomaliesData ? "after_scan" : "before_scan",
        file_name: csvFileName ?? undefined,
        headers,
        rows,
        ...(anomaliesData && {
          scan_id: anomaliesData.scan_id,
          scan_summary: {
            total_transactions: anomaliesData.total_transactions,
            flagged: anomaliesData.flagged,
          },
          scan_results: anomaliesData.results,
        }),
      });
      setCsvSaveMessage("Saved");
      setTimeout(() => setCsvSaveMessage(null), 3000);
    } catch (e) {
      setCsvSaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCsvSaveLoading(false);
    }
  }

  /** Apply a saved log to the workspace (used by auto-load on start and by manual load). */
  const applySavedLog = useCallback((saved: SavedCsvData) => {
    const headers = Array.isArray(saved.headers)
      ? (saved.headers as string[])
      : [];
    const rows = Array.isArray(saved.rows)
      ? (saved.rows as Record<string, string>[])
      : [];
    setCsvHeaders(headers);
    setCsvRows(rows);
    setCsvFileName(undefined); // don't show saved file name in drop zone
    setCsvOriginalFile(null);
    setManualTransactions([]);
    setLastScannedCount(rows.length);
    if (
      saved.scan_results &&
      saved.scan_summary &&
      typeof saved.scan_summary === "object" &&
      "total_transactions" in saved.scan_summary &&
      "flagged" in saved.scan_summary
    ) {
      const summary = saved.scan_summary as {
        total_transactions: number;
        flagged: number;
      };
      setAnomaliesData({
        scan_id: (saved.scan_id as string) ?? crypto.randomUUID(),
        total_transactions: summary.total_transactions,
        flagged: summary.flagged,
        results: (saved.scan_results as AnomalyResult[]) ?? [],
      });
    } else {
      setAnomaliesData(null);
    }
  }, []);

  /** On start, automatically load the most recent saved transaction log if any exist. */
  useEffect(() => {
    let cancelled = false;
    fetchSavedCsvList()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        const sorted = [...list].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        applySavedLog(sorted[0]);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [applySavedLog]);

  /** Current entity list (file + manual) for Geo & Sanctions save. */
  function getCurrentEntities(): { description: string; country: string }[] {
    return [...uploadedSanctionsEntities, ...manualEntities];
  }

  /** Save current entity list (with optional name). Includes scan results if available. */
  async function handleSaveEntityList() {
    const entities = getCurrentEntities();
    if (!entities.length) return;
    setEntitySaveLoading(true);
    setEntitySaveMessage(null);
    try {
      const name =
        saveEntityLogName.trim() ||
        `Entity list – ${new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
      await saveEntityList({
        name,
        entities,
        sanctions_results: sanctionsData ?? undefined,
        geo_results: geoRiskData ?? undefined,
      });
      setEntitySaveMessage("Saved");
      setTimeout(() => setEntitySaveMessage(null), 3000);
    } catch (e) {
      setEntitySaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEntitySaveLoading(false);
    }
  }

  /** Apply a saved entity list to the workspace (used by auto-load on start). */
  const applySavedEntityLog = useCallback((saved: SavedEntityData) => {
    const entities = Array.isArray(saved.entities)
      ? (saved.entities as { description: string; country: string }[])
      : [];
    setSanctionsFile(null);
    setUploadedSanctionsEntities([]);
    setManualEntities(entities);
    setManualInput({ description: "", country: "" });
    if (
      saved.sanctions_results &&
      typeof saved.sanctions_results === "object" &&
      "results" in saved.sanctions_results
    ) {
      setSanctionsData(saved.sanctions_results as SanctionsResponse);
    } else {
      setSanctionsData(null);
    }
    if (
      saved.geo_results &&
      typeof saved.geo_results === "object" &&
      "results" in saved.geo_results
    ) {
      setGeoRiskData(saved.geo_results as GeoRiskResponse);
    } else {
      setGeoRiskData(null);
    }
  }, []);

  /** On start, automatically load the most recent saved entity list if any exist. */
  useEffect(() => {
    let cancelled = false;
    fetchSavedEntityList()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        const sorted = [...list].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        applySavedEntityLog(sorted[0]);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [applySavedEntityLog]);

  async function handleSanctionsScan() {
    if (!sanctionsFile && manualEntities.length === 0) return;
    setSanctionsLoading(true);
    setGeoRiskLoading(true);
    setError(null);

    const fileEntities =
      uploadedSanctionsEntities.length > 0
        ? uploadedSanctionsEntities
        : sanctionsFile
          ? parseSanctionsCsv(await sanctionsFile.text())
          : [];
    const allEntities = [...fileEntities, ...manualEntities];

    const uniqueCountries = [
      ...new Set(allEntities.map((e) => e.country.trim()).filter(Boolean)),
    ];

    const sanctionsPromise =
      allEntities.length > 0
        ? (() => {
          const csvContent =
            "description,country\n" +
            allEntities
              .map((e) => `${e.description},${e.country}`)
              .join("\n");
          const fileToScan = new File([csvContent], "entities.csv", {
            type: "text/csv",
          });
          return scanSanctions(fileToScan);
        })()
        : Promise.resolve(null);

    const geoPromise =
      uniqueCountries.length > 0
        ? analyzeGeoRisk(uniqueCountries)
        : Promise.resolve(null);

    try {
      const [sanctionsResult, geoResult] = await Promise.allSettled([
        sanctionsPromise,
        geoPromise,
      ]);
      const newSanctions =
        sanctionsResult.status === "fulfilled" ? sanctionsResult.value : null;
      const newGeo = geoResult.status === "fulfilled" ? geoResult.value : null;
      if (newSanctions) setSanctionsData(newSanctions);
      if (newGeo) setGeoRiskData(newGeo);
      if (
        sanctionsResult.status === "rejected" ||
        geoResult.status === "rejected"
      ) {
        setError("Some scans failed. Is the backend running?");
      } else if (allEntities.length > 0 && (newSanctions || newGeo)) {
        // Persist scan so it loads on next visit
        saveEntityList({
          name: `Entity list – ${new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`,
          entities: allEntities,
          sanctions_results: newSanctions ?? null,
          geo_results: newGeo ?? null,
        }).catch(() => { });
      }
    } catch {
      setError("Scan failed. Is the backend running?");
    } finally {
      setSanctionsLoading(false);
      setGeoRiskLoading(false);
    }
  }

  const sidebarItems: {
    id: SidebarTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
      { id: "overview", label: "overview", icon: <Cuboid className="h-4 w-4" /> },
      {
        id: "anomaly",
        label: "anomaly detector",
        icon: <Drama className="h-4 w-4" />,
      },
      {
        id: "geosanctions",
        label: "geo & sanctions",
        icon: <Ship className="h-4 w-4" />,
      },
      {
        id: "aifraud",
        label: "AI fraud analysis",
        icon: <AlertTriangle className="h-4 w-4" />,
      },
    ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Floating header */}
      <header className="fixed top-3 inset-x-4 z-50 flex items-center justify-between px-5 py-3 bg-background/80 border border-border font-heading">
        <div className="flex items-center gap-3">
          <Image
            src="/yosemite_logo.png"
            alt="yosemite logo"
            width={32}
            height={32}
          />
          <span className="text-[17px] font-semibold tracking-tight text-foreground">
            yosemite
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(sanctionsData || anomaliesData || geoRiskData) && (
            <PDFExport
              sanctionsData={sanctionsData}
              anomaliesData={anomaliesData}
              geoRiskData={geoRiskData}
            />
          )}
          <div className="flex items-center gap-2 border border-foreground/20 px-3 py-1.5">
            {user ? (
              <>
                <span className="text-[10px] tracking-wider text-muted-foreground">
                  {user.email}
                </span>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogOut size={12} />
                </button>
              </>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLoginError(null);
                  setLoginLoading(true);
                  try {
                    await login(loginEmail, loginPassword);
                    setLoginEmail("");
                    setLoginPassword("");
                  } catch (err) {
                    setLoginError(err instanceof Error ? err.message : "Login failed");
                  } finally {
                    setLoginLoading(false);
                  }
                }}
              >
                <input
                  type="email"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="text-[10px] w-32 px-2 py-1 border border-border bg-background text-foreground rounded"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="text-[10px] w-24 px-2 py-1 border border-border bg-background text-foreground rounded"
                  required
                />
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="text-[10px] px-2 py-1 border border-foreground/40 hover:bg-foreground/10 rounded"
                >
                  {loginLoading ? "…" : "Sign in"}
                </button>
                {loginError && (
                  <span className="text-[10px] text-destructive">{loginError}</span>
                )}
              </form>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-screen pt-20">
        {/* Sidebar */}
        <aside className="fixed top-20 left-0 w-56 h-[calc(100vh-5rem)] flex flex-col justify-between p-4">
          <nav className="flex flex-col gap-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs tracking-wider transition-colors text-left border font-heading ${activeTab === item.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-foreground border-border hover:border-foreground/40"
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto ml-56">
          {error && (
            <div className="border border-destructive p-3 text-sm text-destructive font-mono mb-6">
              {error}
            </div>
          )}

          {/* ─── OVERVIEW TAB ─── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-px bg-border">
                {/* Protection Score */}
                <div className="bg-card p-8 flex justify-center">
                  {fraudScanLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse font-mono">
                      Calculating...
                    </p>
                  ) : (
                    <ProtectionScore score={protectionScore} />
                  )}
                </div>
                {/* Risk Overview */}
                <div className="bg-card p-6 flex flex-col">
                  {fraudScanLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse font-mono">
                      Analyzing...
                    </p>
                  ) : (
                    <RiskOverview
                      results={fraudResults}
                      totalScanned={totalScanned}
                      summary={fraudReportSummary}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── AI FRAUD ANALYSIS TAB ─── */}
          {activeTab === "aifraud" && (
            <div className="space-y-6">
              <div className="bg-card border border-border p-6 space-y-4">
                <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
                  Full AI fraud analysis
                </p>
                <p className="text-sm text-foreground/80">
                  Run the multi-agent pipeline (anomaly detection, Benford&apos;s Law, duplicate detection, graph analysis) on all transactions in the database.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Optional: attach a document (PDF/image) for VLM fraud analysis
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:bg-muted file:text-xs"
                      onChange={(e) => setAgentScanDocument(e.target.files?.[0] ?? null)}
                    />
                    {agentScanDocument && (
                      <span className="text-xs text-muted-foreground">
                        {agentScanDocument.name}
                        <button
                          type="button"
                          className="ml-1 text-destructive hover:underline"
                          onClick={() => setAgentScanDocument(null)}
                        >
                          clear
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-4 items-start">
                  <div className="space-y-4">
                    <Button
                      onClick={handleRunAgentScan}
                      disabled={agentScanLoading}
                      className="font-mono text-xs"
                    >
                      {agentScanLoading ? "Running analysis…" : "Run full AI fraud analysis"}
                    </Button>

                    {agentScanReport && (
                      <div className="border border-border mt-4 p-4 space-y-3 text-sm">
                        <p className="text-[10px] font-medium text-muted-foreground tracking-[0.2em] uppercase">
                          Report
                        </p>
                        <p className="font-medium capitalize text-foreground">
                          Risk level: {agentScanReport.risk_level}
                        </p>
                        <p className="text-foreground/90 leading-relaxed">{agentScanReport.summary}</p>
                        {agentScanReport.anomalous_transaction_ids.length > 0 && (
                          <p className="text-xs font-mono text-muted-foreground">
                            Anomalous IDs: {agentScanReport.anomalous_transaction_ids.slice(0, 15).join(", ")}
                            {agentScanReport.anomalous_transaction_ids.length > 15 ? "…" : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {agentScanReport.benford_suspicious && (
                            <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">Benford suspicious</span>
                          )}
                          {agentScanReport.duplicate_groups_count > 0 && (
                            <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
                              {agentScanReport.duplicate_groups_count} duplicate group(s)
                            </span>
                          )}
                          {agentScanReport.graph_flagged_ids && agentScanReport.graph_flagged_ids.length > 0 && (
                            <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
                              Graph: {agentScanReport.graph_flagged_ids.length} flagged
                            </span>
                          )}
                          {agentScanReport.document_risk_level && agentScanReport.document_risk_level !== "LOW" && (
                            <span className="border border-amber-500/50 px-2 py-1 text-amber-700 dark:text-amber-400">
                              Document (VLM): {agentScanReport.document_risk_level}
                            </span>
                          )}
                        </div>
                        {agentScanReport.graph_summary && (
                          <p className="text-xs text-muted-foreground">{agentScanReport.graph_summary}</p>
                        )}
                        {agentScanReport.document_summary && (
                          <p className="text-xs text-muted-foreground">{agentScanReport.document_summary}</p>
                        )}
                        {agentScanReport.review_notes && (
                          <p className="text-xs border-l-2 border-amber-500/50 pl-2 text-foreground/80 italic">
                            Review: {agentScanReport.review_notes}
                          </p>
                        )}
                        {agentScanReport.recommendations.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-foreground/80">
                            {agentScanReport.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <FraudAgentProgress loading={agentScanLoading} report={agentScanReport} />
                </div>
              </div>
            </div>
          )}

          {/* ─── ANOMALY DETECTOR TAB ─── */}
          {activeTab === "anomaly" && (
            <div className="space-y-6">
              <div className="grid grid-cols-[1fr_1fr] gap-px bg-border">
                {/* Left: Anomaly Detector inputs */}
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
                        Transaction CSV
                      </p>
                    </div>
                  </div>

                  <DropZone
                    hint="date, vendor, amount"
                    onFile={handleAnomalyFile}
                    onRemove={() => {
                      setCsvFileName(undefined);
                      setCsvOriginalFile(null);
                    }}
                    fileName={csvFileName}
                  />

                  {csvRows.length > 0 && (
                    <p className="text-[11px] text-muted-foreground text-center font-mono">
                      {csvRows.length} row{csvRows.length !== 1 ? "s" : ""}{" "}
                      loaded
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      or add individually
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Manual transaction form */}
                  <div className="space-y-2">
                    <div className="border border-border p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Customer Name
                          </label>
                          <input
                            type="text"
                            value={manualTxInput.customer_name}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                customer_name: e.target.value,
                              }))
                            }
                            placeholder="Jane Doe"
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Date & Time
                          </label>
                          <input
                            type="datetime-local"
                            value={manualTxInput.timestamp}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                timestamp: e.target.value,
                              }))
                            }
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Amount
                          </label>
                          <input
                            type="number"
                            value={manualTxInput.amount}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                amount: e.target.value,
                              }))
                            }
                            placeholder="0.00"
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Currency
                          </label>
                          <select
                            value={manualTxInput.currency}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                currency: e.target.value,
                              }))
                            }
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          >
                            {["CAD", "USD", "EUR", "GBP"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Payment
                          </label>
                          <select
                            value={manualTxInput.payment_method}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                payment_method: e.target.value,
                              }))
                            }
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          >
                            {[
                              "credit_card",
                              "debit",
                              "cash",
                              "bank_transfer",
                            ].map((m) => (
                              <option key={m} value={m}>
                                {m.replace("_", " ")}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Card Brand
                          </label>
                          <select
                            value={manualTxInput.card_brand}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                card_brand: e.target.value,
                              }))
                            }
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          >
                            {["Visa", "Mastercard", "Amex", "Discover"].map(
                              (b) => (
                                <option key={b}>{b}</option>
                              ),
                            )}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Last 4
                          </label>
                          <input
                            type="text"
                            maxLength={4}
                            value={manualTxInput.card_last4}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                card_last4: e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 4),
                              }))
                            }
                            placeholder="0000"
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            IP Country
                          </label>
                          <input
                            type="text"
                            value={manualTxInput.ip_country}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                ip_country: e.target.value
                                  .toUpperCase()
                                  .slice(0, 2),
                              }))
                            }
                            placeholder="CA"
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors uppercase"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            Device
                          </label>
                          <select
                            value={manualTxInput.device_type}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                device_type: e.target.value,
                              }))
                            }
                            className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          >
                            {["desktop", "mobile", "tablet"].map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualTxInput.cvv_match}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                cvv_match: e.target.checked,
                              }))
                            }
                            className="accent-foreground"
                          />
                          <span className="text-xs text-muted-foreground">
                            CVV Match
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualTxInput.address_match}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                address_match: e.target.checked,
                              }))
                            }
                            className="accent-foreground"
                          />
                          <span className="text-xs text-muted-foreground">
                            Address Match
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualTxInput.ip_is_vpn}
                            onChange={(e) =>
                              setManualTxInput((p) => ({
                                ...p,
                                ip_is_vpn: e.target.checked,
                              }))
                            }
                            className="accent-foreground"
                          />
                          <span className="text-xs text-muted-foreground">
                            VPN
                          </span>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={addManualTransaction}
                      disabled={!manualTxInput.customer_name.trim()}
                      className="w-full border border-border hover:border-foreground/40 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed text-foreground text-xs py-2 transition-colors uppercase tracking-wider font-medium"
                    >
                      + Add Transaction
                    </button>

                    {manualTransactions.length > 0 && (
                      <div className="border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-accent text-muted-foreground uppercase tracking-wider">
                              <th className="px-3 py-2 text-left font-medium">
                                Name
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Payment
                              </th>
                              <th className="px-3 py-2 text-right font-medium">
                                Amount
                              </th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {manualTransactions.map((t, i) => (
                              <tr
                                key={i}
                                className="hover:bg-accent/50 transition-colors"
                              >
                                <td className="px-3 py-2 font-medium text-foreground truncate max-w-[90px]">
                                  {t.customer_name}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {t.card_brand} ·{" "}
                                  {t.payment_method.replace("_", " ")}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-foreground">
                                  {t.amount ? (
                                    `${t.currency} ${Number(t.amount).toLocaleString()}`
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <button
                                    onClick={() => removeManualTransaction(i)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      anomaliesLoading ||
                      (csvRows.length === 0 &&
                        manualTransactions.length === 0 &&
                        !csvOriginalFile)
                    }
                    onClick={handleRunAnalysis}
                  >
                    {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
                  </Button>
                  {(csvRows.length > 0 || manualTransactions.length > 0) && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={saveLogName}
                        onChange={(e) => setSaveLogName(e.target.value)}
                        placeholder="Name this log (optional)"
                        className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground transition-colors"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed"
                        disabled={csvSaveLoading}
                        onClick={handleSaveTransactionLog}
                      >
                        {csvSaveLoading ? "Saving..." : "Save transaction log"}
                      </Button>
                    </div>
                  )}
                  {csvSaveMessage && (
                    <p
                      className={`text-[11px] font-mono text-center ${csvSaveMessage.startsWith("Saved") ? "text-green-600" : "text-destructive"}`}
                    >
                      {csvSaveMessage}
                    </p>
                  )}
                </div>

                {/* Right: Flagged Transactions */}
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

              {/* Anomaly Report below */}
              <div className="border border-border bg-card">
                <div className="px-5 py-3 border-b border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                    Anomaly Report
                  </span>
                </div>
                <div className="p-6 space-y-8">
                  {/* Current session */}
                  {csvHeaders.length > 0 ||
                    manualTransactions.length > 0 ||
                    csvOriginalFile ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-muted-foreground font-mono">
                          {csvOriginalFile?.type === "application/pdf" ||
                            csvOriginalFile?.name.toLowerCase().endsWith(".pdf")
                            ? "1 PDF document"
                            : `${csvRows.length + (csvHeaders.length > 0 ? 0 : manualTransactions.length)} row${csvRows.length + manualTransactions.length !== 1 ? "s" : ""} — click any cell to edit`}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            disabled={
                              anomaliesLoading ||
                              (csvRows.length === 0 &&
                                manualTransactions.length === 0 &&
                                !csvOriginalFile)
                            }
                            onClick={handleRunAnalysis}
                          >
                            {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-dashed"
                            disabled={
                              csvSaveLoading ||
                              (csvRows.length === 0 &&
                                manualTransactions.length === 0)
                            }
                            onClick={handleSaveTransactionLog}
                          >
                            {csvSaveLoading
                              ? "Saving..."
                              : "Save transaction log"}
                          </Button>
                        </div>
                      </div>
                      {csvSaveMessage && (
                        <p
                          className={`text-[11px] font-mono ${csvSaveMessage.startsWith("Saved") ? "text-green-600" : "text-destructive"}`}
                        >
                          {csvSaveMessage}
                        </p>
                      )}
                      {csvHeaders.length > 0 && (
                        <CSVDataTable
                          headers={csvHeaders}
                          rows={csvRows}
                          onChange={setCsvRows}
                        />
                      )}
                      {anomaliesData && (
                        <ResultsTable type="anomalies" data={anomaliesData} />
                      )}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <AlertTriangle className="h-6 w-6 mx-auto mb-3 opacity-30" />
                      <p className="text-xs uppercase tracking-wider">
                        Upload a transaction CSV or PDF to get started.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── GEO & SANCTIONS TAB ─── */}
          {activeTab === "geosanctions" && (
            <div className="space-y-6">
              <div className="grid grid-cols-[1fr_2fr] gap-px bg-border">
                {/* Left: Input panel */}
                <div className="bg-card p-6 space-y-6">
                  {/* Sanctions input */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 border border-border flex items-center justify-center">
                        <Shield className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Sanctions Screener
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Entity CSV
                        </p>
                      </div>
                    </div>

                    <DropZone
                      hint="description, country"
                      onFile={(f) => {
                        setSanctionsFile(f);
                        setError(null);
                        f.text().then((text) =>
                          setUploadedSanctionsEntities(parseSanctionsCsv(text)),
                        );
                      }}
                      onRemove={() => {
                        setSanctionsFile(null);
                        setUploadedSanctionsEntities([]);
                        setSanctionsData(null);
                        setGeoRiskData(null);
                        setError(null);
                      }}
                      fileName={sanctionsFile?.name}
                    />

                    {uploadedSanctionsEntities.length > 0 && (
                      <div className="border border-border overflow-hidden">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-3 py-2 border-b border-border bg-accent/50">
                          From your file ({uploadedSanctionsEntities.length}{" "}
                          entities)
                        </p>
                        <div className="max-h-48 overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-accent text-muted-foreground uppercase tracking-wider">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">
                                  Entity
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  Country
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {uploadedSanctionsEntities.map((e, i) => (
                                <tr key={i} className="hover:bg-accent/30">
                                  <td className="px-3 py-2 font-medium text-foreground truncate max-w-[180px]">
                                    {e.description}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {e.country || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        or add individually
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <input
                          type="text"
                          value={manualInput.description}
                          onChange={(e) =>
                            setManualInput((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addManualEntity();
                          }}
                          placeholder="Entity name"
                          className="border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors min-w-0"
                        />
                        <input
                          type="text"
                          value={manualInput.country}
                          onChange={(e) =>
                            setManualInput((p) => ({
                              ...p,
                              country: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addManualEntity();
                          }}
                          placeholder="Country"
                          className="w-20 border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors"
                        />
                        <button
                          onClick={addManualEntity}
                          disabled={!manualInput.description.trim()}
                          className="h-8 w-8 border border-foreground bg-foreground text-background hover:bg-foreground/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                          title="Add entity"
                        >
                          <span className="text-base leading-none font-light">
                            +
                          </span>
                        </button>
                      </div>

                      {manualEntities.length > 0 && (
                        <div className="border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-accent text-muted-foreground uppercase tracking-wider">
                                <th className="px-3 py-2 text-left font-medium">
                                  Entity
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  Country
                                </th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {manualEntities.map((e, i) => (
                                <tr
                                  key={i}
                                  className="hover:bg-accent/50 transition-colors"
                                >
                                  <td className="px-3 py-2 font-medium text-foreground truncate max-w-[120px]">
                                    {e.description}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {e.country || (
                                      <span className="text-muted-foreground/40">
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      onClick={() => removeManualEntity(i)}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      sanctionsLoading ||
                      geoRiskLoading ||
                      (!sanctionsFile && manualEntities.length === 0)
                    }
                    onClick={handleSanctionsScan}
                  >
                    {sanctionsLoading || geoRiskLoading
                      ? "Scanning..."
                      : "Run Scan"}
                  </Button>

                  {(uploadedSanctionsEntities.length > 0 ||
                    manualEntities.length > 0) && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={saveEntityLogName}
                          onChange={(e) => setSaveEntityLogName(e.target.value)}
                          placeholder="Name this list (optional)"
                          className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground transition-colors"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-dashed"
                          disabled={entitySaveLoading}
                          onClick={handleSaveEntityList}
                        >
                          {entitySaveLoading ? "Saving..." : "Save entity list"}
                        </Button>
                      </div>
                    )}
                  {entitySaveMessage && (
                    <p
                      className={`text-[11px] font-mono text-center ${entitySaveMessage.startsWith("Saved") ? "text-green-600" : "text-destructive"}`}
                    >
                      {entitySaveMessage}
                    </p>
                  )}
                </div>

                {/* Right: Report */}
                <div className="bg-card p-6 space-y-6 overflow-auto">
                  {(uploadedSanctionsEntities.length > 0 ||
                    manualEntities.length > 0) && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-dashed"
                          disabled={entitySaveLoading}
                          onClick={handleSaveEntityList}
                        >
                          {entitySaveLoading ? "Saving..." : "Save entity list"}
                        </Button>
                      </div>
                    )}
                  {sanctionsData && (
                    <div>
                      <ResultsTable type="sanctions" data={sanctionsData} />
                    </div>
                  )}
                  {geoRiskData && (
                    <div>
                      <ResultsTable type="georisk" data={geoRiskData} />
                    </div>
                  )}
                  {!sanctionsData && !geoRiskData && (
                    <div className="py-16 text-center text-muted-foreground">
                      <Globe className="h-6 w-6 mx-auto mb-3 opacity-30" />
                      <p className="text-xs uppercase tracking-wider">
                        Add entities (with optional country) and run a scan.
                        Geopolitical risk is shown for countries in your list.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
