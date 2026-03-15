/** RFC 4180-compliant CSV line parser — handles quoted fields with embedded commas. */
export function parseCSVLine(line: string): string[] {
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

export function parseCSV(text: string): {
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

export function rowsToCSVFile(
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

/** Parse entity CSV for sanctions: description|name|entity_name|company|vendor|customer_name, country|ip_country. */
export function parseSanctionsCsv(
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
