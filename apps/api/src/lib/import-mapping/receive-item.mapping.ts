// § architecture-receive-item.md — Fase 121. Receive Item = bukti FISIK
// barang diterima dari vendor, dokumen LANJUTAN dalam rantai procurement
// (beda dari Purchase Order yang titik AWAL) — makanya TIDAK auto-create
// vendor/item (vendorNo/itemNo dikirim APA ADANYA, Accurate yang
// validasi eksistensi, mirror pola Purchase Payment). TIDAK ADA
// `detailExpense[]` sama sekali (dikonfirmasi spec + Excel client).
//
// § Kunci grouping BEDA dari Purchase Order — `receiveNumber` (nomor
// surat jalan vendor) REQUIRED per baris, BUKAN `number` (nomor
// transaksi internal Accurate, opsional) — lihat `groupReceiveItemRows`.
//
// § "ITEM: Description" (kolom Excel client) di-map ke `detailNotes`
// (BUKAN `detailName`) — diverifikasi dari struktur Excel client sendiri:
// sheet ini PUNYA kolom "Item Name" terpisah (→ `detailName`, § spec:
// "Nama/Deskripsi barang/jasa, kalau kosong pakai nama master barang"),
// jadi "ITEM: Description" pasti field lain, dan `detailNotes` ("Catatan
// tambahan untuk detail transaksi") paling konsisten dengan pola header
// "Description" (tanpa prefix ITEM) yang sudah mapping ke `description`
// generik. Tetap perlu 1x verifikasi test call nyata (§ phase doc Known
// Limitations) — spec resmi TIDAK menjelaskan beda dua field ini selain
// deskripsi teksnya.
//
// § `purchaseOrderNumber` (link balik ke Purchase Order) SENGAJA
// ditambahkan sebagai kolom OPSIONAL walau TIDAK diminta di Excel client
// — dikonfirmasi eksplisit oleh user sebelum eksekusi Fase 121 (nilai
// bisnis: menutup rantai PO→Receive Item di Accurate, field API sudah
// resmi ada di spec).
export const receiveItemMapping = {
  requiredFields: ["vendorNo", "transDate", "receiveNumber", "itemNo", "unitPrice", "quantity", "itemUnitName", "branchName"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    transDate: "transDate",
    receiveNumber: "receiveNumber", // § nomor surat jalan vendor — WAJIB, kunci grouping
    number: "number", // nomor transaksi internal Accurate — opsional, kosongkan utk auto-number
    branchName: "branchName",
    description: "description",
    currencyCode: "currencyCode",
    fobName: "fobName",
    shipDate: "shipDate",
    shipmentName: "shipmentName",
    toAddress: "toAddress",
    // Atribut Tambahan level HEADER (beda dari Purchase Order yang cuma
    // level ITEM — Excel client Receive Item minta KEDUA level).
    attributHeaderKarakter1: "charField1",
    attributHeaderKarakter2: "charField2",
    attributHeaderKarakter3: "charField3",
    attributHeaderKarakter4: "charField4",
    attributHeaderKarakter5: "charField5",
    attributHeaderKarakter6: "charField6",
    attributHeaderKarakter7: "charField7",
    attributHeaderKarakter8: "charField8",
    attributHeaderKarakter9: "charField9",
    attributHeaderKarakter10: "charField10",
    attributHeaderAngka1: "numericField1",
    attributHeaderAngka2: "numericField2",
    attributHeaderAngka3: "numericField3",
    attributHeaderAngka4: "numericField4",
    attributHeaderAngka5: "numericField5",
    attributHeaderAngka6: "numericField6",
    attributHeaderAngka7: "numericField7",
    attributHeaderAngka8: "numericField8",
    attributHeaderAngka9: "numericField9",
    attributHeaderAngka10: "numericField10",
    attributHeaderTanggal1: "dateField1",
    attributHeaderTanggal2: "dateField2",
    // detailItem
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    warehouseName: "detailItem.warehouseName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    purchaseOrderNumber: "detailItem.purchaseOrderNumber",
    // Kategori Keuangan level ITEM.
    attribut1: "detailItem.dataClassification1Name",
    attribut2: "detailItem.dataClassification2Name",
    attribut3: "detailItem.dataClassification3Name",
    attribut4: "detailItem.dataClassification4Name",
    attribut5: "detailItem.dataClassification5Name",
    attribut6: "detailItem.dataClassification6Name",
    attribut7: "detailItem.dataClassification7Name",
    attribut8: "detailItem.dataClassification8Name",
    attribut9: "detailItem.dataClassification9Name",
    attribut10: "detailItem.dataClassification10Name",
    // Atribut Tambahan level ITEM (15 slot char tersedia di API, Excel
    // client cuma pakai 10 — sama pola Purchase Order).
    attributItemKarakter1: "detailItem.charField1",
    attributItemKarakter2: "detailItem.charField2",
    attributItemKarakter3: "detailItem.charField3",
    attributItemKarakter4: "detailItem.charField4",
    attributItemKarakter5: "detailItem.charField5",
    attributItemKarakter6: "detailItem.charField6",
    attributItemKarakter7: "detailItem.charField7",
    attributItemKarakter8: "detailItem.charField8",
    attributItemKarakter9: "detailItem.charField9",
    attributItemKarakter10: "detailItem.charField10",
    attributItemKarakter11: "detailItem.charField11",
    attributItemKarakter12: "detailItem.charField12",
    attributItemKarakter13: "detailItem.charField13",
    attributItemKarakter14: "detailItem.charField14",
    attributItemKarakter15: "detailItem.charField15",
    attributItemAngka1: "detailItem.numericField1",
    attributItemAngka2: "detailItem.numericField2",
    attributItemAngka3: "detailItem.numericField3",
    attributItemAngka4: "detailItem.numericField4",
    attributItemAngka5: "detailItem.numericField5",
    attributItemAngka6: "detailItem.numericField6",
    attributItemAngka7: "detailItem.numericField7",
    attributItemAngka8: "detailItem.numericField8",
    attributItemAngka9: "detailItem.numericField9",
    attributItemAngka10: "detailItem.numericField10",
    attributItemTanggal1: "detailItem.dateField1",
    attributItemTanggal2: "detailItem.dateField2",
  } as const,
  defaultColumnMap: {
    Date: "transDate",
    "Vendor No": "vendorNo",
    "Receive Number": "receiveNumber",
    "Trans Number": "number",
    "Currency Code": "currencyCode",
    Description: "description",
    "FOB Name": "fobName",
    "Shipment Name": "shipmentName",
    "Shipment Date": "shipDate",
    "To Address": "toAddress",
    "Branch Name": "branchName",
    "Custom Character 1": "attributHeaderKarakter1",
    "Custom Character 2": "attributHeaderKarakter2",
    "Custom Character 3": "attributHeaderKarakter3",
    "Custom Character 4": "attributHeaderKarakter4",
    "Custom Character 5": "attributHeaderKarakter5",
    "Custom Character 6": "attributHeaderKarakter6",
    "Custom Character 7": "attributHeaderKarakter7",
    "Custom Character 8": "attributHeaderKarakter8",
    "Custom Character 9": "attributHeaderKarakter9",
    "Custom Character 10": "attributHeaderKarakter10",
    "Custom Number 1": "attributHeaderAngka1",
    "Custom Number 2": "attributHeaderAngka2",
    "Custom Number 3": "attributHeaderAngka3",
    "Custom Number 4": "attributHeaderAngka4",
    "Custom Number 5": "attributHeaderAngka5",
    "Custom Number 6": "attributHeaderAngka6",
    "Custom Number 7": "attributHeaderAngka7",
    "Custom Number 8": "attributHeaderAngka8",
    "Custom Number 9": "attributHeaderAngka9",
    "Custom Number 10": "attributHeaderAngka10",
    "Custom Date 1": "attributHeaderTanggal1",
    "Custom Date 2": "attributHeaderTanggal2",
    "Item No": "itemNo",
    "Item Name": "itemName",
    Quantity: "quantity",
    "Unit Name": "itemUnitName",
    "Item Warehouse": "warehouseName",
    "ITEM: Department": "departmentName",
    "ITEM: Project No": "projectNo",
    "ITEM: Description": "itemNotes",
    "ITEM: Purchase Order No": "purchaseOrderNumber",
    "ITEM: Finance Category 1": "attribut1",
    "ITEM: Finance Category 2": "attribut2",
    "ITEM: Finance Category 3": "attribut3",
    "ITEM: Finance Category 4": "attribut4",
    "ITEM: Finance Category 5": "attribut5",
    "ITEM: Finance Category 6": "attribut6",
    "ITEM: Finance Category 7": "attribut7",
    "ITEM: Finance Category 8": "attribut8",
    "ITEM: Finance Category 9": "attribut9",
    "ITEM: Finance Category 10": "attribut10",
    "ITEM: Custom Character 1": "attributItemKarakter1",
    "ITEM: Custom Character 2": "attributItemKarakter2",
    "ITEM: Custom Character 3": "attributItemKarakter3",
    "ITEM: Custom Character 4": "attributItemKarakter4",
    "ITEM: Custom Character 5": "attributItemKarakter5",
    "ITEM: Custom Character 6": "attributItemKarakter6",
    "ITEM: Custom Character 7": "attributItemKarakter7",
    "ITEM: Custom Character 8": "attributItemKarakter8",
    "ITEM: Custom Character 9": "attributItemKarakter9",
    "ITEM: Custom Character 10": "attributItemKarakter10",
    "ITEM: Custom Number 1": "attributItemAngka1",
    "ITEM: Custom Number 2": "attributItemAngka2",
    "ITEM: Custom Number 3": "attributItemAngka3",
    "ITEM: Custom Number 4": "attributItemAngka4",
    "ITEM: Custom Number 5": "attributItemAngka5",
    "ITEM: Custom Number 6": "attributItemAngka6",
    "ITEM: Custom Number 7": "attributItemAngka7",
    "ITEM: Custom Number 8": "attributItemAngka8",
    "ITEM: Custom Number 9": "attributItemAngka9",
    "ITEM: Custom Number 10": "attributItemAngka10",
    "ITEM: Custom Date 1": "attributItemTanggal1",
    "ITEM: Custom Date 2": "attributItemTanggal2",
  } as Record<string, string>,
};

