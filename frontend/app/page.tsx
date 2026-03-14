"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ResultsTable } from "@/components/ResultsTable";
import { RiskSummary } from "@/components/RiskSummary";
import { PDFExport } from "@/components/PDFExport";
import { scanSanctions, scanAnomalies, analyzeGeoRisk } from "@/lib/api";
import type {
  SanctionsResponse,
  AnomaliesResponse,
  GeoRiskResponse,
} from "@/lib/api";

type Tab = "sanctions" | "anomalies" | "georisk";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("sanctions");

  const [sanctionsData, setSanctionsData] = useState<SanctionsResponse | null>(null);
  const [anomaliesData, setAnomaliesData] = useState<AnomaliesResponse | null>(null);
  const [geoRiskData, setGeoRiskData] = useState<GeoRiskResponse | null>(null);

  const [sanctionsLoading, setSanctionsLoading] = useState(false);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [geoRiskLoading, setGeoRiskLoading] = useState(false);

  const [geoCountries, setGeoCountries] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSanctionsUpload(file: File) {
    setSanctionsLoading(true);
    setError(null);
    try {
      const data = await scanSanctions(file);
      setSanctionsData(data);
    } catch (e) {
      setError("Sanctions scan failed. Is the backend running?");
    } finally {
      setSanctionsLoading(false);
    }
  }

  async function handleAnomaliesUpload(file: File) {
    setAnomaliesLoading(true);
    setError(null);
    try {
      const data = await scanAnomalies(file);
      setAnomaliesData(data);
    } catch (e) {
      setError("Anomaly scan failed. Is the backend running?");
    } finally {
      setAnomaliesLoading(false);
    }
  }

  async function handleGeoRisk() {
    const countries = geoCountries
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!countries.length) return;
    setGeoRiskLoading(true);
    setError(null);
    try {
      const data = await analyzeGeoRisk(countries);
      setGeoRiskData(data);
    } catch (e) {
      setError("Geo risk analysis failed. Is the backend running?");
    } finally {
      setGeoRiskLoading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "sanctions", label: "Sanctions Screener" },
    { id: "anomalies", label: "Anomaly Detector" },
    { id: "georisk", label: "Geopolitical Monitor" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">ShieldAI</h1>
            <p className="text-xs text-gray-500">Compliance Intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            {(sanctionsData || anomaliesData || geoRiskData) && (
              <PDFExport
                sanctionsData={sanctionsData}
                anomaliesData={anomaliesData}
                geoRiskData={geoRiskData}
              />
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary row */}
        <RiskSummary
          sanctionsData={sanctionsData}
          anomaliesData={anomaliesData}
          geoRiskData={geoRiskData}
        />

        {/* Error banner */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-6">
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                  {tab.id === "georisk" && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      stretch
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Sanctions tab */}
          {activeTab === "sanctions" && (
            <div className="mt-6 space-y-6">
              <FileUpload
                label="Upload vendor/entity CSV"
                hint="Columns: name, country, registration_number (name required)"
                onUpload={handleSanctionsUpload}
                loading={sanctionsLoading}
              />
              {sanctionsData && (
                <ResultsTable type="sanctions" data={sanctionsData} />
              )}
            </div>
          )}

          {/* Anomalies tab */}
          {activeTab === "anomalies" && (
            <div className="mt-6 space-y-6">
              <FileUpload
                label="Upload transaction CSV"
                hint="Columns: date, vendor, amount, description (date + amount required)"
                onUpload={handleAnomaliesUpload}
                loading={anomaliesLoading}
              />
              {anomaliesData && (
                <ResultsTable type="anomalies" data={anomaliesData} />
              )}
            </div>
          )}

          {/* Geo risk tab */}
          {activeTab === "georisk" && (
            <div className="mt-6 space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Countries to analyze
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={geoCountries}
                    onChange={(e) => setGeoCountries(e.target.value)}
                    placeholder="Myanmar, Nigeria, Turkey"
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleGeoRisk}
                    disabled={geoRiskLoading || !geoCountries.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {geoRiskLoading ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
              </div>
              {geoRiskData && (
                <ResultsTable type="georisk" data={geoRiskData} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
