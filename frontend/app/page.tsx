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
import { AlertTriangle, Globe, Shield, Upload, Cuboid, Drama, Ship } from "lucide-react";
import Image from "next/image";

type SidebarTab = "overview" | "anomaly" | "geosanctions";

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
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`border border-border px-4 py-5 text-center cursor-pointer transition-all ${dragging ? "border-foreground bg-accent" : "hover:border-foreground/40"}`}
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
            <p className="text-xs font-medium text-foreground truncate font-mono">{fileName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Drop to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Drop CSV or click to browse</p>
            <p className="text-[11px] text-muted-foreground/60">{hint}</p>
          </div>
        )}
      </div>
      {fileName && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
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
  const [activeTab, setActiveTab] = useState<SidebarTab>("overview");

  const [sanctionsData, setSanctionsData] = useState<SanctionsResponse | null>(null);
  const [anomaliesData, setAnomaliesData] = useState<AnomaliesResponse | null>(null);
  const [geoRiskData, setGeoRiskData] = useState<GeoRiskResponse | null>(null);
  const [fraudScanData, setFraudScanData] = useState<FraudScanResponse | null>(null);
  const [fraudReportSummary, setFraudReportSummary] = useState<FraudReportSummary | null>(null);
  const [fraudScanLoading, setFraudScanLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFraudScanLoading(true);
    Promise.allSettled([scanFraud(), fetchFraudReportSummary()])
      .then(([scanResult, summaryResult]) => {
        if (cancelled) return;
        if (scanResult.status === "fulfilled") setFraudScanData(scanResult.value);
        if (summaryResult.status === "fulfilled") setFraudReportSummary(summaryResult.value);
      })
      .finally(() => { if (!cancelled) setFraudScanLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
    customer_name: string; timestamp: string; amount: string; currency: string;
    payment_method: string; card_brand: string; card_last4: string;
    ip_country: string; ip_is_vpn: boolean; device_type: string;
    cvv_match: boolean; address_match: boolean;
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
          customer_name: t.customer_name, timestamp: t.timestamp,
          amount: t.amount, currency: t.currency, payment_method: t.payment_method,
          card_last4: t.card_last4, card_brand: t.card_brand,
          ip_country: t.ip_country, ip_is_vpn: String(t.ip_is_vpn),
          device_type: t.device_type, cvv_match: String(t.cvv_match),
          address_match: String(t.address_match),
        })),
      ];
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
    if (!sanctionsFile && manualEntities.length === 0 && !geoCountries.trim()) return;
    setSanctionsLoading(true);
    setGeoRiskLoading(true);
    setError(null);

    // Run sanctions + geo risk in parallel
    const sanctionsPromise = (async () => {
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
      for (const e of manualEntities) allEntities.push(e);
      if (allEntities.length > 0) {
        const csvContent = "description,country\n" + allEntities.map((e) => `${e.description},${e.country}`).join("\n");
        const fileToScan = new File([csvContent], "entities.csv", { type: "text/csv" });
        return scanSanctions(fileToScan);
      }
      return null;
    })();

    const geoPromise = (async () => {
      const countries = geoCountries.split(",").map((c) => c.trim()).filter(Boolean);
      if (countries.length > 0) {
        return analyzeGeoRisk(countries);
      }
      return null;
    })();

    try {
      const [sanctionsResult, geoResult] = await Promise.allSettled([sanctionsPromise, geoPromise]);
      if (sanctionsResult.status === "fulfilled" && sanctionsResult.value) {
        setSanctionsData(sanctionsResult.value);
      }
      if (geoResult.status === "fulfilled" && geoResult.value) {
        setGeoRiskData(geoResult.value);
      }
      if (sanctionsResult.status === "rejected" || geoResult.status === "rejected") {
        setError("Some scans failed. Is the backend running?");
      }
    } catch {
      setError("Scan failed. Is the backend running?");
    } finally {
      setSanctionsLoading(false);
      setGeoRiskLoading(false);
    }
  }

  const sidebarItems: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "overview", icon: <Cuboid className="h-4 w-4" /> },
    { id: "anomaly", label: "anomaly detector", icon: <Drama className="h-4 w-4" /> },
    { id: "geosanctions", label: "geo & sanctions", icon: <Ship className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Floating header */}
      <header className="sticky top-0 z-50 flex items-center justify-between mx-4 mt-3 px-5 py-3 bg-gray-100/80 backdrop-blur-md border border-border font-heading">
        <div className="flex items-center gap-3">
          <Image src="/yosemite_logo.png" alt="yosemite logo" width={32} height={32} />
          <span className="text-[17px] font-semibold tracking-tight text-foreground">yosemite</span>
        </div>
        <div className="flex items-center gap-3">
          {(sanctionsData || anomaliesData || geoRiskData) && (
            <PDFExport sanctionsData={sanctionsData} anomaliesData={anomaliesData} geoRiskData={geoRiskData} />
          )}
          <div className="relative group">
            <button className="px-4 py-1.5 text-[10px]  tracking-wider border border-foreground/20 text-foreground hover:bg-foreground hover:text-background transition-colors">
              welcome back, Radiohead
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-53px)]">
        {/* Sidebar */}
        <aside className="w-56 flex flex-col justify-between p-4">
          <nav className="flex flex-col gap-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs tracking-wider transition-colors text-left border font-heading ${
                  activeTab === item.id
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
        <main className="flex-1 p-6 overflow-auto">
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
                <div className="bg-card p-8 flex items-center justify-center aspect-[4/3]">
                  {fraudScanLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse font-mono">Scanning...</p>
                  ) : (
                    <ProtectionScore score={protectionScore} />
                  )}
                </div>
                {/* Risk Overview */}
                <div className="bg-card p-6 flex flex-col aspect-[4/3]">
                  {fraudScanLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse font-mono">Analyzing...</p>
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
                      <p className="text-sm font-semibold text-foreground">Anomaly Detector</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Transaction CSV</p>
                    </div>
                  </div>

                  <DropZone
                    hint="date, vendor, amount"
                    onFile={handleAnomalyFile}
                    onRemove={() => { setCsvHeaders([]); setCsvRows([]); setCsvFileName(undefined); setAnomaliesData(null); setError(null); }}
                    fileName={csvFileName}
                  />

                  {csvRows.length > 0 && (
                    <p className="text-[11px] text-muted-foreground text-center font-mono">
                      {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} loaded
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or add individually</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Manual transaction form */}
                  <div className="space-y-2">
                    <div className="border border-border p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Customer Name</label>
                          <input type="text" value={manualTxInput.customer_name} onChange={(e) => setManualTxInput((p) => ({ ...p, customer_name: e.target.value }))} placeholder="Jane Doe" className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Date & Time</label>
                          <input type="datetime-local" value={manualTxInput.timestamp} onChange={(e) => setManualTxInput((p) => ({ ...p, timestamp: e.target.value }))} className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                          <input type="number" value={manualTxInput.amount} onChange={(e) => setManualTxInput((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Currency</label>
                          <select value={manualTxInput.currency} onChange={(e) => setManualTxInput((p) => ({ ...p, currency: e.target.value }))} className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors">
                            {["CAD", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Payment</label>
                          <select value={manualTxInput.payment_method} onChange={(e) => setManualTxInput((p) => ({ ...p, payment_method: e.target.value }))} className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors">
                            {["credit_card", "debit", "cash", "bank_transfer"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Card Brand</label>
                          <select value={manualTxInput.card_brand} onChange={(e) => setManualTxInput((p) => ({ ...p, card_brand: e.target.value }))} className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors">
                            {["Visa", "Mastercard", "Amex", "Discover"].map((b) => <option key={b}>{b}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Last 4</label>
                          <input type="text" maxLength={4} value={manualTxInput.card_last4} onChange={(e) => setManualTxInput((p) => ({ ...p, card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="0000" className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors font-mono" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">IP Country</label>
                          <input type="text" value={manualTxInput.ip_country} onChange={(e) => setManualTxInput((p) => ({ ...p, ip_country: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="CA" className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors uppercase" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Device</label>
                          <select value={manualTxInput.device_type} onChange={(e) => setManualTxInput((p) => ({ ...p, device_type: e.target.value }))} className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors">
                            {["desktop", "mobile", "tablet"].map((d) => <option key={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={manualTxInput.cvv_match} onChange={(e) => setManualTxInput((p) => ({ ...p, cvv_match: e.target.checked }))} className="accent-foreground" />
                          <span className="text-xs text-muted-foreground">CVV Match</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={manualTxInput.address_match} onChange={(e) => setManualTxInput((p) => ({ ...p, address_match: e.target.checked }))} className="accent-foreground" />
                          <span className="text-xs text-muted-foreground">Address Match</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={manualTxInput.ip_is_vpn} onChange={(e) => setManualTxInput((p) => ({ ...p, ip_is_vpn: e.target.checked }))} className="accent-foreground" />
                          <span className="text-xs text-muted-foreground">VPN</span>
                        </label>
                      </div>
                    </div>

                    <button onClick={addManualTransaction} disabled={!manualTxInput.customer_name.trim()} className="w-full border border-border hover:border-foreground/40 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed text-foreground text-xs py-2 transition-colors uppercase tracking-wider font-medium">
                      + Add Transaction
                    </button>

                    {manualTransactions.length > 0 && (
                      <div className="border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-accent text-muted-foreground uppercase tracking-wider">
                              <th className="px-3 py-2 text-left font-medium">Name</th>
                              <th className="px-3 py-2 text-left font-medium">Payment</th>
                              <th className="px-3 py-2 text-right font-medium">Amount</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {manualTransactions.map((t, i) => (
                              <tr key={i} className="hover:bg-accent/50 transition-colors">
                                <td className="px-3 py-2 font-medium text-foreground truncate max-w-[90px]">{t.customer_name}</td>
                                <td className="px-3 py-2 text-muted-foreground">{t.card_brand} · {t.payment_method.replace("_", " ")}</td>
                                <td className="px-3 py-2 text-right font-mono text-foreground">
                                  {t.amount ? `${t.currency} ${Number(t.amount).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <button onClick={() => removeManualTransaction(i)} className="text-muted-foreground hover:text-destructive transition-colors">✕</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <Button className="w-full" disabled={anomaliesLoading || (csvRows.length === 0 && manualTransactions.length === 0)} onClick={handleRunAnalysis}>
                    {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
                  </Button>
                </div>

                {/* Right: Flagged Transactions */}
                <div className="bg-card p-6 flex flex-col">
                  {fraudScanLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse font-mono">Loading...</p>
                  ) : (
                    <FlaggedTransactions results={fraudResults} />
                  )}
                </div>
              </div>

              {/* Anomaly Report below */}
              <div className="border border-border bg-card">
                <div className="px-5 py-3 border-b border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">Anomaly Report</span>
                </div>
                <div className="p-6">
                  {csvHeaders.length > 0 || manualTransactions.length > 0 ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-mono">
                          {csvRows.length + (csvHeaders.length > 0 ? 0 : manualTransactions.length)} row{(csvRows.length + manualTransactions.length) !== 1 ? "s" : ""} — click any cell to edit
                        </p>
                        <Button disabled={anomaliesLoading || (csvRows.length === 0 && manualTransactions.length === 0)} onClick={handleRunAnalysis}>
                          {anomaliesLoading ? "Analyzing..." : "Run Analysis"}
                        </Button>
                      </div>
                      {csvHeaders.length > 0 && <CSVDataTable headers={csvHeaders} rows={csvRows} onChange={setCsvRows} />}
                      {anomaliesData && <ResultsTable type="anomalies" data={anomaliesData} />}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <AlertTriangle className="h-6 w-6 mx-auto mb-3 opacity-30" />
                      <p className="text-xs uppercase tracking-wider">Upload a transaction CSV to get started.</p>
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
                        <p className="text-sm font-semibold text-foreground">Sanctions Screener</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entity CSV</p>
                      </div>
                    </div>

                    <DropZone
                      hint="description, country"
                      onFile={(f) => { setSanctionsFile(f); setError(null); }}
                      onRemove={() => { setSanctionsFile(null); setSanctionsData(null); setError(null); }}
                      fileName={sanctionsFile?.name}
                    />

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or add individually</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <input type="text" value={manualInput.description} onChange={(e) => setManualInput((p) => ({ ...p, description: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addManualEntity(); }} placeholder="Entity name" className="border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors min-w-0" />
                        <input type="text" value={manualInput.country} onChange={(e) => setManualInput((p) => ({ ...p, country: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addManualEntity(); }} placeholder="Country" className="w-20 border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground transition-colors" />
                        <button onClick={addManualEntity} disabled={!manualInput.description.trim()} className="h-8 w-8 border border-foreground bg-foreground text-background hover:bg-foreground/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors" title="Add entity">
                          <span className="text-base leading-none font-light">+</span>
                        </button>
                      </div>

                      {manualEntities.length > 0 && (
                        <div className="border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-accent text-muted-foreground uppercase tracking-wider">
                                <th className="px-3 py-2 text-left font-medium">Entity</th>
                                <th className="px-3 py-2 text-left font-medium">Country</th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {manualEntities.map((e, i) => (
                                <tr key={i} className="hover:bg-accent/50 transition-colors">
                                  <td className="px-3 py-2 font-medium text-foreground truncate max-w-[120px]">{e.description}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{e.country || <span className="text-muted-foreground/40">—</span>}</td>
                                  <td className="px-2 py-2 text-right">
                                    <button onClick={() => removeManualEntity(i)} className="text-muted-foreground hover:text-destructive transition-colors">✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Geo risk input */}
                  <div className="space-y-4">
                    <div className="h-px bg-border" />
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 border border-border flex items-center justify-center">
                        <Globe className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Geopolitical Monitor</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Country risk</p>
                      </div>
                    </div>

                    <textarea
                      value={geoCountries}
                      onChange={(e) => setGeoCountries(e.target.value)}
                      placeholder="Myanmar, Nigeria, Turkey"
                      rows={3}
                      className="w-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-foreground transition-colors"
                    />
                  </div>

                  <Button
                    className="w-full"
                    disabled={(sanctionsLoading && geoRiskLoading) || (!sanctionsFile && manualEntities.length === 0 && !geoCountries.trim())}
                    onClick={handleSanctionsScan}
                  >
                    {(sanctionsLoading || geoRiskLoading) ? "Scanning..." : "Run Scan"}
                  </Button>
                </div>

                {/* Right: Report */}
                <div className="bg-card p-6 space-y-6 overflow-auto">
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
                      <p className="text-xs uppercase tracking-wider">Add entities or countries and run a scan to see results here.</p>
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
