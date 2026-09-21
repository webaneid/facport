// § architecture-inventory-adjustment.md — Fase 138. Inventory Adjustment
// = Penyesuaian Persediaan, panggil `/api/item-adjustment/save.do`.
// Grouping DEFAULT ADR-0011 by "No. Item Adjustment" (field `number`,
// opsional — kosong = 1 baris = 1 dokumen sendiri, SAMA pola Other
// Deposit). TIDAK auto-create item (mirror Item Transfer/Receive Item,
// BUKAN Sales Order) — 2 alasan: (1) Excel client TIDAK punya kolom
// "Item Name", padahal `findOrCreateItem` MEWAJIBKAN nama saat membuat
// barang baru (akan throw error di baris pertama barang yang belum ada);
// (2) secara bisnis, "penyesuaian stok" cuma masuk akal untuk barang yang
// SUDAH ada & di-track sebagai inventory — auto-create barang baru
// sebagai `NON_INVENTORY` (default `findOrCreateItem`) justru salah
// konsep untuk modul ini. `itemNo` dikirim apa adanya, Accurate yang
// validasi eksistensi.
//
// § TIDAK ADA Kategori Keuangan (`dataClassificationNName`) di modul ini
// — Excel client CUMA minta "Atribut Tambahan"/"Atribut Number"/"Atribut
// Date" (charField/numericField/dateField, dikonfirmasi resmi tiket
// #357901, § architecture doc), BUKAN "Item Cls"/Finance Category
// seperti modul lain. Makanya TIDAK ada
// `ensureInventoryAdjustmentDataClassifications` di worker, dan scope
// OAuth TIDAK butuh `data_classification_view`/`_save`.
//
// § `itemAdjustmentType` (enum REQUIRED API: ADJUSTMENT_IN/OUT/STOCK) —
// nilai literal kolom "Tipe Adj" di Excel client BELUM diverifikasi ke
// data asli (§ architecture doc "Known Limitations"). Dictionary di
// bawah (`ITEM_ADJUSTMENT_TYPE_DICTIONARY`) adalah TEBAKAN TERBAIK
// berbasis istilah Indonesia umum — WAJIB dicek ulang saat retest
// client pertama. Baris dengan nilai yang tidak cocok dictionary MANA
// PUN gagal dengan pesan jelas (bukan default diam-diam ke salah satu
// enum).
//
// § `unitCost` REQUIRED oleh spec API meski nama kolom Excel
// menyiratkan opsional ("Unit Price (jika adj tambah)") — default `0`
// kalau kosong (relevan untuk ADJUSTMENT_OUT yang tidak butuh nilai
// beli), TIDAK PERNAH dikirim `undefined`.
export const ITEM_ADJUSTMENT_TYPES = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "ADJUSTMENT_STOCK"] as const;
export type ItemAdjustmentType = (typeof ITEM_ADJUSTMENT_TYPES)[number];

const ITEM_ADJUSTMENT_TYPE_DICTIONARY: Record<string, ItemAdjustmentType> = {
  tambah: "ADJUSTMENT_IN",
  masuk: "ADJUSTMENT_IN",
  "barang masuk": "ADJUSTMENT_IN",
  in: "ADJUSTMENT_IN",
  adjustment_in: "ADJUSTMENT_IN",
  kurang: "ADJUSTMENT_OUT",
  keluar: "ADJUSTMENT_OUT",
  "barang keluar": "ADJUSTMENT_OUT",
  out: "ADJUSTMENT_OUT",
  adjustment_out: "ADJUSTMENT_OUT",
  stok: "ADJUSTMENT_STOCK",
  "stok opname": "ADJUSTMENT_STOCK",
  "penyesuaian stok": "ADJUSTMENT_STOCK",
  stock: "ADJUSTMENT_STOCK",
  adjustment_stock: "ADJUSTMENT_STOCK",
};

