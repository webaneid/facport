// § architecture-item-transfer.md — Item Transfer = Pindah Gudang,
// panggil `/api/item-transfer/save.do`. Grouping DEFAULT ADR-0011 by
// "No. Item Transfer" (field `number`, DIPAKSA REQUIRED di Facport walau
// opsional di API asli — mencegah jebakan "silent wrong data", § ADR-0011
// & pola Other Deposit/Purchase Order). TIDAK auto-create item — `itemNo`
// dikirim apa adanya, Accurate yang validasi eksistensi (mirror Receive
// Item).
//
// § "Item Requisition No" dan "Note Penting" TIDAK PUNYA padanan field
// API — digabung ke `description` (§ architecture doc). Marker
// "$merge.description" di `fieldToAccuratePath` BUKAN path API asli,
// ditangani khusus di `buildItemTransferPayload` — jangan dibaca sebagai
// literal Accurate field.
//
// § `detailSerialNumber[]` BERSARANG di dalam `detailItem[]` — Excel
// client flat (1 baris = 1 barang), jadi Facport batasi maksimal 1 entri
// serial per baris (`detailItem.detailSerialNumber.*` di
// `fieldToAccuratePath`, ditangani khusus di `buildDetailItemFromRow`).
export const itemTransferMapping = {
  requiredFields: ["transDate", "number", "itemTransferType", "branchName", "itemNo", "quantity", "itemUnitName"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    // § kunci grouping — lihat `groupItemTransferRows`.
    number: "number",
    itemTransferType: "itemTransferType",
    branchName: "branchName",
    description: "description",
    differenceAccountNo: "differenceItemTransferAccountNo",
    fromTransferNo: "fromItemTransferNo",
    saveAsStatus: "saveAsStatusType",
    // § "gudang tempat SUMBER barang dikeluarkan / TUJUAN barang diterima"
    // — makna BERBEDA tergantung itemTransferType, dikirim apa adanya
    // (§ architecture doc "Quirk Penting").
    warehouseName: "warehouseName",
    referenceWarehouseName: "referenceWarehouseName",
    requisitionNo: "$merge.description",
    notePenting: "$merge.description",
    // detailItem[]
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemNotes: "detailItem.detailNotes",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    salesOrderNumber: "detailItem.salesOrderNumber",
    // Kategori Keuangan — item-level, cuma 3 slot dipakai sheet client
    // (beda dari modul lain yang biasa 10 slot — Excel client Item
    // Transfer cuma punya "Item Cls1/2/3").
    attribut1: "detailItem.dataClassification1Name",
    attribut2: "detailItem.dataClassification2Name",
    attribut3: "detailItem.dataClassification3Name",
    // detailItem[].detailSerialNumber[0] — nested, § komentar atas.
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
  } as const,
  // § URUTAN kolom mengikuti PERSIS sheet "Item Transfer"
  // (developmen-15-september-2026.xlsx).
  defaultColumnMap: {
    Tanggal: "transDate",
    "No. Item Transfer": "number",
    "Tipe Transfer": "itemTransferType",
    "Branch Name": "branchName",
    Keterangan: "description",
    "Difference Item Transfer Acc No": "differenceAccountNo",
    "From Item Transfer No": "fromTransferNo",
    "Save As Status": "saveAsStatus",
    "Gudang Asal": "warehouseName",
    "Gudang Tujuan": "referenceWarehouseName",
    "Item No": "itemNo",
    "Item Name": "itemName",
    Qty: "quantity",
    Unit: "itemUnitName",
    "Item Notes": "itemNotes",
    "Item Dept": "departmentName",
    "Item Project No": "projectNo",
    "Item Sales Order No": "salesOrderNumber",
    "Item Requisition No": "requisitionNo",
    "Item Cls1": "attribut1",
    "Item Cls2": "attribut2",
    "Item Cls3": "attribut3",
    "Serial No": "serialNo",
    "Serial Qty": "serialQty",
    "Serial ExpDate": "serialExpDate",
    "Note Penting": "notePenting",
  } as Record<string, string>,
};

export type ItemTransferField = keyof typeof itemTransferMapping.fieldToAccuratePath;

export const ITEM_TRANSFER_TYPES = ["TRANSFER_IN", "TRANSFER_OUT"] as const;
export type ItemTransferType = (typeof ITEM_TRANSFER_TYPES)[number];

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type ItemTransferGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § mirror `toAccurateDate` di `receive-item.mapping.ts`/`other-deposit.mapping.ts`.
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

// § grouping DEFAULT ADR-0011 by "No. Item Transfer" (`number`, DIPAKSA
// REQUIRED di `requiredFields` walau opsional di API) — baris tanpa
// nilai (mustahil lolos validasi confirm, tapi tetap dijaga) jadi grup
// sendiri.
export function groupItemTransferRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): ItemTransferGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: ItemTransferGroup[] = [];
  const byKey = new Map<string, ItemTransferGroup>();

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

