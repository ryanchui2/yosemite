"use client";

import { useRef, useState, useEffect } from "react";
import { ResultsTable } from "@/components/ResultsTable";
import { PDFExport } from "@/components/PDFExport";
import { CSVDataTable } from "@/components/CSVDataTable";
import { Button } from "@/components/ui/button";
import { ProtectionScore } from "@/components/ProtectionScore";
import { FlaggedTransactions } from "@/components/FlaggedTransactions";
import { RiskOverview } from "@/components/RiskOverview";
import { scanSanctions, scanAnomalies, analyzeGeoRisk, scanFraud, fetchFraudReportSummary } from "@/lib/api";
import type { SanctionsResponse, AnomaliesResponse, GeoRiskResponse, FraudScanResponse, FraudReportSummary } from "@/lib/api";
import { AlertTriangle, Globe, Shield, Upload } from "lucide-react";

type Report = "anomalies" | "sanctions" | "georisk";

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
}

function rowsToCSVFile(headers: string[], rows: Record<string, string>[]): File {
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => r[h] ?? "").join(",")),
  ];
  return new File([lines.join("\n")], "data.csv", { type: "text/csv" });
}

/** Compact drag-and-drop upload zone used inside the top cards */
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
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-3xl border-2 border-transparent px-4 py-6 text-center cursor-pointer transition-all duration-300 shadow-inner bg-background/50 ${dragging ? "ring-2 ring-primary/50 bg-primary/5" : "hover:bg-background/80"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
        {fileName ? (
          <div className="pr-4">
            <p className="text-xs font-medium text-gray-700 truncate">{fileName}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Drop to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-4 w-4 text-gray-400" />
            <p className="text-xs text-gray-500">Drop CSV or click to browse</p>
            <p className="text-[11px] text-gray-400">{hint}</p>
          </div>
        )}
      </div>
      {fileName && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-gray-400 transition-colors"
          title="Remove file"
        >
          <span className="text-[10px] font-bold leading-none">✕</span>
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [activeReport, setActiveReport] = useState<Report>("anomalies");

  const [sanctionsData, setSanctionsData] = useState<SanctionsResponse | null>(null);
  const [anomaliesData, setAnomaliesData] = useState<AnomaliesResponse | null>(null);
  const [geoRiskData, setGeoRiskData] = useState<GeoRiskResponse | null>(null);
  const [fraudScanData, setFraudScanData] = useState<FraudScanResponse | null>(null);
  const [fraudReportSummary, setFraudReportSummary] = useState<FraudReportSummary | null>(null);
  const [fraudScanLoading, setFraudScanLoading] = useState(true);

  // Auto-fetch fraud scan on mount for the fraud detection dashboard
  useEffect(() => {
    let cancelled = false;

    setFraudScanLoading(true);

    Promise.allSettled([scanFraud(), fetchFraudReportSummary()])
      .then(([scanResult, summaryResult]) => {
        if (cancelled) return;

        if (scanResult.status === "fulfilled") {
          setFraudScanData(scanResult.value);
        }

        if (summaryResult.status === "fulfilled") {
          setFraudReportSummary(summaryResult.value);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFraudScanLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive protection score from scan data
  const fraudResults = fraudScanData?.results ?? [];
  const totalScanned = fraudScanData?.total_scanned ?? 0;
  const protectionScore = totalScanned === 0
    ? 100
    : Math.round(Math.max(0, 100 - (fraudScanData!.flagged / totalScanned) * 100));

  const [sanctionsLoading, setSanctionsLoading] = useState(false);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [geoRiskLoading, setGeoRiskLoading] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | undefined>();

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
    customer_name: "", timestamp: "", amount: "", currency: "CAD",
    payment_method: "credit_card", card_brand: "Visa", card_last4: "",
    ip_country: "", ip_is_vpn: false, device_type: "desktop",
    cvv_match: true, address_match: true,
  };
  const [manualTransactions, setManualTransactions] = useState<ManualTx[]>([]);
  const [manualTxInput, setManualTxInput] = useState<ManualTx>(emptyTx);

  const [sanctionsFile, setSanctionsFile] = useState<File | null>(null);
  const [manualEntities, setManualEntities] = useState<{ description: string; country: string }[]>([]);
  const [manualInput, setManualInput] = useState({ description: "", country: "" });

  const [geoCountries, setGeoCountries] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAnomalyFile(file: File) {
    file.text().then((text) => {
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvFileName(file.name);
      setAnomaliesData(null);
      setError(null);
      setActiveReport("anomalies");
    });
  }

  function addManualTransaction() {
    if (!manualTxInput.customer_name.trim()) return;
    setManualTransactions((prev) => [...prev, {
      ...manualTxInput,
      timestamp: manualTxInput.timestamp || new Date().toISOString().replace("T", " ").slice(0, 19),
    }]);
    setManualTxInput(emptyTx);
  }

  function removeManualTransaction(index: number) {
    setManualTransactions((prev) => prev.filter((_, i) => i !== index));
  }

  function addManualEntity() {
    const description = manualInput.description.trim();
    if (!description) return;
    setManualEntities((prev) => [...prev, { description, country: manualInput.country.trim() }]);
    setManualInput({ description: "", country: "" });
  }

  function removeManualEntity(index: number) {
    setManualEntities((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleRunAnalysis() {
    if (!csvRows.length && !manualTransactions.length) return;
    setAnomaliesLoading(true);
    setError(null);
    try {
      const TX_HEADERS = [
        "transaction_id", "customer_name", "timestamp", "amount", "currency",
        "payment_method", "card_last4", "card_brand", "ip_country", "ip_is_vpn",
        "device_type", "cvv_match", "address_match",
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
      // Sync merged data into table state so the report renders with all rows
      setCsvHeaders(headers);
      setCsvRows(allRows);
      const file = rowsToCSVFile(headers, allRows);
      const data = await scanAnomalies(file);
      setAnomaliesData(data);
    } catch {
      setError("Anomaly scan failed. Is the backend running?");
    } finally {
      setAnomaliesLoading(false);
    }
  }

  async function handleSanctionsScan() {
    if (!sanctionsFile && manualEntities.length === 0) return;
    setSanctionsLoading(true);
    setError(null);
    try {
      // Collect entities from uploaded CSV (if any)
      const allEntities: { description: string; country: string }[] = [];
      if (sanctionsFile) {
        const text = await sanctionsFile.text();
        const lines = text.trim().split(/\r?\n/);
        const hdrs = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
        const descIdx = hdrs.indexOf("description");
        const countryIdx = hdrs.indexOf("country");
        if (descIdx !== -1) {
          for (const line of lines.slice(1)) {
            const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
            const desc = vals[descIdx];
            if (desc) allEntities.push({ description: desc, country: vals[countryIdx] ?? "" });
          }
        }
      }
      // Append manually entered entities
      for (const e of manualEntities) allEntities.push(e);

      const csvContent =
        "description,country\n" +
        allEntities.map((e) => `${e.description},${e.country}`).join("\n");
      const fileToScan = new File([csvContent], "entities.csv", { type: "text/csv" });
      const data = await scanSanctions(fileToScan);
      setSanctionsData(data);
      setActiveReport("sanctions");
    } catch (err) {
      setError("Sanctions scan failed: " + String(err));
    } finally {
      setSanctionsLoading(false);
    }
  }

  async function handleGeoRisk() {
    const countries = geoCountries.split(",").map((c) => c.trim()).filter(Boolean);
    if (!countries.length) return;
    setGeoRiskLoading(true);
    setError(null);
    try {
      const data = await analyzeGeoRisk(countries);
      setGeoRiskData(data);
      setActiveReport("georisk");
    } catch {
      setError("Geo risk analysis failed. Is the backend running?");
    } finally {
      setGeoRiskLoading(false);
    }
  }

  const reportTabs: { id: Report; label: string }[] = [
    { id: "anomalies", label: "Anomaly Report" },
    { id: "sanctions", label: "Sanctions Report" },
    { id: "georisk", label: "Geo Risk Report" },
  ];

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-2 mb-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">yosemite</h1>
        </div>
        {(sanctionsData || anomaliesData || geoRiskData) && (
          <PDFExport sanctionsData={sanctionsData} anomaliesData={anomaliesData} geoRiskData={geoRiskData} />
        )}
      </header>

      {/* ── Fraud Detection Section ───────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-3">
          Fraud Detection
        </h2>
        <div className="grid grid-cols-3 gap-5">

          {/* Box 1: Protection Score */}
          <div className="bg-card rounded-[2rem] p-6 shadow-card-soft border border-white/50 aspect-square flex items-center justify-center">
            {fraudScanLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">Scanning…</p>
            ) : (
              <ProtectionScore score={protectionScore} />
            )}
          </div>

          {/* Box 2: Flagged Transactions */}
          <div className="bg-card rounded-[2rem] p-6 shadow-card-soft border border-white/50 aspect-square flex flex-col">
            {fraudScanLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
            ) : (
              <FlaggedTransactions results={fraudResults} />
            )}
          </div>

          {/* Box 3: Risk Overview */}
          <div className="bg-card rounded-[2rem] p-6 shadow-card-soft border border-white/50 aspect-square flex flex-col">
            {fraudScanLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">Analyzing…</p>
            ) : (
              <RiskOverview
                results={fraudResults}
                totalScanned={totalScanned}
                summary={fraudReportSummary}
              />
            )}
          </div>

        </div>
      </section>

      {error && (
        <div className="rounded-2xl p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Row 1: three action cards */}
      <div className="grid grid-cols-3 gap-4">

        {/* Card 1: Anomaly Detector */}
        <div className="bg-card rounded-[2rem] p-6 shadow-card-soft space-y-5 border border-white/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-100 shadow-inner flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-500 drop-shadow-sm" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Anomaly Detector</p>
              <p className="text-xs text-muted-foreground">Transaction CSV</p>
            </div>
          </div>

          <DropZone
            hint="date, vendor, amount"
            onFile={handleAnomalyFile}
            onRemove={() => { setCsvHeaders([]); setCsvRows([]); setCsvFileName(undefined); setAnomaliesData(null); setError(null); }}
            fileName={csvFileName}
          />

          {csvRows.length > 0 && (
            <p className="text-[11px] text-gray-400 text-center">
              {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} loaded — edit in report below
            </p>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400">or add individually</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Manual transaction form */}
          <div className="space-y-2">
            <div className="rounded-2xl bg-background/50 shadow-inner p-3 space-y-2">
              {/* Row 1: Customer Name + Date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Customer Name</label>
                  <input
                    type="text"
                    value={manualTxInput.customer_name}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, customer_name: e.target.value }))}
                    placeholder="Jane Doe"
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={manualTxInput.timestamp}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, timestamp: e.target.value }))}
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  />
                </div>
              </div>

              {/* Row 2: Amount + Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Amount</label>
                  <input
                    type="number"
                    value={manualTxInput.amount}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Currency</label>
                  <select
                    value={manualTxInput.currency}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, currency: e.target.value }))}
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  >
                    {["CAD", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Payment Method + Card Brand + Last 4 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Payment</label>
                  <select
                    value={manualTxInput.payment_method}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, payment_method: e.target.value }))}
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  >
                    {["credit_card", "debit", "cash", "bank_transfer"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Card Brand</label>
                  <select
                    value={manualTxInput.card_brand}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, card_brand: e.target.value }))}
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  >
                    {["Visa", "Mastercard", "Amex", "Discover"].map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Last 4</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={manualTxInput.card_last4}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="0000"
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Row 4: IP Country + Device Type */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">IP Country</label>
                  <input
                    type="text"
                    value={manualTxInput.ip_country}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, ip_country: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="CA"
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Device</label>
                  <select
                    value={manualTxInput.device_type}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, device_type: e.target.value }))}
                    className="w-full rounded-lg border-none bg-white/80 shadow-sm px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all"
                  >
                    {["desktop", "mobile", "tablet"].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 5: Flags */}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualTxInput.cvv_match}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, cvv_match: e.target.checked }))}
                    className="rounded accent-orange-500"
                  />
                  <span className="text-xs text-gray-600">CVV Match</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualTxInput.address_match}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, address_match: e.target.checked }))}
                    className="rounded accent-orange-500"
                  />
                  <span className="text-xs text-gray-600">Address Match</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualTxInput.ip_is_vpn}
                    onChange={(e) => setManualTxInput((p) => ({ ...p, ip_is_vpn: e.target.checked }))}
                    className="rounded accent-orange-500"
                  />
                  <span className="text-xs text-gray-600">VPN</span>
                </label>
              </div>
            </div>

            <button
              onClick={addManualTransaction}
              disabled={!manualTxInput.customer_name.trim()}
              className="w-full rounded-xl bg-orange-100 hover:bg-orange-200 disabled:opacity-40 disabled:cursor-not-allowed text-orange-700 font-medium text-xs py-2 transition-colors"
            >
              + Add Transaction
            </button>

            {manualTransactions.length > 0 && (
              <div className="rounded-2xl overflow-hidden border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Payment</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {manualTransactions.map((t, i) => (
                      <tr key={i} className="bg-white hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[90px]">{t.customer_name}</td>
                        <td className="px-3 py-2 text-gray-500">{t.card_brand} · {t.payment_method.replace("_", " ")}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">
                          {t.amount ? `${t.currency} ${Number(t.amount).toLocaleString()}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => removeManualTransaction(i)} className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Button
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm"
            disabled={anomaliesLoading || (csvRows.length === 0 && manualTransactions.length === 0)}
            onClick={() => { setActiveReport("anomalies"); handleRunAnalysis(); }}
          >
            {anomaliesLoading ? "Analyzing…" : "Run Analysis"}
          </Button>
        </div>

        {/* Card 2: Sanctions Screener */}
        <div className="bg-card rounded-[2rem] p-6 shadow-card-soft space-y-5 border border-white/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-100 shadow-inner flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-500 drop-shadow-sm" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Sanctions Screener</p>
              <p className="text-xs text-muted-foreground">Entity CSV</p>
            </div>
          </div>

          <DropZone
            hint="description, country"
            onFile={(f) => { setSanctionsFile(f); setError(null); }}
            onRemove={() => { setSanctionsFile(null); setSanctionsData(null); setError(null); }}
            fileName={sanctionsFile?.name}
          />

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400">or add individually</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Manual entity entry */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <input
                type="text"
                value={manualInput.description}
                onChange={(e) => setManualInput((p) => ({ ...p, description: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addManualEntity(); }}
                placeholder="Entity name"
                className="rounded-xl border-none bg-background/50 shadow-inner px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-w-0"
              />
              <input
                type="text"
                value={manualInput.country}
                onChange={(e) => setManualInput((p) => ({ ...p, country: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addManualEntity(); }}
                placeholder="Country"
                className="w-20 rounded-xl border-none bg-background/50 shadow-inner px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <button
                onClick={addManualEntity}
                disabled={!manualInput.description.trim()}
                className="h-8 w-8 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-sm"
                title="Add entity"
              >
                <span className="text-white text-base leading-none font-light">+</span>
              </button>
            </div>

            {manualEntities.length > 0 && (
              <div className="rounded-2xl overflow-hidden border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">Entity</th>
                      <th className="px-3 py-2 text-left font-medium">Country</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {manualEntities.map((e, i) => (
                      <tr key={i} className="bg-white hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[120px]">{e.description}</td>
                        <td className="px-3 py-2 text-gray-500">{e.country || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => removeManualEntity(i)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
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
            className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm"
            disabled={sanctionsLoading || (!sanctionsFile && manualEntities.length === 0)}
            onClick={handleSanctionsScan}
          >
            {sanctionsLoading ? "Scanning…" : "Scan Entities"}
          </Button>
        </div>

        {/* Card 3: Geopolitical Monitor */}
        <div className="bg-card rounded-[2rem] p-6 shadow-card-soft space-y-5 border border-white/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-purple-100 shadow-inner flex items-center justify-center">
              <Globe className="h-5 w-5 text-purple-500 drop-shadow-sm" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Geopolitical Monitor</p>
              <p className="text-xs text-muted-foreground">Country risk</p>
            </div>
          </div>

          <textarea
            value={geoCountries}
            onChange={(e) => setGeoCountries(e.target.value)}
            placeholder="Myanmar, Nigeria, Turkey"
            rows={3}
            className="w-full rounded-2xl border-none bg-background/50 shadow-inner px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />

          <Button
            className="w-full rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm"
            disabled={geoRiskLoading || !geoCountries.trim()}
            onClick={handleGeoRisk}
          >
            {geoRiskLoading ? "Analyzing…" : "Analyze Risk"}
          </Button>
        </div>
      </div>

      {/* Row 2: Report card */}
      <div className="bg-card rounded-[2rem] shadow-card-soft overflow-hidden border border-white/50 mt-8">
        {/* Report tab bar */}
        <div className="flex items-center gap-1 px-5 pt-4 border-b border-gray-100">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${activeReport === tab.id
                ? "text-gray-900 border-b-2 border-gray-900"
                : "text-gray-400 hover:text-gray-600"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Anomaly report */}
          {activeReport === "anomalies" && (
            <div className="space-y-5">
              {csvHeaders.length > 0 || manualTransactions.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {csvRows.length + (csvHeaders.length > 0 ? 0 : manualTransactions.length)} row{(csvRows.length + manualTransactions.length) !== 1 ? "s" : ""} — click any cell to edit
                    </p>
                    <Button
                      className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm"
                      disabled={anomaliesLoading || (csvRows.length === 0 && manualTransactions.length === 0)}
                      onClick={handleRunAnalysis}
                    >
                      {anomaliesLoading ? "Analyzing…" : "Run Analysis"}
                    </Button>
                  </div>
                  {csvHeaders.length > 0 && <CSVDataTable headers={csvHeaders} rows={csvRows} onChange={setCsvRows} />}
                  {anomaliesData && <ResultsTable type="anomalies" data={anomaliesData} />}
                </>
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Upload a transaction CSV in the Anomaly Detector card to get started.</p>
                </div>
              )}
            </div>
          )}

          {/* Sanctions report */}
          {activeReport === "sanctions" && (
            <div>
              {sanctionsData ? (
                <ResultsTable type="sanctions" data={sanctionsData} />
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <Shield className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Upload an entity CSV and run a scan to see results here.</p>
                </div>
              )}
            </div>
          )}

          {/* Geo risk report */}
          {activeReport === "georisk" && (
            <div>
              {geoRiskData ? (
                <ResultsTable type="georisk" data={geoRiskData} />
              ) : (
                <div className="py-16 text-center text-gray-400">
                  <Globe className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Enter countries in the Geopolitical Monitor card and analyze to see results here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
