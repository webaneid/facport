// § architecture-finished-good-slip.md — Fase 149. Finished Good Slip = Penyelesaian Barang Jadi, panggil `/api/finished-good-slip/save.do`.
//
// § Grouping 2-level (§ manufacture-slip-shared.ts, dari data riil client 2026-09-22, 536 baris/252 dokumen): pola DOMINAN
// (241/252 dokumen) adalah 1 barang dengan BANYAK nomor seri di baris terpisah (baris item PUNYA `quantity`/`portion`, baris
// lanjutan TIDAK, cuma bawa Serial No). `portion` TERKONFIRMASI skala PERSEN (0-100) — seluruh data riil memakai nilai `100`.
//
// § Cabang DAN gudang KEDUANYA WAJIB di-resolve ke ID (`branchId`/`detailItem.warehouseId`) — dikonfirmasi live portal
// developer 2026-09-22 (§ architecture doc "Quirk"). TIDAK auto-create keduanya (data struktural, bukan transaksional).
//
// § TIDAK auto-create item; `itemNo`/`quantity`/`portion` WAJIB per barang (dikonfirmasi live: ketiganya "Harus diisi: Ya").
// Hanya 5 slot Kategori Keuangan (CLS1-5) dari 10 yang API dukung — sama seperti Material Slip.
import { collectSerialEntries, groupSlipDocuments, slipValueOf, type SlipDocGroup, type SlipItemGroup, type SlipRowRecord } from "./manufacture-slip-shared";

const CLS_SLOTS = [1, 2, 3, 4, 5] as const;
const kategoriKeuangan = Object.fromEntries(CLS_SLOTS.map((n) => [`kategoriKeuangan${n}`, `detailItem.dataClassification${n}Name`]));

export const finishedGoodSlipMapping = {
  requiredFields: ["transDate", "branchName", "workOrderNumber"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number",
    workOrderNumber: "workOrderNumber",
    description: "description",
    branchName: "branchName",
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    quantity: "detailItem.quantity",
    portion: "detailItem.portion",
    itemUnitName: "detailItem.itemUnitName",
    itemNotes: "detailItem.detailNotes",
    projectNo: "detailItem.projectNo",
    departmentName: "detailItem.departmentName",
    warehouseName: "detailItem.warehouseName",
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
    ...kategoriKeuangan,
  } as Record<string, string>,
  // § URUTAN mengikuti sheet "Finished Good Slip" (contoh data riil client `finished-good-slip-temp-v1_Uploud SN.xlsx`).
  defaultColumnMap: {
    "Branch Name": "branchName",
    "Trans Date": "transDate",
    "Trans No": "number",
    "Work Order No": "workOrderNumber",
    Description: "description",
    "Item No": "itemNo",
    "Item Name": "itemName",
    Qty: "quantity",
    Portion: "portion",
    "Unit Name": "itemUnitName",
    "Item Note": "itemNotes",
    "Project No": "projectNo",
    "Dept Name": "departmentName",
    "Warehouse Name": "warehouseName",
    CLS1: "kategoriKeuangan1",
    CLS2: "kategoriKeuangan2",
    CLS3: "kategoriKeuangan3",
    CLS4: "kategoriKeuangan4",
    CLS5: "kategoriKeuangan5",
    "Serial No": "serialNo",
    Qty_1: "serialQty", // § header duplikat "Qty" — kemunculan ke-2 (`parseExcelBuffer`, Fase 147)
    "Expired Date": "serialExpDate",
  } as Record<string, string>,
};