// § validasi "Tipe Transfer" — mirror `returnTypeRowError`
// (purchase-return.mapping.ts), TAPI lebih sederhana: `itemTransferType`
// TIDAK punya field pendukung kondisional (beda dari `returnType` yang
// wajib invoiceNumber/receiveItemNumber tergantung nilainya). Dipanggil
// di worker (baris pertama grup, SEBELUM `buildItemTransferPayload`) dan
// route (edit 1/banyak baris gagal) — sama titik pemanggilan
// `returnTypeRowError`.
export function itemTransferTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const column = columnOf(columnMapping, "itemTransferType");
  const raw = valueOf(rawRow, column);
  const value = raw !== undefined ? String(raw).trim().toUpperCase() : "";
  if (!ITEM_TRANSFER_TYPES.includes(value as ItemTransferType)) return ["itemTransferType"];
  return [];
}

// § Kategori Keuangan — cuma 3 slot (Item Cls1-3), beda dari modul lain
// yang biasa 10 slot.
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

const ROOT_OPTIONAL_FIELDS = [
  ["branchName", "branchName", String] as const,
  ["differenceAccountNo", "differenceItemTransferAccountNo", String] as const,
  ["fromTransferNo", "fromItemTransferNo", String] as const,
  ["saveAsStatus", "saveAsStatusType", (v: unknown) => String(v).trim().toUpperCase()] as const,
  ["warehouseName", "warehouseName", String] as const,
  ["referenceWarehouseName", "referenceWarehouseName", String] as const,
];

const LINE_OPTIONAL_FIELDS = [
  ["itemName", "detailName", String] as const,
  ["itemNotes", "detailNotes", String] as const,
  ["departmentName", "departmentName", String] as const,
  ["projectNo", "projectNo", String] as const,
  ["salesOrderNumber", "salesOrderNumber", String] as const,
  ["attribut1", "dataClassification1Name", String] as const,
  ["attribut2", "dataClassification2Name", String] as const,
  ["attribut3", "dataClassification3Name", String] as const,
];

// § "Item Requisition No"/"Note Penting" — gabung ke `description`
// dengan format "{description asli} | No. Permintaan: X | Catatan: Y"
// (bagian kosong dilewati). § architecture doc.
function mergeDescription(baseDescription: unknown, requisitionNo: unknown, notePenting: unknown): string | undefined {
  const parts: string[] = [];
  if (baseDescription !== undefined && String(baseDescription).trim() !== "") parts.push(String(baseDescription).trim());
  if (requisitionNo !== undefined && String(requisitionNo).trim() !== "") parts.push(`No. Permintaan: ${String(requisitionNo).trim()}`);
  if (notePenting !== undefined && String(notePenting).trim() !== "") parts.push(`Catatan: ${String(notePenting).trim()}`);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const itemNoColumn = columnOf(columnMapping, "itemNo");
  const quantityColumn = columnOf(columnMapping, "quantity");
  const itemUnitNameColumn = columnOf(columnMapping, "itemUnitName");

  const detailItem: Record<string, unknown> = {
    itemNo: String((itemNoColumn && rawRow[itemNoColumn]) ?? ""),
    quantity: Number((quantityColumn && rawRow[quantityColumn]) ?? 0),
    itemUnitName: String((itemUnitNameColumn && rawRow[itemUnitNameColumn]) ?? ""),
  };

  for (const [field, accuratePath, cast] of LINE_OPTIONAL_FIELDS) {
    const value = valueOf(rawRow, columnOf(columnMapping, field));
    if (value !== undefined) detailItem[accuratePath] = cast(value);
  }

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

// § Terima ARRAY baris (1 grup = 1 Item Transfer, N item). Header
// (transDate/itemTransferType/dst) diambil dari baris PERTAMA grup,
// TIDAK divalidasi konsistensi antar-baris (§ architecture doc — modul
// ini tidak punya "pihak ketiga" seperti vendor yang perlu konsisten).
export function buildItemTransferPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const firstRow = rawRows[0] ?? {};
  const transDateColumn = columnOf(columnMapping, "transDate");
  const numberColumn = numberColumnOf(columnMapping);
  const itemTransferTypeColumn = columnOf(columnMapping, "itemTransferType");
  const descriptionColumn = columnOf(columnMapping, "description");
  const requisitionNoColumn = columnOf(columnMapping, "requisitionNo");
  const notePentingColumn = columnOf(columnMapping, "notePenting");

  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(valueOf(firstRow, transDateColumn)) ?? ""),
    itemTransferType: String(valueOf(firstRow, itemTransferTypeColumn) ?? "")
      .trim()
      .toUpperCase(),
    detailItem: rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping)),
  };

  const number = valueOf(firstRow, numberColumn);
  if (number !== undefined) payload.number = String(number);

  for (const [field, accuratePath, cast] of ROOT_OPTIONAL_FIELDS) {
    const value = valueOf(firstRow, columnOf(columnMapping, field));
    if (value !== undefined) payload[accuratePath] = cast(value);
  }

  const mergedDescription = mergeDescription(
    valueOf(firstRow, descriptionColumn),
    valueOf(firstRow, requisitionNoColumn),
    valueOf(firstRow, notePentingColumn),
  );
  if (mergedDescription !== undefined) payload.description = mergedDescription;

  return payload;
}