export function resolveItemAdjustmentType(raw: unknown): ItemAdjustmentType | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") return null;
  const upper = normalized.toUpperCase();
  if ((ITEM_ADJUSTMENT_TYPES as readonly string[]).includes(upper)) return upper as ItemAdjustmentType;
  return ITEM_ADJUSTMENT_TYPE_DICTIONARY[normalized] ?? null;
}

export const inventoryAdjustmentMapping = {
  requiredFields: ["transDate", "branchName", "itemNo", "itemAdjustmentType", "quantity"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number", // No. Item Adjustment — opsional, kunci grouping DEFAULT
    adjustmentAccountNo: "adjustmentAccountNo",
    description: "description",
    branchName: "branchName",
    // detailItem[]
    itemNo: "detailItem.itemNo",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    unitCost: "detailItem.unitCost",
    warehouseName: "detailItem.warehouseName",
    itemAdjustmentType: "detailItem.itemAdjustmentType",
    detailNotes: "detailItem.detailNotes",
    // detailItem[].detailSerialNumber[0] — nested, 1 baris Excel = maks 1 entri.
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
    // § Atribut Tambahan — charField/numericField/dateField, ROOT-level
    // per konvensi Accurate (bukan nested detailItem, § preseden Purchase
    // Order/Other Deposit) TAPI di sini konteksnya level ITEM karena
    // Excel client cuma minta 1 baris = 1 barang tanpa header terpisah —
    // ikuti field API RESMI: charField/numericField/dateField ada di
    // `detailItem[]` untuk endpoint ini (BEDA dari Sales Invoice yang
    // charField ada di header/root, § catatan arsitektur "field ini
    // konsisten lintas jenis transaksi" TAPI posisi nesting-nya
    // mengikuti struktur ARRAY yang tersedia di endpoint masing-masing).
    attributTambahan1: "detailItem.charField1",
    attributTambahan2: "detailItem.charField2",
    attributTambahan3: "detailItem.charField3",
    attributTambahan4: "detailItem.charField4",
    attributTambahan5: "detailItem.charField5",
    attributTambahan6: "detailItem.charField6",
    attributTambahan7: "detailItem.charField7",
    attributTambahan8: "detailItem.charField8",
    attributTambahan9: "detailItem.charField9",
    attributTambahan10: "detailItem.charField10",
    attributNumber1: "detailItem.numericField1",
    attributNumber2: "detailItem.numericField2",
    attributNumber3: "detailItem.numericField3",
    attributNumber4: "detailItem.numericField4",
    attributNumber5: "detailItem.numericField5",
    attributNumber6: "detailItem.numericField6",
    attributNumber7: "detailItem.numericField7",
    attributNumber8: "detailItem.numericField8",
    attributNumber9: "detailItem.numericField9",
    attributNumber10: "detailItem.numericField10",
    attributTanggal1: "detailItem.dateField1",
    attributTanggal2: "detailItem.dateField2",
  } as const,
  // § URUTAN kolom mengikuti PERSIS sheet "Inventory Adjustment"
  // (developmen-15-september-2026.xlsx) — "Atribut Tambahan 1-10"/
  // "Atribut Number 1-10" di file asli cuma label ringkas, DI-EXPAND
  // jadi kolom individual (pola sama Other Payment/Other Deposit).
  defaultColumnMap: {
    Tanggal: "transDate",
    "No. Item Adjustment": "number",
    "Adj Account No": "adjustmentAccountNo",
    Keterangan: "description",
    Cabang: "branchName",
    "Item No": "itemNo",
    Qty: "quantity",
    Unit: "itemUnitName",
    "Unit Price": "unitCost",
    Gudang: "warehouseName",
    "Tipe Adj": "itemAdjustmentType",
    "Note Penting": "detailNotes",
    "Serial Qty": "serialQty",
    "Serial No": "serialNo",
    "Serial ExpDate": "serialExpDate",
    "Atribut Tambahan 1": "attributTambahan1",
    "Atribut Tambahan 2": "attributTambahan2",
    "Atribut Tambahan 3": "attributTambahan3",
    "Atribut Tambahan 4": "attributTambahan4",
    "Atribut Tambahan 5": "attributTambahan5",
    "Atribut Tambahan 6": "attributTambahan6",
    "Atribut Tambahan 7": "attributTambahan7",
    "Atribut Tambahan 8": "attributTambahan8",
    "Atribut Tambahan 9": "attributTambahan9",
    "Atribut Tambahan 10": "attributTambahan10",
    "Atribut Number 1": "attributNumber1",
    "Atribut Number 2": "attributNumber2",
    "Atribut Number 3": "attributNumber3",
    "Atribut Number 4": "attributNumber4",
    "Atribut Number 5": "attributNumber5",
    "Atribut Number 6": "attributNumber6",
    "Atribut Number 7": "attributNumber7",
    "Atribut Number 8": "attributNumber8",
    "Atribut Number 9": "attributNumber9",
    "Atribut Number 10": "attributNumber10",
    "Atribut Date 1": "attributTanggal1",
    "Atribut Date 2": "attributTanggal2",
  } as Record<string, string>,
};

