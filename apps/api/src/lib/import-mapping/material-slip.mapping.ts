// § architecture-material-slip.md — Fase 148. Material Slip = Pengambilan Bahan Baku, panggil `/api/material-slip/save.do`.
//
// § Grouping 2-level (§ manufacture-slip-shared.ts, dari data riil client 2026-09-22): dokumen = baris se-"Trans No"; dalam 1
// dokumen bisa ADA BEBERAPA barang berbeda (dikonfirmasi contoh client: 2 baris Trans No sama, Item No beda), dan 1 barang
// bisa punya banyak nomor seri (baris item itu sendiri + baris lanjutan tanpa Qty barang).
//
// § `materialSlipType` (enum REQUIRED API: ITEM_PICK | ITEM_RETURN) — contoh riil client memakai LITERAL ENUM langsung
// ("ITEM_PICK"), bukan istilah Indonesia — `resolveMaterialSlipType` cek literal dulu sebelum dictionary tebakan.
//
// § Cabang & gudang KEDUANYA OPSIONAL, TIDAK perlu lookup ID (beda dari Finished Good Slip/Work Order — dikonfirmasi live
// portal developer 2026-09-22, § architecture doc "Quirk Cabang & Gudang"). `branchName`/`warehouseName` dikirim apa adanya.
//
// § TIDAK auto-create item; `workOrderMaterialId` (id internal baris Work Order) TIDAK dipetakan — bukan sesuatu yang user
// isi manual di Excel (§ architecture doc "Keputusan Desain" #3). Hanya 5 slot Kategori Keuangan (CLS1-5) dari 10 yang API dukung.
import { collectSerialEntries, groupSlipDocuments, slipValueOf, type SlipDocGroup, type SlipItemGroup, type SlipRowRecord } from "./manufacture-slip-shared";

export const MATERIAL_SLIP_TYPES = ["ITEM_PICK", "ITEM_RETURN"] as const;
export type MaterialSlipType = (typeof MATERIAL_SLIP_TYPES)[number];

const MATERIAL_SLIP_TYPE_DICTIONARY: Record<string, MaterialSlipType> = {
  pengambilan: "ITEM_PICK",
  ambil: "ITEM_PICK",
  keluar: "ITEM_PICK",
  pick: "ITEM_PICK",
  pengembalian: "ITEM_RETURN",
  kembali: "ITEM_RETURN",
  retur: "ITEM_RETURN",
  return: "ITEM_RETURN",
};

export function resolveMaterialSlipType(raw: unknown): MaterialSlipType | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") return null;
  const upper = normalized.toUpperCase();
  if ((MATERIAL_SLIP_TYPES as readonly string[]).includes(upper)) return upper as MaterialSlipType;
  return MATERIAL_SLIP_TYPE_DICTIONARY[normalized] ?? null;
}

const CLS_SLOTS = [1, 2, 3, 4, 5] as const;
const kategoriKeuangan = Object.fromEntries(CLS_SLOTS.map((n) => [`kategoriKeuangan${n}`, `detailItem.dataClassification${n}Name`]));

export const materialSlipMapping = {
  requiredFields: ["transDate", "workOrderNumber", "materialSlipType"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number",
    materialSlipType: "materialSlipType",
    workOrderNumber: "workOrderNumber",
    description: "description",
    branchName: "branchName",
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    quantity: "detailItem.quantity",
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
  // § URUTAN mengikuti sheet "Material Slip" (contoh client `material-slip-temp-v1.xlsx`); "CLS1-5" label ringkas client.
  defaultColumnMap: {
    "Branch Name": "branchName",
    "Trans Date": "transDate",
    "Trans No": "number",
    "Material Slip Type": "materialSlipType",
    "Work Order No": "workOrderNumber",
    Description: "description",
    "Item No": "itemNo",
    "Item Name": "itemName",
    Qty: "quantity",
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

export type MaterialSlipField = string;
export type ImportRowRecord = SlipRowRecord;
export type MaterialSlipGroup = SlipDocGroup;

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

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === "number")?.[0] ?? null;
}

export function groupMaterialSlipRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): MaterialSlipGroup[] {
  return groupSlipDocuments(rows, columnMapping);
}

/**
 * Validasi SATU baris "item" (itemRow suatu barang, bukan baris lanjutan serial): `materialSlipType` (bila kolomnya
 * dipetakan di baris ini — biasanya di baris pertama dokumen) harus dikenali, `itemNo` wajib. Mengembalikan field
 * bermasalah (kosong = valid).
 */
export function materialSlipRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const problems: string[] = [];
  const typeRaw = slipValueOf(rawRow, "materialSlipType", columnMapping);
  if (typeRaw !== undefined && resolveMaterialSlipType(typeRaw) === null) problems.push("materialSlipType");
  if (slipValueOf(rawRow, "itemNo", columnMapping) === undefined) problems.push("itemNo");
  return problems;
}

/** Kelengkapan header dokumen dari baris PERTAMA grup: tanggal, Work Order No, Tipe (harus dikenali). */
export function materialSlipHeaderMissing(firstRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const missing: string[] = [];
  if (slipValueOf(firstRow, "transDate", columnMapping) === undefined) missing.push("Trans Date");
  if (slipValueOf(firstRow, "workOrderNumber", columnMapping) === undefined) missing.push("Work Order No");
  const type = slipValueOf(firstRow, "materialSlipType", columnMapping);
  if (type === undefined || resolveMaterialSlipType(type) === null) missing.push("Material Slip Type");
  return missing;
}

function buildDetailItemFromItemGroup(item: SlipItemGroup, columnMapping: Record<string, string>): Record<string, unknown> {
  const rawRow = item.itemRow.rawData;
  const detailItem: Record<string, unknown> = {
    itemNo: String(slipValueOf(rawRow, "itemNo", columnMapping) ?? ""),
  };
  const quantity = slipValueOf(rawRow, "quantity", columnMapping);
  if (quantity !== undefined) detailItem.quantity = Number(quantity);
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

// § 1 grup = 1 Material Slip. Header dari baris PERTAMA. `detailItem[]` dibangun dari `items` hasil grouping 2-level
// (§ manufacture-slip-shared.ts) — bukan langsung dari `rawRows` mentah seperti modul lain.
export function buildMaterialSlipPayload(group: MaterialSlipGroup, columnMapping: Record<string, string>): Record<string, unknown> {
  const first = group.rows[0]?.rawData ?? {};
  const type = resolveMaterialSlipType(slipValueOf(first, "materialSlipType", columnMapping));

  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(slipValueOf(first, "transDate", columnMapping)) ?? ""),
    workOrderNumber: String(slipValueOf(first, "workOrderNumber", columnMapping) ?? ""),
    materialSlipType: type ?? "",
  };
  const number = slipValueOf(first, "number", columnMapping);
  if (number !== undefined) payload.number = String(number);
  for (const [field, path] of [
    ["description", "description"],
    ["branchName", "branchName"],
  ] as const) {
    const value = slipValueOf(first, field, columnMapping);
    if (value !== undefined) payload[path] = String(value);
  }
  payload.detailItem = group.items.map((item) => buildDetailItemFromItemGroup(item, columnMapping));
  return payload;
}

/** Nilai Kategori Keuangan (slot 1-5) satu baris — dipakai `ensureMaterialSlipDataClassifications` (worker) untuk auto-create. */
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
