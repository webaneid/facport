// § architecture-item-requisition.md — Fase 164 REBUILD TOTAL. Modul ini
// SEBELUMNYA "kembaran" Item Transfer (`/api/item-transfer/save.do`) —
// itu keputusan yang TERNYATA salah, draft client yang dipakai waktu itu
// bukan spec asli. Client kirim ulang draft final (`Format_PREQ_v2.xlsx`
// + sheet "Item Requisition" terbaru di `developmen-15-september-2026.xlsx`,
// keduanya gitignored) yang membuktikan Item Requisition itu genuinely
// `/api/purchase-requisition/save.do` (Permintaan Barang) — dokumen
// TERPISAH dari Item Transfer, BUKAN kembaran-nya. `item-transfer.mapping.ts`
// TIDAK ikut berubah sama sekali (modul "Item Transfer" tetap seperti
// semula, keputusan eksplisit — § architecture doc).
//
// § Subscriber existing (bentuk item-transfer lama) SENGAJA TIDAK
// dimigrasikan — keputusan eksplisit user: "gk masalah, abaikan yg sudah
// subscribe, krn sebelumnya salah total". Riwayat `import_batches` lama
// tetap ada di DB (histori), tapi upload BARU langsung pakai mapping ini.
//
// § 46 kolom final = gabungan 2 file client (union, bukan salah satu
// dipilih) — 14 kolom inti + "Atribut Tambahan/Number/Tanggal" (dari
// `developmen-15-september-2026.xlsx`, DIPOTONG ke maks 10/10/2 sesuai
// screenshot Rancangan Formulir Accurate client — Accurate cuma sanggup
// Karakter 1-10, "Atribut Tambahan 11" di draft client itu salah ketik)
// + "Save as Status Type"/"Warehouse"/"Item Cash Disc"/"Item Cash Disc
// Percent"/"PPN"/"PPnBM"/"PPH"/"Item CLS1-3" (dari `Format_PREQ_v2.xlsx`,
// 249 baris data nyata + sheet "Penjelasan Kolom" tertulis client).
//
// § 2 penyimpangan dari label "Wajib"/"Tidak Wajib" client sendiri,
// KEDUANYA diputuskan eksplisit user, bukan tebakan sepihak:
//   1. "Item Price" (unitPrice) — client label WAJIB, spec Accurate juga
//      WAJIB, TAPI 249/249 baris data nyata client KOSONG semua. User:
//      "Unit price dibuat ga wajib saja" — TIDAK dipaksa dari sisi form,
//      default `0` kalau kosong (mirror `unitCost` Inventory Adjustment).
//   2. "Item Req Date" (requiredDate) — client label TIDAK WAJIB, TAPI
//      spec Accurate WAJIB (data nyata client 249/249 tetap terisi,
//      jadi jarang jadi masalah). Sama filosofi unitPrice: TIDAK dipaksa
//      dari sisi form, default ke `Transaction Date` (transDate) kalau
//      kosong — BUKAN 0 (field tanggal), transDate dokumen adalah
//      fallback paling masuk akal.
//   3. "Item Unit Name" (itemUnitName) — client label WAJIB, TAPI
//      TIDAK ADA di 3 field wajib resmi Accurate (cuma itemNo/
//      requiredDate/unitPrice), dan 100/249 baris data nyata kosong —
//      KONSISTEN cuma untuk item non-fisik (mis. "Sales Promo Cut"),
//      item barang fisik SELALU terisi. TIDAK dipaksa wajib di form,
//      opsional (di-skip kalau kosong, BUKAN dikirim string kosong).
//
// § "Atribut Tambahan/Number/Tanggal" (charField/numericField/dateField)
// TIDAK ADA di spec resmi OpenAPI Accurate untuk endpoint ini (grep
// menyeluruh, nihil) — SAMA situasi dengan Inventory Adjustment
// (dikonfirmasi lewat tiket resmi Accurate #357901, BUKAN dari spec
// publik). Untuk Item Requisition BELUM ada tiket serupa, TAPI ada bukti
// kuat dari screenshot Rancangan Formulir Accurate milik client sendiri
// (menu "Permintaan Barang" > tab "Atribut Tambahan", Karakter 1-10/
// Angka 1-10/Tanggal 1-2 genuinely dikonfigurasi di sana) — dicatat
// sebagai Known Limitation di architecture doc, BUKAN blocker.
//
// § "PPN"/"PPnBM"/"PPH" (useTax1/2/3) BUKAN pola baru — implementasi
// identik (nama kolom Excel PERSIS sama, helper konversi sama) sudah
// jalan di `purchase-invoice.mapping.ts`/`purchase-order.mapping.ts`/
// `sales-order.mapping.ts`.
export const REQUISITION_TYPES = ["ALL", "PURCHASE", "TRANSFER"] as const;
export type RequisitionType = (typeof REQUISITION_TYPES)[number];

