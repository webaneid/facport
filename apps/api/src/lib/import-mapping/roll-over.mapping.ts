// § architecture-roll-over.md — Fase 146. Roll Over = Penyelesaian Pesanan (penutup Job Costing), panggil `/api/roll-over/save.do`.
//
// § `rollOverType` (enum REQUIRED API: ACCOUNT | ITEM) ditentukan PER DOKUMEN (baris pertama grup) dan MENENTUKAN array mana yang dipakai:
//   ITEM    → tiap baris Excel = 1 entri `detailItem[]` (Finished Good: FG_Item No/FG_Qty/...); `detailExpense` = [].
//   ACCOUNT → tiap baris Excel = 1 entri `detailExpense[]` (akun + nominal); `detailItem` = [].
// Kolom expense (Expense Acc No/Amount/Name/Note) BUKAN dari Excel client (mereka hanya punya kolom Finished Good) — perluasan Facport
// supaya tipe ACCOUNT bisa dipakai; opsional. Label UI resmi Accurate: ACCOUNT="Akun", ITEM="Barang" (dikonfirmasi via portal developer).
// Nilai literal kolom "Tipe Penyesuaian" di Excel client belum diverifikasi ke data asli — dictionary di bawah TEBAKAN TERBAIK, baris yang
// tidak cocok gagal dengan pesan jelas (bukan default diam-diam).
//
// § TIDAK auto-create item (Excel tidak punya kolom nama barang; `findOrCreateItem` mewajibkan nama — preseden Fase 138/139) dan TIDAK ada
// lookup akun: `itemNo`/`accountNo` dikirim apa adanya, Accurate yang validasi. Kategori Keuangan (`dataClassificationNName`, 10 slot)
// SUDAH resmi didukung spec, di-auto-create lewat `ensureRollOverDataClassifications` (worker).
//
// § `jobOrderNumber` REQUIRED (No Job Order dari modul Job Costing) — TIDAK divalidasi lokal, Accurate yang menolak bila nomor tidak ada.
export const ROLL_OVER_TYPES = ["ACCOUNT", "ITEM"] as const;
export type RollOverType = (typeof ROLL_OVER_TYPES)[number];

const ROLL_OVER_TYPE_DICTIONARY: Record<string, RollOverType> = {
  akun: "ACCOUNT",
  account: "ACCOUNT",
  rekening: "ACCOUNT",
  biaya: "ACCOUNT",
  barang: "ITEM",
  item: "ITEM",
  fg: "ITEM",
  "finished good": "ITEM",
  "finished goods": "ITEM",
  "barang jadi": "ITEM",
};

export function resolveRollOverType(raw: unknown): RollOverType | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") return null;
  const upper = normalized.toUpperCase();
  if ((ROLL_OVER_TYPES as readonly string[]).includes(upper)) return upper as RollOverType;
  return ROLL_OVER_TYPE_DICTIONARY[normalized] ?? null;
}

const CHAR_FIELDS = Array.from({ length: 10 }, (_, i) => i + 1);

const attributTambahan = Object.fromEntries(CHAR_FIELDS.map((n) => [`attributTambahan${n}`, `detailItem.charField${n}`]));
const attributNumber = Object.fromEntries(CHAR_FIELDS.map((n) => [`attributNumber${n}`, `detailItem.numericField${n}`]));
const kategoriKeuangan = Object.fromEntries(CHAR_FIELDS.map((n) => [`kategoriKeuangan${n}`, `detailItem.dataClassification${n}Name`]));

