// § Fase 63 — diekstrak dari `app/app/(protected)/sales-invoice/import/[batchId]/page.tsx`
// supaya bisa dites TANPA import modul page.tsx (yang bawa `next/navigation`,
// `@/lib/api-client`, dst — beresiko kena `mock.module("next/navigation", ...)`
// dari file test LAIN yang berjalan di proses/registry yang sama, § ketemu
// nyata saat nulis test fase ini: "Export named 'useParams' not found").
//
// § feedback client: "PO Number/Bill No boleh sama walau beda transaksi,
// tapi Trans No harus unik per transaksi" — kolom "Nomor Transaksi" di
// halaman batch detail (sebelumnya "Nomor Faktur", peninggalan Fase 13
// SEBELUM Fase 49 ada) sekarang DIUTAMAKAN Trans No (field `number`),
// fallback PO Number — SINKRON dengan backend `groupSalesInvoiceRows`
// (`apps/api/src/lib/import-mapping/sales-invoice.mapping.ts`, Fase 49).
export type BatchRow = { id: string; rowNumber: number; rawData: Record<string, unknown> };

export function findNumberColumn(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, field]) => field === "number");
  return entry?.[0] ?? null;
}

export function findPoNumberColumn(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, field]) => field === "poNumber");
  return entry?.[0] ?? null;
}

function valueOfColumn(row: BatchRow, column: string | null): string {
  if (!column) return "";
  const value = row.rawData[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

export function invoiceNumberOf(row: BatchRow, numberColumn: string | null, poNumberColumn: string | null): string {
  const numberValue = valueOfColumn(row, numberColumn);
  return numberValue !== "" ? numberValue : valueOfColumn(row, poNumberColumn);
}

export function siblingRowNumbersOf<T extends BatchRow>(row: T, allRows: T[], numberColumn: string | null, poNumberColumn: string | null): number[] {
  const inv = invoiceNumberOf(row, numberColumn, poNumberColumn);
  if (!inv) return [];
  return allRows
    .filter((r) => r.id !== row.id && invoiceNumberOf(r, numberColumn, poNumberColumn).toLowerCase() === inv.toLowerCase())
    .map((r) => r.rowNumber);
}

export function sortByInvoiceNumber<T extends BatchRow>(rows: T[], numberColumn: string | null, poNumberColumn: string | null): T[] {
  return [...rows].sort((a, b) => {
    const invA = invoiceNumberOf(a, numberColumn, poNumberColumn);
    const invB = invoiceNumberOf(b, numberColumn, poNumberColumn);
    if (!invA && !invB) return a.rowNumber - b.rowNumber;
    if (!invA) return 1;
    if (!invB) return -1;
    const cmp = invA.localeCompare(invB, undefined, { numeric: true, sensitivity: "base" });
    return cmp !== 0 ? cmp : a.rowNumber - b.rowNumber;
  });
}
