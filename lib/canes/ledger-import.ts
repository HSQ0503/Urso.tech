export const IMPORT_COLUMNS = [
  "source_id",
  "kind",
  "name",
  "date",
  "amount_cents",
  "tax_cents",
  "customer_name",
  "phone",
  "email",
  "address",
  "category",
  "target_id",
  "method",
  "channel",
] as const;
export type ImportPayload = Record<
  (typeof IMPORT_COLUMNS)[number],
  string | null
>;
export type ImportRow = {
  id: string;
  source_key: string;
  payload: ImportPayload;
  state: "ready" | "conflict" | "duplicate" | "applied";
  notice: string;
  target_id: string | null;
};
export type ImportBatch = {
  id: string;
  source_name: string;
  created_at: string;
  rows: ImportRow[];
};

export function parseLedgerCsv(text: string): ImportPayload[] {
  if (text.length > 500_000)
    throw new Error("Use a CSV smaller than 500 KB, with at most 500 rows.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) {
        quoted = !quoted;
      } else throw new Error("Invalid CSV quoting.");
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell);
      cell = "";
      if (char !== ",") {
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        if (char === "\r" && input[i + 1] === "\n") i++;
      }
    } else cell += char;
  }
  if (quoted) throw new Error("A quoted CSV cell is not closed.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const header = rows.shift()?.map((value) => value.trim());
  if (!header || header.join(",") !== IMPORT_COLUMNS.join(","))
    throw new Error("Use the template columns in their original order.");
  if (!rows.length || rows.length > 500)
    throw new Error("Import 1–500 rows at a time.");
  const keys = new Set<string>();
  return rows.map((values, index) => {
    if (values.length !== header.length)
      throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const record = Object.fromEntries(
      IMPORT_COLUMNS.map((name, i) => [name, values[i].trim() || null]),
    ) as ImportPayload;
    if (!record.source_id || keys.has(record.source_id))
      throw new Error(`Row ${index + 2} needs a unique source ID.`);
    keys.add(record.source_id);
    for (const field of ["amount_cents", "tax_cents"] as const)
      if (record[field] && !/^-?\d+$/.test(record[field]!))
        throw new Error(`Row ${index + 2}: ${field} must be integer cents.`);
    if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date))
      throw new Error(`Row ${index + 2} needs YYYY-MM-DD.`);
    return record;
  });
}