export const SAVE_AS_STATUS_TYPES = ["APPROVED", "DRAFT", "NEXTUSER_TOAPPROVED", "REJECTED", "UNAPPROVED"] as const;
export type SaveAsStatusType = (typeof SAVE_AS_STATUS_TYPES)[number];

export const itemRequisitionMapping = {
  requiredFields: ["transDate", "number", "requisitionType", "saveAsStatusType", "itemNo", "quantity"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number",
    requisitionType: "requisitionType",
    saveAsStatusType: "saveAsStatusType",
    branchName: "branchName",
    warehouseName: "warehouseName",
    description: "description",
    // detailItem[]
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemDetailNotes: "detailItem.detailNotes",
    requiredDate: "detailItem.requiredDate",
    itemCashDisc: "detailItem.itemCashDiscount",
    itemCashDiscPercent: "detailItem.itemDiscPercent",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    ppn: "detailItem.useTax1",
    ppnbm: "detailItem.useTax2",
    pph: "detailItem.useTax3",
    attribut1: "detailItem.dataClassification1Name",
    attribut2: "detailItem.dataClassification2Name",
    attribut3: "detailItem.dataClassification3Name",
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
  // § URUTAN kolom mengikuti PERSIS gabungan 2 file client (§ komentar atas).
  defaultColumnMap: {
    "Transaction Date": "transDate",
    "Transaction No": "number",
    "Requisition Type": "requisitionType",
    "Save as Status Type": "saveAsStatusType",
    "Branch Name": "branchName",
    Warehouse: "warehouseName",
    Description: "description",
    "Item No": "itemNo",
    "Item Name": "itemName",
    "Item Price": "unitPrice",
    Qty: "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Detail Notes": "itemDetailNotes",
    "Item Req Date": "requiredDate",
    "Item Cash Disc": "itemCashDisc",
    "Item Cash Disc Percent": "itemCashDiscPercent",
    "Department Name": "departmentName",
    "Project No": "projectNo",
    PPN: "ppn",
    PPnBM: "ppnbm",
    PPH: "pph",
    "Item CLS1": "attribut1",
    "Item CLS2": "attribut2",
    "Item CLS3": "attribut3",
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
    "Atribut Tanggal 1": "attributTanggal1",
    "Atribut Tanggal 2": "attributTanggal2",
  } as Record<string, string>,
};

export type ItemRequisitionField = keyof typeof itemRequisitionMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type ItemRequisitionGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

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

const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
function toAccurateBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUE_TEXT_VALUES.has(value.trim().toLowerCase());
  return value;
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

// § grouping DEFAULT ADR-0011 by "Transaction No" (`number`) — WAJIB
// (client label + 249/249 data nyata selalu terisi, § komentar atas).
export function groupItemRequisitionRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): ItemRequisitionGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: ItemRequisitionGroup[] = [];
  const byKey = new Map<string, ItemRequisitionGroup>();

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

function resolveEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  if (raw === undefined || raw === null) return null;
  const upper = String(raw).trim().toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : null;
}

// § validasi "Requisition Type" — dipanggil worker (header baris SEBELUM
// payload dibangun) dan route (edit 1/banyak baris gagal), mirror pola
// `itemTransferTypeRowError` modul lain.
export function requisitionTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const column = columnOf(columnMapping, "requisitionType");
  if (resolveEnum(valueOf(rawRow, column), REQUISITION_TYPES) === null) return ["requisitionType"];
  return [];
}

