"use client";

import { useRef, useState } from "react";
import { ResultsTable } from "@/components/ResultsTable";
import { PDFExport } from "@/components/PDFExport";
import { CSVDataTable } from "@/components/CSVDataTable";
import { Button } from "@/components/ui/button";
import { scanSanctions, scanAnomalies, analyzeGeoRisk } from "@/lib/api";
import type { SanctionsResponse, AnomaliesResponse, GeoRiskResponse } from "@/lib/api";
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
        className={`rounded-2xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
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

  const [sanctionsLoading, setSanctionsLoading] = useState(false);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [geoRiskLoading, setGeoRiskLoading] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | undefined>();

  const [sanctionsFile, setSanctionsFile] = useState<File | null>(null);

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

  async function handleRunAnalysis() {
    if (!csvHeaders.length || !csvRows.length) return;
    setAnomaliesLoading(true);
    setError(null);
    try {
      const file = rowsToCSVFile(csvHeaders, csvRows);
      const data = await scanAnomalies(file);
      setAnomaliesData(data);
    } catch {
      setError("Anomaly scan failed. Is the backend running?");
    } finally {
      setAnomaliesLoading(false);
    }
  }

  async function handleSanctionsScan() {
    if (!sanctionsFile) return;
    setSanctionsLoading(true);
    setError(null);
    try {
      const data = await scanSanctions(sanctionsFile);
      setSanctionsData(data);
      setActiveReport("sanctions");
    } catch {
      setError("Sanctions scan failed. Is the backend running?");
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
    <div className="min-h-screen bg-gray-100 p-6 space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">ARRT</h1>
          <p className="text-xs text-gray-500">Compliance Intelligence</p>
        </div>
        {(sanctionsData || anomaliesData || geoRiskData) && (
          <PDFExport sanctionsData={sanctionsData} anomaliesData={anomaliesData} geoRiskData={geoRiskData} />
        )}
      </header>

      {error && (
        <div className="rounded-2xl p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Row 1: three action cards */}
      <div className="grid grid-cols-3 gap-4">

        {/* Card 1: Anomaly Detector */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Anomaly Detector</p>
              <p className="text-[11px] text-gray-400">Transaction CSV</p>
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

          <Button
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm"
            disabled={anomaliesLoading || csvRows.length === 0}
            onClick={() => { setActiveReport("anomalies"); handleRunAnalysis(); }}
          >
            {anomaliesLoading ? "Analyzing…" : "Run Analysis"}
          </Button>
        </div>

        {/* Card 2: Sanctions Screener */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <Shield className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Sanctions Screener</p>
              <p className="text-[11px] text-gray-400">Entity CSV</p>
            </div>
          </div>

          <DropZone
            hint="name, country, registration_number"
            onFile={(f) => { setSanctionsFile(f); setError(null); }}
            onRemove={() => { setSanctionsFile(null); setSanctionsData(null); setError(null); }}
            fileName={sanctionsFile?.name}
          />

          <Button
            className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm"
            disabled={sanctionsLoading || !sanctionsFile}
            onClick={handleSanctionsScan}
          >
            {sanctionsLoading ? "Scanning…" : "Scan Entities"}
          </Button>
        </div>

        {/* Card 3: Geopolitical Monitor */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-purple-100 flex items-center justify-center">
              <Globe className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Geopolitical Monitor</p>
              <p className="text-[11px] text-gray-400">Country risk</p>
            </div>
          </div>

          <textarea
            value={geoCountries}
            onChange={(e) => setGeoCountries(e.target.value)}
            placeholder="Myanmar, Nigeria, Turkey"
            rows={3}
            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
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
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
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
              {csvHeaders.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} — click any cell to edit
                    </p>
                    <Button
                      className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm"
                      disabled={anomaliesLoading || csvRows.length === 0}
                      onClick={handleRunAnalysis}
                    >
                      {anomaliesLoading ? "Analyzing…" : "Run Analysis"}
                    </Button>
                  </div>
                  <CSVDataTable headers={csvHeaders} rows={csvRows} onChange={setCsvRows} />
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