export type FinishedGoodSlipField = string;
export type ImportRowRecord = SlipRowRecord;
export type FinishedGoodSlipGroup = SlipDocGroup;

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § mirror `toAccurateDate` modul lain.
function toAccurateDate(value: unknown): unknown {
  let date: Date | null = null;
  if (typeof value === "number") {
    date = new Date(EXCEL_EPOCH_UTC_MS + value * 86400000);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  if (!date || Number.isNaN(date.getTime())) return value;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

export function groupFinishedGoodSlipRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): FinishedGoodSlipGroup[] {
  return groupSlipDocuments(rows, columnMapping);
}

/**
 * Validasi SATU baris berdiri sendiri (dipakai endpoint edit baris — TIDAK tahu konteks grup). `itemNo`, `quantity`,
 * `portion` WAJIB SEKALIGUS untuk baris ITEM (dikonfirmasi live: ketiganya "Harus diisi: Ya" — beda dari Material Slip
 * yang cuma itemNo wajib) — TAPI baris "lanjutan" nomor seri MURNI (quantity DAN portion sama-sama kosong, tapi
 * Serial No terisi — sinyal sama seperti `splitIntoItems` di manufacture-slip-shared.ts) SAH TANPA ketiganya, supaya
 * baris valid yang ikut ditandai "failed" karena kegagalan grup TIDAK diblokir saat user coba edit ulang. Baris yang
 * benar-benar kosong (tanpa quantity/portion/serial sama sekali) tetap jatuh ke pengecekan penuh di bawah.
 */
export function finishedGoodSlipRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const hasQuantity = slipValueOf(rawRow, "quantity", columnMapping) !== undefined;
  const hasPortion = slipValueOf(rawRow, "portion", columnMapping) !== undefined;
  const hasSerial = slipValueOf(rawRow, "serialNo", columnMapping) !== undefined;
  if (!hasQuantity && !hasPortion && hasSerial) return [];
  return ["itemNo", "quantity", "portion"].filter((field) => slipValueOf(rawRow, field, columnMapping) === undefined);
}

/** Kelengkapan header dokumen dari baris PERTAMA grup: tanggal, cabang, Work Order No. */
export function finishedGoodSlipHeaderMissing(firstRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const missing: string[] = [];
  if (slipValueOf(firstRow, "transDate", columnMapping) === undefined) missing.push("Trans Date");
  if (slipValueOf(firstRow, "branchName", columnMapping) === undefined) missing.push("Branch Name");
  if (slipValueOf(firstRow, "workOrderNumber", columnMapping) === undefined) missing.push("Work Order No");
  return missing;
}

function buildDetailItemFromItemGroup(item: SlipItemGroup, columnMapping: Record<string, string>): Record<string, unknown> {
  const rawRow = item.itemRow.rawData;
  const detailItem: Record<string, unknown> = {
    itemNo: String(slipValueOf(rawRow, "itemNo", columnMapping) ?? ""),
    quantity: Number(slipValueOf(rawRow, "quantity", columnMapping) ?? 0),
    portion: Number(slipValueOf(rawRow, "portion", columnMapping) ?? 0),
  };
  for (const [field, path] of [
    ["itemName", "detailName"],
    ["itemUnitName", "itemUnitName"],
    ["itemNotes", "detailNotes"],
    ["projectNo", "projectNo"],
    ["departmentName", "departmentName"],
    ["warehouseName", "warehouseName"],
  ] as const) {
    const value = slipValueOf(rawRow, field, columnMapping);
    if (value !== undefined) detailItem[path] = String(value);
  }
  for (const n of CLS_SLOTS) {
    const value = slipValueOf(rawRow, `kategoriKeuangan${n}`, columnMapping);
    if (value !== undefined && String(value).trim() !== "") detailItem[`dataClassification${n}Name`] = String(value).trim();
  }
  const serials = collectSerialEntries(item, columnMapping, toAccurateDate);
  if (serials.length > 0) detailItem.detailSerialNumber = serials;
  return detailItem;
}

// § 1 grup = 1 Finished Good Slip. Header dari baris PERTAMA. `branchId`/`detailItem[].warehouseId` DITAMBAHKAN worker
// setelah lookup (§ resolveBranchId/resolveWarehouseId, TIDAK dibangun di sini — mapping tidak boleh panggil Accurate).
export function buildFinishedGoodSlipPayload(group: FinishedGoodSlipGroup, columnMapping: Record<string, string>): Record<string, unknown> {
  const first = group.rows[0]?.rawData ?? {};
  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(slipValueOf(first, "transDate", columnMapping)) ?? ""),
    branchName: String(slipValueOf(first, "branchName", columnMapping) ?? ""),
    workOrderNumber: String(slipValueOf(first, "workOrderNumber", columnMapping) ?? ""),
  };
  const number = slipValueOf(first, "number", columnMapping);
  if (number !== undefined) payload.number = String(number);
  const description = slipValueOf(first, "description", columnMapping);
  if (description !== undefined) payload.description = String(description);
  payload.detailItem = group.items.map((item) => buildDetailItemFromItemGroup(item, columnMapping));
  return payload;
}

/** Nilai Kategori Keuangan (slot 1-5) satu baris — dipakai `ensureFinishedGoodSlipDataClassifications` (worker) untuk auto-create. */
export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (const n of CLS_SLOTS) {
    const value = slipValueOf(rawRow, `kategoriKeuangan${n}`, columnMapping);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index: n, name });
  }
  return result;
}