export const rollOverMapping = {
  requiredFields: ["transDate", "branchName", "jobOrderNumber", "rollOverType"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number", // No Trans — opsional, kunci grouping DEFAULT
    jobOrderNumber: "jobOrderNumber",
    rollOverType: "rollOverType",
    description: "description",
    branchName: "branchName",
    // detailItem[] (ITEM)
    itemNo: "detailItem.itemNo",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    warehouseName: "detailItem.warehouseName",
    projectNo: "detailItem.projectNo",
    departmentName: "detailItem.departmentName", // juga dipakai detailExpense (ACCOUNT)
    portion: "detailItem.portion", // % alokasi biaya — juga dipakai detailExpense (ACCOUNT)
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
    ...attributTambahan,
    ...attributNumber,
    attributTanggal1: "detailItem.dateField1",
    attributTanggal2: "detailItem.dateField2",
    ...kategoriKeuangan, // juga dipakai detailExpense (ACCOUNT)
    // detailExpense[] (ACCOUNT) — perluasan Facport, bukan kolom Excel client
    accountNo: "detailExpense.accountNo",
    expenseAmount: "detailExpense.expenseAmount",
    expenseName: "detailExpense.expenseName",
    expenseNotes: "detailExpense.expenseNotes",
  } as Record<string, string>,
  // § URUTAN mengikuti sheet "Roll Over" (developmen-15-september-2026.xlsx); "Atribut Tambahan 1-10"/"Financial Category 1-10" di file asli
  // label ringkas, DI-EXPAND jadi kolom individual (pola Inventory Adjustment/Sales Order).
  defaultColumnMap: {
    Tanggal: "transDate",
    "No Trans": "number",
    "Job Order No": "jobOrderNumber",
    "Tipe Penyesuaian": "rollOverType",
    Keterangan: "description",
    "Nama Cabang": "branchName",
    "FG_Item No": "itemNo",
    FG_Qty: "quantity",
    FG_Unit: "itemUnitName",
    "SN - Qty": "serialQty",
    "Serial No": "serialNo",
    "SN - Exp Date": "serialExpDate",
    "Project No": "projectNo",
    "Dept Name": "departmentName",
    Portion: "portion",
    Warehouse: "warehouseName",
    ...Object.fromEntries(CHAR_FIELDS.map((n) => [`Atribut Tambahan ${n}`, `attributTambahan${n}`])),
    ...Object.fromEntries(CHAR_FIELDS.map((n) => [`Atribut Number ${n}`, `attributNumber${n}`])),
    "Atribut Date 1": "attributTanggal1",
    "Atribut Date 2": "attributTanggal2",
    ...Object.fromEntries(CHAR_FIELDS.map((n) => [`Financial Category ${n}`, `kategoriKeuangan${n}`])),
    "Expense Acc No": "accountNo",
    "Expense Amount": "expenseAmount",
    "Expense Name": "expenseName",
    "Expense Note": "expenseNotes",
  } as Record<string, string>,
};

export type RollOverField = string;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type RollOverGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

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

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, field: string, columnMapping: Record<string, string>): unknown {
  const column = columnOf(columnMapping, field);
  if (!column) return undefined;
  const value = rawRow[column];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return columnOf(columnMapping, "number");
}

function textOf(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping DEFAULT ADR-0011 by "No Trans" (`number`, OPSIONAL — kosong = 1 baris = 1 dokumen).
export function groupRollOverRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): RollOverGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: RollOverGroup[] = [];
  const byKey = new Map<string, RollOverGroup>();
  for (const row of rows) {
    const groupKey = textOf(row, numberColumn);
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

/**
 * Validasi SATU baris terhadap tipe-nya. Mengembalikan daftar field bermasalah (kosong = valid):
 * `rollOverType` bila tidak dikenali; selain itu field wajib per tipe (ITEM: itemNo, quantity · ACCOUNT: accountNo, expenseAmount).
 */
export function rollOverRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const type = resolveRollOverType(valueOf(rawRow, "rollOverType", columnMapping));
  if (type === null) return ["rollOverType"];
  const required = type === "ITEM" ? ["itemNo", "quantity"] : ["accountNo", "expenseAmount"];
  return required.filter((field) => valueOf(rawRow, field, columnMapping) === undefined);
}

/**
 * Konsistensi header SATU grup (= 1 dokumen Roll Over): semua baris HARUS bertipe sama & memakai Job Order yang sama — kalau tidak,
 * baris yang berbeda diam-diam terbawa ke dokumen yang salah. Mengembalikan pesan galat, atau null bila konsisten.
 */
export function validateGroupConsistency(group: RollOverGroup, columnMapping: Record<string, string>): string | null {
  const first = group.rows[0];
  if (!first) return null;
  const firstType = resolveRollOverType(valueOf(first.rawData, "rollOverType", columnMapping));
  const firstJob = String(valueOf(first.rawData, "jobOrderNumber", columnMapping) ?? "").trim().toLowerCase();
  for (const row of group.rows.slice(1)) {
    const type = resolveRollOverType(valueOf(row.rawData, "rollOverType", columnMapping));
    if (type !== firstType) return `Tipe Penyesuaian tidak konsisten dalam satu No Trans (baris ${row.id}) — semua baris harus bertipe sama (Akun atau Barang).`;
    const job = String(valueOf(row.rawData, "jobOrderNumber", columnMapping) ?? "").trim().toLowerCase();
    if (job !== firstJob) return `Job Order No tidak konsisten dalam satu No Trans (baris ${row.id}) — satu Roll Over hanya untuk satu Job Order.`;
  }
  return null;
}

const ITEM_TEXT_FIELDS = [
  ["itemUnitName", "itemUnitName"],
  ["warehouseName", "warehouseName"],
  ["projectNo", "projectNo"],
  ["departmentName", "departmentName"],
] as const;

