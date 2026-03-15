"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PDFExport } from "@/components/PDFExport";
import {
  scanSanctions,
  scanAnomalies,
  analyzeGeoRisk,
  fetchCachedFraudScan,
  fetchFraudReportSummary,
  fetchStats,
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
  FraudResult,
  AgentScanReport,
  SavedCsvData,
  AnomalyResult,
  SavedEntityData,
  StatsResponse,
} from "@/lib/api";
import { parseCSV, rowsToCSVFile, parseSanctionsCsv } from "@/lib/csv";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { TransactionsTab } from "@/components/dashboard/TransactionsTab";
import { AnomalyTab, emptyManualTx } from "@/components/dashboard/AnomalyTab";
import type { ManualTx } from "@/components/dashboard/AnomalyTab";
import { EntityTab } from "@/components/dashboard/EntityTab";
import { GeoSanctionsTab } from "@/components/dashboard/GeoSanctionsTab";
import { AIFraudTab } from "@/components/dashboard/AIFraudTab";
import { AlertTriangle, Cuboid, ListOrdered, LogOut, Shield, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";

type SidebarTab = "overview" | "transactions" | "anomaly" | "entity" | "geosanctions" | "aifraud";

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
    setStatsLoading(true);
    Promise.allSettled([
      fetchCachedFraudScan(),
      fetchFraudReportSummary(),
      fetchStats(),
    ])
      .then(([scanResult, summaryResult, statsResult]) => {
        if (cancelled) return;
        if (scanResult.status === "fulfilled")
          setFraudScanData(scanResult.value);
        if (summaryResult.status === "fulfilled")
          setFraudReportSummary(summaryResult.value);
        if (statsResult.status === "fulfilled")
          setStatsData(statsResult.value);
      })
      .finally(() => {
        if (!cancelled) {
          setFraudScanLoading(false);
          setStatsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch stats when user switches to Overview so total volume, transactions, top vendors are current
  const prevTabRef = useRef<SidebarTab | null>(null);
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (prev !== null && activeTab === "overview") {
      fetchStats().then(setStatsData).catch(() => { });
    }
  }, [activeTab]);

  const fraudResults = fraudScanData?.results ?? [];
  const totalScanned = fraudScanData?.total_scanned ?? 0;

  /** Map anomaly results (HIGH/MEDIUM) to FraudResult shape for Overview display. */
  function anomalyResultsToFraudResults(anomalies: AnomaliesResponse): {
    results: import("@/lib/api").FraudResult[];
    totalScanned: number;
  } {
    const flagged = anomalies.results.filter(
      (r) => r.risk_level === "HIGH" || r.risk_level === "MEDIUM",
    );
    const results: FraudResult[] = flagged.map((r) => ({
      transaction_id: `row-${r.row_index}`,
      customer_name: r.vendor || null,
      amount: r.amount ?? null,
      risk_score: Math.min(100, Math.round(r.anomaly_score * 100)),
      risk_level: r.risk_level,
      triggered_rules: r.reasons ?? [],
      ai_explanation: r.ai_explanation || null,
      anomaly_score: r.anomaly_score,
    }));
    return { results, totalScanned: anomalies.total_transactions };
  }

  /** Build a FraudReportSummary from the full AI fraud report for Overview. */
  function summaryFromAgentReport(report: AgentScanReport): FraudReportSummary {
    return {
      report_count: report.anomalous_transaction_ids.length,
      ai_generated: true,
      common_vulnerabilities: [report.summary],
      potential_reasons: report.recommendations.length > 0 ? report.recommendations.slice(0, 2) : ["See summary and recommendations."],
      improvement_advice: report.recommendations,
      disclaimer: "Based on the latest full AI fraud analysis run.",
    };
  }

  // Overview display: prefer in-session scan data so the Overview updates when user runs scans
  const displaySource = agentScanReport
    ? "agent"
    : anomaliesData
      ? "anomaly"
      : "cached";
  const displayFraudResults =
    displaySource === "agent"
      ? [] // Risk Overview will use summary from report
      : displaySource === "anomaly" && anomaliesData
        ? anomalyResultsToFraudResults(anomaliesData).results
        : fraudResults;
  const displayTotalScanned =
    displaySource === "agent" && agentScanReport
      ? agentScanReport.anomalous_transaction_ids.length
      : displaySource === "anomaly" && anomaliesData
        ? anomaliesData.total_transactions
        : totalScanned;
  const displayFraudReportSummary: FraudReportSummary | null =
    displaySource === "agent" && agentScanReport
      ? summaryFromAgentReport(agentScanReport)
      : displaySource === "anomaly"
        ? null // RiskOverview will use buildFallbackSummary from display results
        : fraudReportSummary;

  async function handleRunAgentScan() {
    setAgentScanLoading(true);
    setError(null);
    setAgentScanReport(null);
    try {
      // Use current anomaly/CSV data when available so analysis runs on what the user is viewing.
      const allRows: Record<string, string>[] = [
        ...csvRows,
        ...manualTransactions.map((t) => ({
          transaction_id: crypto.randomUUID(),
          customer_name: t.customer_name,
          timestamp: t.timestamp,
          amount: t.amount,
          currency: t.currency ?? "",
          payment_method: t.payment_method ?? "",
          card_last4: t.card_last4 ?? "",
          card_brand: t.card_brand ?? "",
          ip_country: t.ip_country ?? "",
          ip_is_vpn: String(t.ip_is_vpn ?? false),
          device_type: t.device_type ?? "",
          cvv_match: String(t.cvv_match ?? false),
          address_match: String(t.address_match ?? false),
        })),
      ];
      let payload: Array<{
        transaction_id: string;
        order_id?: string | null;
        customer_id?: string | null;
        amount?: number | null;
        cvv_match?: boolean | null;
        address_match?: boolean | null;
        ip_is_vpn?: boolean | null;
        card_present?: boolean | null;
        timestamp?: string | null;
      }>;
      if (allRows.length > 0) {
        payload = allRows.map((row, i) => {
          const amt = row.amount != null && row.amount !== "" ? parseFloat(row.amount) : null;
          return {
            transaction_id: row.transaction_id ?? row.id ?? `TXN-${i + 1}`,
            order_id: row.order_id ?? null,
            customer_id: row.customer_id ?? row.customer_name ?? null,
            amount: amt != null && !Number.isNaN(amt) ? amt : null,
            cvv_match: row.cvv_match === "true" ? true : row.cvv_match === "false" ? false : null,
            address_match: row.address_match === "true" ? true : row.address_match === "false" ? false : null,
            ip_is_vpn: row.ip_is_vpn === "true" ? true : row.ip_is_vpn === "false" ? false : null,
            card_present: row.card_present === "true" ? true : row.card_present === "false" ? false : null,
            timestamp: row.timestamp ?? null,
          };
        });
      } else {
        const transactions = await fetchTransactions({ limit: 500 });
        if (transactions.length === 0) {
          setError("No transactions in the database. Add transactions first.");
          return;
        }
        payload = transactions.map((t) => ({
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
      }
      if (payload.length === 0) {
        setError("No transactions to analyze. Add transactions or upload a CSV in the Anomaly tab.");
        return;
      }
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
        docOptions = { document_base64: base64, mime_type: agentScanDocument.type || "application/octet-stream" };
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

  const [manualTransactions, setManualTransactions] = useState<ManualTx[]>([]);
  const [manualTxInput, setManualTxInput] = useState<ManualTx>(emptyManualTx);

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

  const [statsData, setStatsData] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
        // #region agent log
        const amountKey = newHeaders.find((h) => h.toLowerCase() === "amount");
        const parsedAmounts = amountKey
          ? newRows.map((r) => r[amountKey]).filter(Boolean).map((s) => Number(s))
          : [];
        const validAmounts = parsedAmounts.filter((n) => !Number.isNaN(n));
        const maxParsed = validAmounts.length ? Math.max(...validAmounts) : null;
        fetch("http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "page.tsx:handleAnomalyFile",
            message: "CSV parsed after drop",
            hypothesisId: ["anomaly_amount"],
            data: {
              rowCount: newRows.length,
              amountKey: amountKey ?? null,
              sampleAmounts: validAmounts.slice(0, 5),
              maxParsedAmount: maxParsed,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => { });
        // #endregion
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
    setManualTxInput(emptyManualTx);
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
    // #region agent log
    const manualAmounts = manualTransactions.map((t) => t.amount).filter(Boolean).map((s) => Number(s));
    const validManualAmounts = manualAmounts.filter((n) => !Number.isNaN(n));
    const allAmounts = allRows.map((r) => r.amount).filter(Boolean).map((s) => Number(s));
    const validAllAmounts = allAmounts.filter((n) => !Number.isNaN(n));
    fetch("http://127.0.0.1:7242/ingest/a3ba57d6-4434-4c97-9efb-bd3955e640d5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "page.tsx:handleRunAnalysis",
        message: "payload built for pipeline (CSV + add transaction)",
        hypothesisId: ["anomaly_amount", "manual_tx"],
        data: {
          csvRowCount: csvRows.length,
          manualTransactionCount: manualTransactions.length,
          totalRows,
          manualAmountsSample: validManualAmounts.slice(0, 5),
          maxManualAmount: validManualAmounts.length ? Math.max(...validManualAmounts) : null,
          maxAmountInPayload: validAllAmounts.length ? Math.max(...validAllAmounts) : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => { });
    // #endregion
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

      // Refetch stats immediately so Overview shows correct total volume, transactions, top vendors (pipeline wrote to DB)
      fetchStats().then(setStatsData).catch(() => { });

      // Persist scan so it loads on next visit; refetch stats again so Overview "Last fraud scan" updates
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
      })
        .then(() => fetchStats().then(setStatsData).catch(() => { }))
        .catch(() => { });
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
      // Refetch overview stats so they reflect the transactions we just saved to the DB
      fetchStats().then(setStatsData).catch(() => { });
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
    const allEntities = getCurrentEntities();
    if (allEntities.length === 0) return;
    setSanctionsLoading(true);
    setGeoRiskLoading(true);
    setError(null);

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
      { id: "transactions", label: "transactions", icon: <ListOrdered className="h-4 w-4" /> },
      {
        id: "anomaly",
        label: "anomaly detector",
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      { id: "entity", label: "entity", icon: <Users className="h-4 w-4" /> },
      {
        id: "geosanctions",
        label: "geo & sanctions",
        icon: <Shield className="h-4 w-4" />,
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

          {activeTab === "overview" && (
            <OverviewTab
              fraudScanLoading={fraudScanLoading}
              protectionScore={protectionScore}
              fraudResults={displayFraudResults}
              totalScanned={displayTotalScanned}
              fraudReportSummary={displayFraudReportSummary}
              stats={statsData}
              statsLoading={statsLoading}
              onRunScan={() => setActiveTab("aifraud")}
            />
          )}

          {activeTab === "transactions" && (
            <TransactionsTab
              csvFileName={csvFileName}
              onAnomalyFile={handleAnomalyFile}
              onRemoveFile={() => {
                setCsvFileName(undefined);
                setCsvOriginalFile(null);
              }}
              csvRowsLength={csvRows.length}
              manualTxInput={manualTxInput}
              setManualTxInput={setManualTxInput}
              onAddManualTransaction={addManualTransaction}
              onRemoveManualTransaction={removeManualTransaction}
              manualTransactions={manualTransactions}
              saveLogName={saveLogName}
              setSaveLogName={setSaveLogName}
              csvSaveLoading={csvSaveLoading}
              onSaveTransactionLog={handleSaveTransactionLog}
              csvSaveMessage={csvSaveMessage}
              csvHeaders={csvHeaders}
              csvRows={csvRows}
              setCsvRows={setCsvRows}
              csvOriginalFile={csvOriginalFile}
            />
          )}

          {activeTab === "aifraud" && (
            <AIFraudTab
              agentScanDocument={agentScanDocument}
              setAgentScanDocument={setAgentScanDocument}
              agentScanLoading={agentScanLoading}
              onRunAgentScan={handleRunAgentScan}
              agentScanReport={agentScanReport}
            />
          )}

          {activeTab === "anomaly" && (
            <AnomalyTab
              hasData={
                csvRows.length > 0 ||
                manualTransactions.length > 0 ||
                !!csvOriginalFile
              }
              onRunAnalysis={handleRunAnalysis}
              anomaliesLoading={anomaliesLoading}
              fraudScanLoading={fraudScanLoading}
              fraudResults={displayFraudResults}
              anomaliesData={anomaliesData}
              rowCount={
                csvHeaders.length > 0
                  ? csvRows.length
                  : csvRows.length + manualTransactions.length
              }
              csvOriginalFile={csvOriginalFile}
            />
          )}

          {activeTab === "entity" && (
            <EntityTab
              entityFileName={sanctionsFile?.name}
              onFile={(f) => {
                setSanctionsFile(f);
                setError(null);
                f.text().then((text) =>
                  setUploadedSanctionsEntities(parseSanctionsCsv(text)),
                );
              }}
              onRemoveFile={() => {
                setSanctionsFile(null);
                setUploadedSanctionsEntities([]);
                setSanctionsData(null);
                setGeoRiskData(null);
                setError(null);
              }}
              uploadedEntities={uploadedSanctionsEntities}
              manualInput={manualInput}
              setManualInput={setManualInput}
              onAddEntity={addManualEntity}
              onRemoveEntity={removeManualEntity}
              manualEntities={manualEntities}
              saveEntityLogName={saveEntityLogName}
              setSaveEntityLogName={setSaveEntityLogName}
              entitySaveLoading={entitySaveLoading}
              onSaveEntityList={handleSaveEntityList}
              entitySaveMessage={entitySaveMessage}
            />
          )}

          {activeTab === "geosanctions" && (
            <GeoSanctionsTab
              hasEntities={
                uploadedSanctionsEntities.length > 0 || manualEntities.length > 0
              }
              entityCount={
                uploadedSanctionsEntities.length + manualEntities.length
              }
              onRunScan={handleSanctionsScan}
              sanctionsLoading={sanctionsLoading}
              geoRiskLoading={geoRiskLoading}
              sanctionsData={sanctionsData}
              geoRiskData={geoRiskData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
