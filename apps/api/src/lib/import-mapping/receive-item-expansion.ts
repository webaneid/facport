import { cellOf, expandPurchaseSourceRows, type PurchaseSourceDoc } from "./source-doc-lines";

// § Fase 225 — Receive Item menarik isi Purchase Order cukup dengan nomornya. Pola Fase 198: "ITEM: Purchase Order No" terisi DAN semua kolom
// item kosong → semua SISA baris PO. Tiap baris dikirim dengan `purchaseOrderDetailId`: terbukti di Accurate asli (Tahap 0) bahwa tanpa itu
// baris Item No kembar tertaut ke baris PO PERTAMA (sisa jadi minus) tanpa error. Dipakai server DAN web (tanpa dependensi server).

export type PurchaseOrderSource = PurchaseSourceDoc;

const ITEM_FIELDS = ["itemNo", "itemName", "unitPrice", "itemNotes", "quantity", "itemUnitName"];
const EXEMPT_REQUIRED = new Set(["itemNo", "unitPrice", "quantity", "itemUnitName"]);

export function isPurchaseOrderExpansionRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): boolean {
  return cellOf(rawRow, columnMapping, "purchaseOrderNumber") !== "" && !ITEM_FIELDS.some((f) => cellOf(rawRow, columnMapping, f) !== "");
}

export function isRequiredFieldExemptForRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): boolean {
  return EXEMPT_REQUIRED.has(field) && isPurchaseOrderExpansionRow(rawRow, columnMapping);
}

/** Ubah `payload.detailItem` (sejajar `rawRows`) di tempat. */
export async function expandPurchaseOrderRowsInPayload(
  payload: Record<string, unknown>,
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  fetchOrder: (number: string) => Promise<PurchaseOrderSource>,
): Promise<void> {
  await expandPurchaseSourceRows(
    payload,
    rawRows,
    columnMapping,
    rawRows.map((r) =>
      isPurchaseOrderExpansionRow(r, columnMapping)
        ? { number: cellOf(r, columnMapping, "purchaseOrderNumber"), label: "Purchase Order", detailIdField: "purchaseOrderDetailId", fetch: fetchOrder }
        : null,
    ),
  );
}

/** Baris yang akan dikirim tanpa kode barang/qty → pesan jelas, bukan "Barang dan Jasa belum terisi" dari Accurate. */
export function assertReceiveItemLines(payload: Record<string, unknown>): void {
  const lines = payload.detailItem as Record<string, unknown>[];
  if (lines.some((l) => !String(l.itemNo ?? "").trim() || !String(l.quantity ?? "").trim())) {
    throw new Error('Item No / Quantity masih kosong. Isi kolom barang, atau kosongkan SEMUA kolom barang dan isi "ITEM: Purchase Order No" agar isinya diambil dari PO.');
  }
}
