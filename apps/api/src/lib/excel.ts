import * as XLSX from "xlsx";

export type ParsedExcel = {
  headers: string[];
  rows: Record<string, unknown>[];
};

// § architecture-accurate-integration.md § 3 — parsing generik, mapping
// kolom→field Accurate ditentukan terpisah (lib/import-mapping/*).
export function parseExcelBuffer(buffer: Buffer): ParsedExcel {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName]!;

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return { headers, rows };
}

export function generateTemplateBuffer(columns: string[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([columns]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