// § validasi "Save as Status Type" — sama pola di atas.
export function saveAsStatusTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const column = columnOf(columnMapping, "saveAsStatusType");
  if (resolveEnum(valueOf(rawRow, column), SAVE_AS_STATUS_TYPES) === null) return ["saveAsStatusType"];
  return [];
}

// § Kategori Keuangan — cuma 3 slot ("Item CLS1-3"), BEDA dari modul lain
// yang sampai 10 (mis. Purchase Invoice) — sesuai kolom Excel client.
export function extractDataClassificationValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 3; index++) {
    const column = columnOf(columnMapping, `attribut${index}`);
    const value = valueOf(rawRow, column);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}

const LINE_OPTIONAL_FIELDS = [
  ["itemName", "detailName", String] as const,
  ["itemUnitName", "itemUnitName", String] as const,
  ["itemDetailNotes", "detailNotes", String] as const,
  ["departmentName", "departmentName", String] as const,
  ["projectNo", "projectNo", String] as const,
  ["itemCashDisc", "itemCashDiscount", Number] as const,
  // § itemDiscPercent WAJIB tipe JSON string di Accurate (support diskon
  // bertingkat "5 + 2", mirror `purchase-invoice.mapping.ts`), BUKAN number.
  ["itemCashDiscPercent", "itemDiscPercent", String] as const,
  ["ppn", "useTax1", toAccurateBoolean] as const,
  ["ppnbm", "useTax2", toAccurateBoolean] as const,
  ["pph", "useTax3", toAccurateBoolean] as const,
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

// § `fallbackRequiredDate` — Accurate WAJIB `requiredDate`, client label
// "Tidak Wajib" (§ komentar atas) — default ke `transDate` dokumen kalau
// kolom ini kosong, BUKAN ditolak.
export function buildDetailItemFromRow(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
  fallbackRequiredDate: string,
): Record<string, unknown> {
  const itemNoColumn = columnOf(columnMapping, "itemNo");
  const quantityColumn = columnOf(columnMapping, "quantity");
  const unitPriceColumn = columnOf(columnMapping, "unitPrice");
  const requiredDateColumn = columnOf(columnMapping, "requiredDate");

  const detailItem: Record<string, unknown> = {
    itemNo: String((itemNoColumn && rawRow[itemNoColumn]) ?? ""),
    quantity: Number((quantityColumn && rawRow[quantityColumn]) ?? 0),
    // § unitPrice WAJIB oleh spec API — default 0 kalau kosong (§ komentar atas).
    unitPrice: Number(valueOf(rawRow, unitPriceColumn) ?? 0),
    requiredDate: String(toAccurateDate(valueOf(rawRow, requiredDateColumn)) ?? fallbackRequiredDate),
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

  return detailItem;
}

const ROOT_OPTIONAL_FIELDS = [
  ["branchName", "branchName", String] as const,
  ["warehouseName", "warehouseName", String] as const,
];

export function buildItemRequisitionPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const firstRow = rawRows[0] ?? {};
  const transDateColumn = columnOf(columnMapping, "transDate");
  const numberColumn = numberColumnOf(columnMapping);
  const requisitionTypeColumn = columnOf(columnMapping, "requisitionType");
  const saveAsStatusTypeColumn = columnOf(columnMapping, "saveAsStatusType");
  const descriptionColumn = columnOf(columnMapping, "description");

  const transDate = String(toAccurateDate(valueOf(firstRow, transDateColumn)) ?? "");

  const payload: Record<string, unknown> = {
    transDate,
    requisitionType: resolveEnum(valueOf(firstRow, requisitionTypeColumn), REQUISITION_TYPES) ?? "",
    saveAsStatusType: resolveEnum(valueOf(firstRow, saveAsStatusTypeColumn), SAVE_AS_STATUS_TYPES) ?? "",
    detailItem: rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping, transDate)),
  };

  const number = valueOf(firstRow, numberColumn);
  if (number !== undefined) payload.number = String(number);

  for (const [field, accuratePath, cast] of ROOT_OPTIONAL_FIELDS) {
    const value = valueOf(firstRow, columnOf(columnMapping, field));
    if (value !== undefined) payload[accuratePath] = cast(value);
  }

  const description = valueOf(firstRow, descriptionColumn);
  if (description !== undefined) payload.description = String(description);

  return payload;
}
