"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";

interface CSVDataTableProps {
  headers: string[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}

const PRIORITY_COLUMNS = [
  "customer_name", "customername", "name",
  "amount", "total", "total_amount",
  "currency",
  "date", "timestamp", "created_at", "transaction_date",
  "vendor", "merchant",
  "entry_mode", "entrymode",
  "card_present", "cardpresent",
  "cvv_match", "cvvmatch",
  "avs_result", "avsresult",
  "address_match", "addressmatch",
  "ip_is_vpn", "ipisvpn",
  "refund_status", "refundstatus",
];

const DEPRIORITIZED_COLUMNS = [
  "transaction_id", "transactionid",
  "order_id", "orderid",
  "customer_id", "customerid",
  "id",
];

function normalizeKey(h: string) {
  return h.toLowerCase().replace(/[\s_-]/g, "");
}

function formatHeader(h: string) {
  return h
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortHeaders(headers: string[]) {
  const priority = (h: string) => {
    const key = normalizeKey(h);
    const p = PRIORITY_COLUMNS.indexOf(key);
    if (p !== -1) return p;
    const d = DEPRIORITIZED_COLUMNS.indexOf(key);
    if (d !== -1) return PRIORITY_COLUMNS.length + 100 + d;
    return PRIORITY_COLUMNS.length + d;
  };
  return [...headers].sort((a, b) => priority(a) - priority(b));
}

function formatCellValue(col: string, value: string) {
  if (value === "" || value === undefined) return null;
  const lower = value.toLowerCase();
  if (lower === "true") return <span className="text-foreground font-medium">Yes</span>;
  if (lower === "false") return <span className="text-muted-foreground">No</span>;
  const key = normalizeKey(col);
  if ((key === "amount" || key === "total" || key === "totalamount") && !isNaN(Number(value))) {
    return (
      <span className="font-mono font-medium text-foreground">
        ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    );
  }
  return value;
}

export function CSVDataTable({ headers, rows, onChange }: CSVDataTableProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const sortedHeaders = sortHeaders(headers);

  function updateCell(rowIdx: number, col: string, value: string) {
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r)));
  }

  function deleteRow(rowIdx: number) {
    onChange(rows.filter((_, i) => i !== rowIdx));
  }

  function addRow() {
    onChange([...rows, Object.fromEntries(headers.map((h) => [h, ""]))]);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-accent border-b border-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-10">#</th>
              {sortedHeaders.map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {formatHeader(h)}
                </th>
              ))}
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 2} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No rows. Add one below.
                </td>
              </tr>
            )}
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-4 py-2 text-[10px] text-muted-foreground select-none font-mono">{rowIdx + 1}</td>
                {sortedHeaders.map((col) => (
                  <td key={col} className="px-2 py-1.5">
                    {editingCell?.row === rowIdx && editingCell?.col === col ? (
                      <Input
                        autoFocus
                        value={row[col] ?? ""}
                        onChange={(e) => updateCell(rowIdx, col, e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setEditingCell(null);
                        }}
                        className="h-7 text-xs py-0"
                      />
                    ) : (
                      <span
                        className="block px-2 py-1 cursor-text hover:bg-accent min-w-[60px] min-h-[28px] text-foreground"
                        onClick={() => setEditingCell({ row: rowIdx, col })}
                      >
                        {row[col]
                          ? formatCellValue(col, row[col])
                          : <span className="text-muted-foreground/30">—</span>}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRow(rowIdx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 text-[10px]">
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}
