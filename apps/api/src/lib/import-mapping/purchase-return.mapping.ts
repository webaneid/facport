// § architecture-purchase-return.md — Fase 122. Purchase Return adalah
// dokumen LANJUTAN (retur terhadap transaksi yang sudah ada) — TIDAK
// auto-create vendor/item, mirror Receive Item/Purchase Payment.
// Grouping DEFAULT ADR-0011 (kunci "number"/TransNo, OPSIONAL — beda
// dari Receive Item yang grouping-nya wajib by receiveNumber).
//
// § `returnType` (enum REQUIRED: INVOICE | INVOICE_DP | RECEIVE |
// NO_INVOICE) menentukan field companion mana yang wajib — SEMUA 4
// nilai didukung (dikonfirmasi user, § architecture doc "Keputusan
// Scope" update 2026-09-15): INVOICE/INVOICE_DP butuh `invoiceNumber`,
// RECEIVE butuh `receiveItemNumber`, NO_INVOICE tidak butuh keduanya.
//
// § `detailExpense` masuk `required` di top-level schema OpenAPI, TAPI
// item schema-nya sendiri TIDAK punya required field — payload SELALU
// sertakan `detailExpense` (default array KOSONG `[]` kalau tidak ada
// baris Beban), BEDA dari Purchase Order yang omit key sepenuhnya kalau
// kosong. BELUM diverifikasi test call nyata (§ Known Limitations).
//
// § 2 kolom Excel client TIDAK ADA field API-nya (dikonfirmasi
// `accurate-openapi.json`, BUKAN kelalaian mapping): "Item Warehouse"
// (`detailItem[]` tidak punya `warehouseName`) dan "Expense Project"
// (`detailExpense[]` tidak punya `projectNo`) — keduanya SENGAJA tidak
// dimasukkan `defaultColumnMap`.
export const RETURN_TYPES = ["INVOICE", "INVOICE_DP", "RECEIVE", "NO_INVOICE"] as const;
export type PurchaseReturnType = (typeof RETURN_TYPES)[number];

export const purchaseReturnMapping = {
  requiredFields: ["vendorNo", "transDate", "taxDate", "taxNumber", "returnType", "itemNo", "unitPrice", "quantity", "itemUnitName", "branchName"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    transDate: "transDate",
    number: "number", // TransNo — opsional, kunci grouping DEFAULT (kosong = 1 baris = 1 retur)
    invoiceNumber: "invoiceNumber", // kondisional: WAJIB kalau returnType INVOICE/INVOICE_DP
    receiveItemNumber: "receiveItemNumber", // kondisional: WAJIB kalau returnType RECEIVE
    returnType: "returnType",
    toAddress: "toAddress",
    branchName: "branchName",
    description: "description",
    taxDate: "taxDate",
    taxNumber: "taxNumber",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    currencyCode: "currencyCode",
    rate: "rate",
    fiscalRate: "fiscalRate",
    fobName: "fobName",
    taxable: "taxable",
    inclusiveTax: "inclusiveTax",
    paymentTermName: "paymentTermName",
    shipmentName: "shipmentName",
    // detailItem — TIDAK ADA warehouseName (dikonfirmasi tidak ada di API).
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
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
    // detailExpense — TIDAK ADA projectNo (dikonfirmasi tidak ada di API).
    expenseAccountNo: "detailExpense.accountNo",
    expenseName: "detailExpense.expenseName",
    expenseAmount: "detailExpense.expenseAmount",
    expenseNotes: "detailExpense.expenseNotes",
    expenseDepartmentName: "detailExpense.departmentName",
    expenseKategoriKeuangan1: "detailExpense.dataClassification1Name",
    expenseKategoriKeuangan2: "detailExpense.dataClassification2Name",
    expenseKategoriKeuangan3: "detailExpense.dataClassification3Name",
    expenseKategoriKeuangan4: "detailExpense.dataClassification4Name",
    expenseKategoriKeuangan5: "detailExpense.dataClassification5Name",
    expenseKategoriKeuangan6: "detailExpense.dataClassification6Name",
    expenseKategoriKeuangan7: "detailExpense.dataClassification7Name",
    expenseKategoriKeuangan8: "detailExpense.dataClassification8Name",
    expenseKategoriKeuangan9: "detailExpense.dataClassification9Name",
    expenseKategoriKeuangan10: "detailExpense.dataClassification10Name",
  } as const,
  defaultColumnMap: {
    Date: "transDate",
    TransNo: "number",
    "Invoice No": "invoiceNumber",
    "Receive Item No": "receiveItemNumber",
    "Vendor No": "vendorNo",
    "Return Type": "returnType",
    "To Address": "toAddress",
    Branch: "branchName",
    Notes: "description",
    "Tax Date": "taxDate",
    "Tax Num": "taxNumber",
    "Cash Disc": "cashDiscount",
    "Cash Disc %": "cashDiscPercent",
    "Currency Code": "currencyCode",
    Rate: "rate",
    "Fiscal Rate": "fiscalRate",
    FOB: "fobName",
    Taxable: "taxable",
    "Include Tax": "inclusiveTax",
    "Pay Term": "paymentTermName",
    "Shipment Name": "shipmentName",
    "Item No": "itemNo",
    "Item Name": "itemName",
    "Item Qty": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Notes": "itemNotes",
    "Item Department": "departmentName",
    "Item Project No": "projectNo",
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
    "Expense Acc No": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    "Expense Notes": "expenseNotes",
    "Expense Department": "expenseDepartmentName",
    "EXPENSE: Finance Category 1": "expenseKategoriKeuangan1",
    "EXPENSE: Finance Category 2": "expenseKategoriKeuangan2",
    "EXPENSE: Finance Category 3": "expenseKategoriKeuangan3",
    "EXPENSE: Finance Category 4": "expenseKategoriKeuangan4",
    "EXPENSE: Finance Category 5": "expenseKategoriKeuangan5",
    "EXPENSE: Finance Category 6": "expenseKategoriKeuangan6",
    "EXPENSE: Finance Category 7": "expenseKategoriKeuangan7",
    "EXPENSE: Finance Category 8": "expenseKategoriKeuangan8",
    "EXPENSE: Finance Category 9": "expenseKategoriKeuangan9",
    "EXPENSE: Finance Category 10": "expenseKategoriKeuangan10",
    // § "Item Warehouse"/"Expense Project" SENGAJA TIDAK dipetakan —
    // tidak ada field API untuk keduanya di endpoint ini.
  } as Record<string, string>,
};

