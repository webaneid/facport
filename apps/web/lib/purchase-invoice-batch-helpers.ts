// § Fase 81 (2026-09-09) — mirror `sales-invoice-batch-helpers.ts` (Fase
// 63), diekstrak dari `app/app/(protected)/purchase-invoice/import/[batchId]/page.tsx`
// supaya bisa dites TANPA import modul page.tsx (bawa `next/navigation`,
// § alasan sama seperti versi Sales Invoice).
//
// § feedback client: "Bill No boleh sama walau beda transaksi, tapi
// Trans No harus unik per transaksi" — kolom "Nomor Faktur" di halaman
// batch detail (peninggalan Fase 06/08 SEBELUM Fase 81 ada) sekarang
// DIUTAMAKAN Trans No (field `number`), fallback Bill No — SINKRON
// dengan backend `groupPurchaseInvoiceRows`
// (`apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts`, Fase 81).
export type BatchRow = { id: string; rowNumber: number; rawData: Record<string, unknown> };

export function findNumberColumn(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, field]) => field === "number");
  return entry?.[0] ?? null;
}

export function findBillNumberColumn(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, field]) => field === "billNumber");
  return entry?.[0] ?? null;
}

function valueOfColumn(row: BatchRow, column: string | null): string {
  if (!column) return "";
  const value = row.rawData[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

export function invoiceNumberOf(row: BatchRow, numberColumn: string | null, billNumberColumn: string | null): string {
  const numberValue = valueOfColumn(row, numberColumn);
  return numberValue !== "" ? numberValue : valueOfColumn(row, billNumberColumn);
}

export function siblingRowNumbersOf<T extends BatchRow>(row: T, allRows: T[], numberColumn: string | null, billNumberColumn: string | null): number[] {
  const inv = invoiceNumberOf(row, numberColumn, billNumberColumn);
  if (!inv) return [];
  return allRows
    .filter((r) => r.id !== row.id && invoiceNumberOf(r, numberColumn, billNumberColumn).toLowerCase() === inv.toLowerCase())
    .map((r) => r.rowNumber);
}

export function sortByInvoiceNumber<T extends BatchRow>(rows: T[], numberColumn: string | null, billNumberColumn: string | null): T[] {
  return [...rows].sort((a, b) => {
    const invA = invoiceNumberOf(a, numberColumn, billNumberColumn);
    const invB = invoiceNumberOf(b, numberColumn, billNumberColumn);
    if (!invA && !invB) return a.rowNumber - b.rowNumber;
    if (!invA) return 1;
    if (!invB) return -1;
    const cmp = invA.localeCompare(invB, undefined, { numeric: true, sensitivity: "base" });
    return cmp !== 0 ? cmp : a.rowNumber - b.rowNumber;
  });
}