function classificationEntries(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of CHAR_FIELDS) {
    const value = valueOf(rawRow, `kategoriKeuangan${n}`, columnMapping);
    if (value !== undefined && String(value).trim() !== "") out[`dataClassification${n}Name`] = String(value).trim();
  }
  return out;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const detailItem: Record<string, unknown> = {
    itemNo: String(valueOf(rawRow, "itemNo", columnMapping) ?? ""),
    quantity: Number(valueOf(rawRow, "quantity", columnMapping) ?? 0),
  };
  for (const [field, path] of ITEM_TEXT_FIELDS) {
    const value = valueOf(rawRow, field, columnMapping);
    if (value !== undefined) detailItem[path] = String(value);
  }
  const portion = valueOf(rawRow, "portion", columnMapping);
  if (portion !== undefined) detailItem.portion = Number(portion);

  for (const n of CHAR_FIELDS) {
    const text = valueOf(rawRow, `attributTambahan${n}`, columnMapping);
    if (text !== undefined) detailItem[`charField${n}`] = String(text);
    const num = valueOf(rawRow, `attributNumber${n}`, columnMapping);
    if (num !== undefined) detailItem[`numericField${n}`] = Number(num);
  }
  for (const n of [1, 2]) {
    const date = valueOf(rawRow, `attributTanggal${n}`, columnMapping);
    if (date !== undefined) detailItem[`dateField${n}`] = toAccurateDate(date);
  }
  Object.assign(detailItem, classificationEntries(rawRow, columnMapping));

  const serialNo = valueOf(rawRow, "serialNo", columnMapping);
  const serialQty = valueOf(rawRow, "serialQty", columnMapping);
  const serialExpDate = valueOf(rawRow, "serialExpDate", columnMapping);
  if (serialNo !== undefined || serialQty !== undefined || serialExpDate !== undefined) {
    const serial: Record<string, unknown> = {};
    if (serialNo !== undefined) serial.serialNumberNo = String(serialNo);
    if (serialQty !== undefined) serial.quantity = Number(serialQty);
    if (serialExpDate !== undefined) serial.expiredDate = toAccurateDate(serialExpDate);
    detailItem.detailSerialNumber = [serial];
  }
  return detailItem;
}

export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const detailExpense: Record<string, unknown> = {
    accountNo: String(valueOf(rawRow, "accountNo", columnMapping) ?? ""),
    expenseAmount: Number(valueOf(rawRow, "expenseAmount", columnMapping) ?? 0),
  };
  const name = valueOf(rawRow, "expenseName", columnMapping);
  if (name !== undefined) detailExpense.expenseName = String(name);
  const notes = valueOf(rawRow, "expenseNotes", columnMapping);
  if (notes !== undefined) detailExpense.expenseNotes = String(notes);
  const department = valueOf(rawRow, "departmentName", columnMapping);
  if (department !== undefined) detailExpense.departmentName = String(department);
  const portion = valueOf(rawRow, "portion", columnMapping);
  if (portion !== undefined) detailExpense.portion = Number(portion);
  Object.assign(detailExpense, classificationEntries(rawRow, columnMapping));
  return detailExpense;
}

const ROOT_TEXT_FIELDS = [
  ["description", "description"],
  ["branchName", "branchName"],
] as const;

// § 1 grup = 1 Roll Over. Header dari baris PERTAMA (konsistensi antar-baris divalidasi `validateGroupConsistency`). Kedua array SELALU
// dikirim (spec mewajibkan keduanya; array kosong diterima, ASUMSI konsisten modul lain — dicek saat retest client pertama).
export function buildRollOverPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const first = rawRows[0] ?? {};
  const type = resolveRollOverType(valueOf(first, "rollOverType", columnMapping));

  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(valueOf(first, "transDate", columnMapping)) ?? ""),
    jobOrderNumber: String(valueOf(first, "jobOrderNumber", columnMapping) ?? ""),
    rollOverType: type ?? "",
  };
  const number = valueOf(first, "number", columnMapping);
  if (number !== undefined) payload.number = String(number);
  for (const [field, path] of ROOT_TEXT_FIELDS) {
    const value = valueOf(first, field, columnMapping);
    if (value !== undefined) payload[path] = String(value);
  }

  payload.detailItem = type === "ITEM" ? rawRows.map((row) => buildDetailItemFromRow(row, columnMapping)) : [];
  payload.detailExpense = type === "ACCOUNT" ? rawRows.map((row) => buildDetailExpenseFromRow(row, columnMapping)) : [];
  return payload;
}

/** Nilai Kategori Keuangan (slot 1-10) satu baris — dipakai `ensureRollOverDataClassifications` (worker) untuk auto-create. */
export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (const n of CHAR_FIELDS) {
    const value = valueOf(rawRow, `kategoriKeuangan${n}`, columnMapping);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index: n, name });
  }
  return result;
}
