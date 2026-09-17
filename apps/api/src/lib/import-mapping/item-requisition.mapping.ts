// § architecture-item-requisition.md — kembaran `item-transfer.mapping.ts`
// (SATU-SATUNYA beda: sheet ini TIDAK punya kolom "Item Requisition No",
// jadi TIDAK ada field `requisitionNo`/merge itu — `description` cuma
// digabung "Note Penting"). Panggil endpoint API yang SAMA
// (`/api/item-transfer/save.do`, via `saveItemTransfer()` yang di-share,
// § `lib/accurate-item-transfer.ts`). SENGAJA duplikat penuh (bukan
// extend/reuse `itemTransferMapping`) — konsisten pola project ini
// (Other Payment/Other Deposit dkk, "3 file mirip lebih baik dari
// abstraksi prematur", § architecture doc "Konteks").
export const itemRequisitionMapping = {
  requiredFields: ["transDate", "number", "itemTransferType", "branchName", "itemNo", "quantity", "itemUnitName"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number",
    itemTransferType: "itemTransferType",
    branchName: "branchName",
    description: "description",
    differenceAccountNo: "differenceItemTransferAccountNo",
    fromTransferNo: "fromItemTransferNo",
    saveAsStatus: "saveAsStatusType",
    warehouseName: "warehouseName",
    referenceWarehouseName: "referenceWarehouseName",
    notePenting: "$merge.description",
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemNotes: "detailItem.detailNotes",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    salesOrderNumber: "detailItem.salesOrderNumber",
    attribut1: "detailItem.dataClassification1Name",
    attribut2: "detailItem.dataClassification2Name",
    attribut3: "detailItem.dataClassification3Name",
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
  } as const,
  // § URUTAN kolom mengikuti PERSIS sheet "Item Requisition"
  // (developmen-15-september-2026.xlsx) — SAMA sheet "Item Transfer"
  // MINUS "Item Requisition No".
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
    "Item Cls1": "attribut1",
    "Item Cls2": "attribut2",
    "Item Cls3": "attribut3",
    "Serial No": "serialNo",
    "Serial Qty": "serialQty",
    "Serial ExpDate": "serialExpDate",
    "Note Penting": "notePenting",
  } as Record<string, string>,
};

export type ItemRequisitionField = keyof typeof itemRequisitionMapping.fieldToAccuratePath;

export const ITEM_TRANSFER_TYPES = ["TRANSFER_IN", "TRANSFER_OUT"] as const;
export type ItemTransferType = (typeof ITEM_TRANSFER_TYPES)[number];

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

export function itemTransferTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const column = columnOf(columnMapping, "itemTransferType");
  const raw = valueOf(rawRow, column);
  const value = raw !== undefined ? String(raw).trim().toUpperCase() : "";
  if (!ITEM_TRANSFER_TYPES.includes(value as ItemTransferType)) return ["itemTransferType"];
  return [];
}

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

// § HANYA "Note Penting" digabung (§ komentar atas — tidak ada
// "Item Requisition No" di sheet ini).
function mergeDescription(baseDescription: unknown, notePenting: unknown): string | undefined {
  const parts: string[] = [];
  if (baseDescription !== undefined && String(baseDescription).trim() !== "") parts.push(String(baseDescription).trim());
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

export function buildItemRequisitionPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const firstRow = rawRows[0] ?? {};
  const transDateColumn = columnOf(columnMapping, "transDate");
  const numberColumn = numberColumnOf(columnMapping);
  const itemTransferTypeColumn = columnOf(columnMapping, "itemTransferType");
  const descriptionColumn = columnOf(columnMapping, "description");
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

  const mergedDescription = mergeDescription(valueOf(firstRow, descriptionColumn), valueOf(firstRow, notePentingColumn));
  if (mergedDescription !== undefined) payload.description = mergedDescription;

  return payload;
}