export type InventoryAdjustmentField = keyof typeof inventoryAdjustmentMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type InventoryAdjustmentGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § mirror `toAccurateDate` di `item-transfer.mapping.ts`/`other-deposit.mapping.ts`.
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

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  if (!column) return undefined;
  const value = rawRow[column];
  return value === undefined || value === null || value === "" ? undefined : value;
}

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return columnOf(columnMapping, "number");
}

function valueOfColumn(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping DEFAULT ADR-0011 by "No. Item Adjustment" (`number`,
// OPSIONAL — beda dari Item Transfer yang DIPAKSA required, karena
// arsitektur doc tidak menandai kolom ini wajib untuk modul ini).
export function groupInventoryAdjustmentRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): InventoryAdjustmentGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: InventoryAdjustmentGroup[] = [];
  const byKey = new Map<string, InventoryAdjustmentGroup>();

  for (const row of rows) {
    const groupKey = valueOfColumn(row, numberColumn);
    if (groupKey === null || numberColumn === null) {
      groups.push({ groupKey: null, groupColumn: null, rows: [row] });
      continue;
    }
    const mapKey = groupKey.toLowerCase();
    let group = byKey.get(mapKey);
    if (!group) {
      group = { groupKey, groupColumn: numberColumn, rows: [] };
      byKey.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § validasi "Tipe Adj" — mirror `itemTransferTypeRowError`, TAPI pakai
// dictionary istilah Indonesia (§ komentar atas), bukan cuma exact-match
// enum literal. Dipanggil di worker (tiap baris, SEBELUM
// `buildInventoryAdjustmentPayload`) dan route (edit 1/banyak baris gagal).
export function itemAdjustmentTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const column = columnOf(columnMapping, "itemAdjustmentType");
  const raw = valueOf(rawRow, column);
  if (resolveItemAdjustmentType(raw) === null) return ["itemAdjustmentType"];
  return [];
}

const LINE_OPTIONAL_FIELDS = [
  ["itemUnitName", "itemUnitName", String] as const,
  ["warehouseName", "warehouseName", String] as const,
  ["detailNotes", "detailNotes", String] as const,
  ["attributTambahan1", "charField1", String] as const,
  ["attributTambahan2", "charField2", String] as const,
  ["attributTambahan3", "charField3", String] as const,
  ["attributTambahan4", "charField4", String] as const,
  ["attributTambahan5", "charField5", String] as const,
  ["attributTambahan6", "charField6", String] as const,
  ["attributTambahan7", "charField7", String] as const,
  ["attributTambahan8", "charField8", String] as const,
  ["attributTambahan9", "charField9", String] as const,
  ["attributTambahan10", "charField10", String] as const,
  ["attributNumber1", "numericField1", Number] as const,
  ["attributNumber2", "numericField2", Number] as const,
  ["attributNumber3", "numericField3", Number] as const,
  ["attributNumber4", "numericField4", Number] as const,
  ["attributNumber5", "numericField5", Number] as const,
  ["attributNumber6", "numericField6", Number] as const,
  ["attributNumber7", "numericField7", Number] as const,
  ["attributNumber8", "numericField8", Number] as const,
  ["attributNumber9", "numericField9", Number] as const,
  ["attributNumber10", "numericField10", Number] as const,
];

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const itemNoColumn = columnOf(columnMapping, "itemNo");
  const quantityColumn = columnOf(columnMapping, "quantity");
  const itemAdjustmentTypeColumn = columnOf(columnMapping, "itemAdjustmentType");
  const unitCostColumn = columnOf(columnMapping, "unitCost");

  const resolvedType = resolveItemAdjustmentType(valueOf(rawRow, itemAdjustmentTypeColumn));

  const detailItem: Record<string, unknown> = {
    itemNo: String((itemNoColumn && rawRow[itemNoColumn]) ?? ""),
    quantity: Number((quantityColumn && rawRow[quantityColumn]) ?? 0),
    itemAdjustmentType: resolvedType ?? "",
    // § unitCost REQUIRED oleh spec API — default 0 kalau kosong/tidak
    // relevan (mis. ADJUSTMENT_OUT), TIDAK PERNAH undefined.
    unitCost: Number(valueOf(rawRow, unitCostColumn) ?? 0),
  };

  for (const [field, accuratePath, cast] of LINE_OPTIONAL_FIELDS) {
    const value = valueOf(rawRow, columnOf(columnMapping, field));
    if (value !== undefined) detailItem[accuratePath] = cast(value);
  }

  const dateField1Column = columnOf(columnMapping, "attributTanggal1");
  const dateField2Column = columnOf(columnMapping, "attributTanggal2");
  const dateField1 = valueOf(rawRow, dateField1Column);
  const dateField2 = valueOf(rawRow, dateField2Column);
  if (dateField1 !== undefined) detailItem.dateField1 = toAccurateDate(dateField1);
  if (dateField2 !== undefined) detailItem.dateField2 = toAccurateDate(dateField2);

  const serialNoColumn = columnOf(columnMapping, "serialNo");
  const serialQtyColumn = columnOf(columnMapping, "serialQty");
  const serialExpDateColumn = columnOf(columnMapping, "serialExpDate");
  const serialNo = valueOf(rawRow, serialNoColumn);
  const serialQty = valueOf(rawRow, serialQtyColumn);
  const serialExpDate = valueOf(rawRow, serialExpDateColumn);
  if (serialNo !== undefined || serialQty !== undefined || serialExpDate !== undefined) {
    const serial: Record<string, unknown> = {};
    if (serialNo !== undefined) serial.serialNumberNo = String(serialNo);
    if (serialQty !== undefined) serial.quantity = Number(serialQty);
    if (serialExpDate !== undefined) serial.expiredDate = toAccurateDate(serialExpDate);
    detailItem.detailSerialNumber = [serial];
  }

  return detailItem;
}

const ROOT_OPTIONAL_FIELDS = [
  ["adjustmentAccountNo", "adjustmentAccountNo", String] as const,
  ["description", "description", String] as const,
  ["branchName", "branchName", String] as const,
];

// § Terima ARRAY baris (1 grup = 1 Item Adjustment, N barang). Header
// (transDate/adjustmentAccountNo/dst) diambil dari baris PERTAMA grup,
// TIDAK divalidasi konsistensi antar-baris (SAMA pola Item Transfer —
// modul ini tidak punya "pihak ketiga" seperti vendor yang perlu konsisten).
export function buildInventoryAdjustmentPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const firstRow = rawRows[0] ?? {};
  const transDateColumn = columnOf(columnMapping, "transDate");
  const numberColumn = numberColumnOf(columnMapping);

  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(valueOf(firstRow, transDateColumn)) ?? ""),
    detailItem: rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping)),
  };

  const number = valueOf(firstRow, numberColumn);
  if (number !== undefined) payload.number = String(number);

  for (const [field, accuratePath, cast] of ROOT_OPTIONAL_FIELDS) {
    const value = valueOf(firstRow, columnOf(columnMapping, field));
    if (value !== undefined) payload[accuratePath] = cast(value);
  }

  return payload;
}
