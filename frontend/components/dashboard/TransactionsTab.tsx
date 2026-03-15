"use client";

import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { CSVDataTable } from "@/components/CSVDataTable";
import type { ManualTx } from "@/components/dashboard/AnomalyTab";

interface TransactionsTabProps {
  csvFileName: string | undefined;
  onAnomalyFile: (f: File) => void;
  onRemoveFile: () => void;
  csvRowsLength: number;
  manualTxInput: ManualTx;
  setManualTxInput: React.Dispatch<React.SetStateAction<ManualTx>>;
  onAddManualTransaction: () => void;
  onRemoveManualTransaction: (i: number) => void;
  manualTransactions: ManualTx[];
  saveLogName: string;
  setSaveLogName: (s: string) => void;
  csvSaveLoading: boolean;
  onSaveTransactionLog: () => void;
  csvSaveMessage: string | null;
  csvHeaders: string[];
  csvRows: Record<string, string>[];
  setCsvRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  csvOriginalFile: File | null;
}

export function TransactionsTab({
  csvFileName,
  onAnomalyFile,
  onRemoveFile,
  csvRowsLength,
  manualTxInput,
  setManualTxInput,
  onAddManualTransaction,
  onRemoveManualTransaction,
  manualTransactions,
  saveLogName,
  setSaveLogName,
  csvSaveLoading,
  onSaveTransactionLog,
  csvSaveMessage,
  csvHeaders,
  csvRows,
  setCsvRows,
  csvOriginalFile,
}: TransactionsTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border p-6 space-y-4">
        <p className="text-sm font-semibold text-foreground">Transactions</p>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
          Upload a CSV or PDF, or add transactions manually. Then run analysis in the Anomaly Detector tab.
        </p>

        <DropZone
          hint="CSV or PDF (date, vendor, amount)"
          onFile={onAnomalyFile}
          onRemove={onRemoveFile}
          fileName={csvFileName}
        />

        {csvRowsLength > 0 && (
          <p className="text-[11px] text-muted-foreground text-center font-mono">
            {csvRowsLength} row{csvRowsLength !== 1 ? "s" : ""} loaded
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            or add individually
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

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
                    setManualTxInput((p) => ({ ...p, customer_name: e.target.value }))
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
                    setManualTxInput((p) => ({ ...p, timestamp: e.target.value }))
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
                    setManualTxInput((p) => ({ ...p, amount: e.target.value }))
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
                    setManualTxInput((p) => ({ ...p, currency: e.target.value }))
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
                    setManualTxInput((p) => ({ ...p, payment_method: e.target.value }))
                  }
                  className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                >
                  {["credit_card", "debit", "cash", "bank_transfer"].map((m) => (
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
                    setManualTxInput((p) => ({ ...p, card_brand: e.target.value }))
                  }
                  className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                >
                  {["Visa", "Mastercard", "Amex", "Discover"].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
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
                      card_last4: e.target.value.replace(/\D/g, "").slice(0, 4),
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
                      ip_country: e.target.value.toUpperCase().slice(0, 2),
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
                    setManualTxInput((p) => ({ ...p, device_type: e.target.value }))
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
                    setManualTxInput((p) => ({ ...p, cvv_match: e.target.checked }))
                  }
                  className="accent-foreground"
                />
                <span className="text-xs text-muted-foreground">CVV Match</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualTxInput.address_match}
                  onChange={(e) =>
                    setManualTxInput((p) => ({ ...p, address_match: e.target.checked }))
                  }
                  className="accent-foreground"
                />
                <span className="text-xs text-muted-foreground">Address Match</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualTxInput.ip_is_vpn}
                  onChange={(e) =>
                    setManualTxInput((p) => ({ ...p, ip_is_vpn: e.target.checked }))
                  }
                  className="accent-foreground"
                />
                <span className="text-xs text-muted-foreground">VPN</span>
              </label>
            </div>
          </div>

          <button
            onClick={onAddManualTransaction}
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
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Payment</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {manualTransactions.map((t, i) => (
                    <tr key={i} className="hover:bg-accent/50 transition-colors">
                      <td className="px-3 py-2 font-medium text-foreground truncate max-w-[90px]">
                        {t.customer_name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.card_brand} · {t.payment_method.replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {t.amount
                          ? `${t.currency} ${Number(t.amount).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => onRemoveManualTransaction(i)}
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

        {(csvRowsLength > 0 || manualTransactions.length > 0) && (
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
              onClick={onSaveTransactionLog}
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

      {(csvHeaders.length > 0 || manualTransactions.length > 0 || csvOriginalFile) && (
        <div className="border border-border bg-card">
          <div className="px-5 py-3 border-b border-border">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
              Transaction data
            </span>
          </div>
          <div className="p-6">
            {csvHeaders.length > 0 ? (
              <CSVDataTable headers={csvHeaders} rows={csvRows} onChange={setCsvRows} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {manualTransactions.length} manual transaction(s). Add a CSV to see the full table.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