export type PurchaseReturnField = keyof typeof purchaseReturnMapping.fieldToAccuratePath;

const DATE_FIELDS = new Set<PurchaseReturnField>(["transDate", "taxDate", "attributItemTanggal1", "attributItemTanggal2"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const BOOLEAN_FIELDS = new Set<PurchaseReturnField>(["taxable", "inclusiveTax"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
const PERCENT_STRING_FIELDS = new Set<PurchaseReturnField>(["cashDiscPercent"]);

function toAccurateBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUE_TEXT_VALUES.has(value.trim().toLowerCase());
  return value;
}

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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<PurchaseReturnField, unknown>> {
  const values: Partial<Record<PurchaseReturnField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as PurchaseReturnField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else values[f] = raw;
    }
  }
  return values;
}

// § Validasi `returnType` (§ architecture doc) — dipanggil SEBELUM
// payload dibangun (worker, dari header/baris pertama grup) DAN per
// baris di edit-row/edit-bulk (mirror `debitCreditRowError` Journal
// Voucher: return array nama field internal yang error, [] kalau valid).
export function returnTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const values = extractRowValues(rawRow, columnMapping);
  const returnType = values.returnType !== undefined ? String(values.returnType).trim().toUpperCase() : "";

  if (!RETURN_TYPES.includes(returnType as PurchaseReturnType)) return ["returnType"];
  if ((returnType === "INVOICE" || returnType === "INVOICE_DP") && values.invoiceNumber === undefined) return ["invoiceNumber"];
  if (returnType === "RECEIVE" && values.receiveItemNumber === undefined) return ["receiveItemNumber"];
  return [];
}

export function buildPurchaseReturnPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);
  if (headerValues.returnType !== undefined) headerValues.returnType = String(headerValues.returnType).trim().toUpperCase();

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseReturnMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as PurchaseReturnField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  // § `detailExpense` SELALU disertakan (default [] kalau kosong) —
  // BEDA dari Purchase Order, § komentar atas file ini.
  payload.detailExpense = rawRows.map((rawRow) => buildDetailExpenseFromRow(rawRow, columnMapping)).filter((entry): entry is Record<string, unknown> => entry !== null);

  return payload;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseReturnMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as PurchaseReturnField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § syarat minimal 1 baris dianggap punya data Beban: accountNo DAN
// expenseAmount harus SAMA-SAMA terisi (pola sama modul lain).
export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseReturnMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as PurchaseReturnField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type PurchaseReturnGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "number")?.[0] ?? null;
}

function valueOfColumn(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping DEFAULT ADR-0011 by "TransNo" ("number", OPSIONAL) — beda
// dari Receive Item yang grouping-nya WAJIB by receiveNumber. Baris
// tanpa TransNo (atau kolomnya tidak di-mapping) jadi grup sendiri
// (behavior lama/default, konsisten modul lain).
export function groupPurchaseReturnRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): PurchaseReturnGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: PurchaseReturnGroup[] = [];
  const byKey = new Map<string, PurchaseReturnGroup>();

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

export function validateGroupVendorConsistency(group: PurchaseReturnGroup, columnMapping: Record<string, string>): string | null {
  const vendorNoColumn = Object.entries(columnMapping).find(([, field]) => field === "vendorNo")?.[0];
  if (!vendorNoColumn) return null;

  const vendorNos = new Set(
    group.rows
      .map((row) => row.rawData[vendorNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (vendorNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa TransNo)";
  return `Nomor grup "${label}" dipakai untuk vendor berbeda-beda (${[...vendorNos].join(", ")}) — pastikan semua baris 1 Purchase Return pakai Nomor Vendor yang sama.`;
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

export function extractExpenseDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const excelColumn = Object.entries(columnMapping).find(([, f]) => f === `expenseKategoriKeuangan${index}`)?.[0];
    const value = excelColumn ? rawRow[excelColumn] : undefined;
    if (value === undefined || value === "") continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}