export type ReceiveItemField = keyof typeof receiveItemMapping.fieldToAccuratePath;

const DATE_FIELDS = new Set<ReceiveItemField>(["transDate", "shipDate", "attributHeaderTanggal1", "attributHeaderTanggal2", "attributItemTanggal1", "attributItemTanggal2"]);
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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<ReceiveItemField, unknown>> {
  const values: Partial<Record<ReceiveItemField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as ReceiveItemField;
      const raw = rawRow[excelColumn];
      values[f] = DATE_FIELDS.has(f) ? toAccurateDate(raw) : raw;
    }
  }
  return values;
}

export function buildReceiveItemPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(receiveItemMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.")) continue;
    const value = headerValues[field as ReceiveItemField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  return payload;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(receiveItemMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as ReceiveItemField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type ReceiveItemGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

export function receiveNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "receiveNumber")?.[0] ?? null;
}

function valueOfColumn(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping MURNI by "Receive Number" (`receiveNumber`, WAJIB di
// `requiredFields`) — BEDA dari semua modul lain yang grouping by
// `number` (nomor transaksi INTERNAL Accurate, opsional). Baris tanpa
// Receive Number (mustahil lolos validasi confirm, tapi tetap dijaga)
// jadi grup sendiri.
export function groupReceiveItemRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): ReceiveItemGroup[] {
  const receiveNumberColumn = receiveNumberColumnOf(columnMapping);
  const groups: ReceiveItemGroup[] = [];
  const byKey = new Map<string, ReceiveItemGroup>();

  for (const row of rows) {
    const groupKey = valueOfColumn(row, receiveNumberColumn);
    if (groupKey === null || receiveNumberColumn === null) {
      groups.push({ groupKey: null, groupColumn: null, rows: [row] });
      continue;
    }
    const mapKey = groupKey.toLowerCase();
    let group = byKey.get(mapKey);
    if (!group) {
      group = { groupKey, groupColumn: receiveNumberColumn, rows: [] };
      byKey.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

export function validateGroupVendorConsistency(group: ReceiveItemGroup, columnMapping: Record<string, string>): string | null {
  const vendorNoColumn = Object.entries(columnMapping).find(([, field]) => field === "vendorNo")?.[0];
  if (!vendorNoColumn) return null;

  const vendorNos = new Set(
    group.rows
      .map((row) => row.rawData[vendorNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (vendorNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Receive Number)";
  return `Receive Number "${label}" dipakai untuk vendor berbeda-beda (${[...vendorNos].join(", ")}) — pastikan semua baris 1 Receive Item pakai Nomor Vendor yang sama.`;
}

export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const excelColumn = Object.entries(columnMapping).find(([, f]) => f === `attribut${index}`)?.[0];
    const value = excelColumn ? rawRow[excelColumn] : undefined;
    if (value === undefined || value === "") continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}
