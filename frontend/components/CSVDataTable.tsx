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

// Columns to show first (by normalized key), in priority order
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

// Columns to push to the end (IDs, internal keys)
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

// Format cell values for display (booleans, nulls, etc.)
function formatCellValue(col: string, value: string) {
  if (value === "" || value === undefined) return null;
  const lower = value.toLowerCase();
  if (lower === "true") return <span className="text-green-600 font-medium">Yes</span>;
  if (lower === "false") return <span className="text-gray-400">No</span>;
  // Format amounts as currency if column looks like an amount
  const key = normalizeKey(col);
  if ((key === "amount" || key === "total" || key === "totalamount") && !isNaN(Number(value))) {
    return (
      <span className="font-mono font-medium text-gray-900">
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
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 w-10">#</th>
              {sortedHeaders.map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {formatHeader(h)}
                </th>
              ))}
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 2} className="px-4 py-8 text-center text-sm text-gray-400">
                  No rows. Add one below.
                </td>
              </tr>
            )}
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                <td className="px-4 py-2 text-xs text-gray-400 select-none">{rowIdx + 1}</td>
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
                        className="h-7 text-sm py-0"
                      />
                    ) : (
                      <span
                        className="block px-2 py-1 rounded cursor-text hover:bg-gray-100 min-w-[60px] min-h-[28px] text-gray-900"
                        onClick={() => setEditingCell({ row: rowIdx, col })}
                      >
                        {row[col]
                          ? formatCellValue(col, row[col])
                          : <span className="text-gray-300">—</span>}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-red-500"
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

      <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 text-xs">
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}
