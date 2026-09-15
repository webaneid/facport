// § architecture-sales-return.md — Fase 124. Sales Return adalah
// dokumen LANJUTAN (retur terhadap transaksi yang sudah ada) — TIDAK
// auto-create customer/item, mirror Purchase Return. BUKAN mirror
// PERSIS Purchase Return — 2 perbedaan struktural: `returnStatusType`
// (root, field internal `returnStatusType`) BEDA dari
// `returnDetailStatusType` (item, field internal `itemReturnStatusType`
// — JANGAN disatukan, § architecture doc keputusan desain #5), dan
// `detailSerialNumber[]` NESTED 2 LEVEL di dalam `detailItem[]` (belum
// ada preseden modul lain di project ini).
//
// § `returnType` (enum REQUIRED: DELIVERY | INVOICE | INVOICE_DP |
// NO_INVOICE) — SEMUA 4 nilai DIDUKUNG (dikonfirmasi user, § architecture
// doc "Keputusan Scope" update 2026-09-15, konsisten Purchase Return):
// DELIVERY butuh `deliveryOrderNumber`, INVOICE/INVOICE_DP butuh
// `invoiceNumber`, NO_INVOICE tidak butuh keduanya.
//
// § `detailExpense` masuk `required` di top-level schema OpenAPI TAPI
// item schema-nya sendiri tidak punya required field — payload SELALU
// sertakan `detailExpense` (default array KOSONG `[]`), sama pola
// Purchase Return.
export const RETURN_TYPES = ["DELIVERY", "INVOICE", "INVOICE_DP", "NO_INVOICE"] as const;
export type SalesReturnType = (typeof RETURN_TYPES)[number];

export const salesReturnMapping = {
  requiredFields: ["customerNo", "transDate", "taxDate", "taxNumber", "returnType", "itemNo", "unitPrice", "quantity", "itemUnitName", "branchName"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    transDate: "transDate",
    number: "number", // Retur No — opsional, kunci grouping DEFAULT
    invoiceNumber: "invoiceNumber", // kondisional: WAJIB kalau returnType INVOICE/INVOICE_DP
    deliveryOrderNumber: "deliveryOrderNumber", // kondisional: WAJIB kalau returnType DELIVERY
    returnType: "returnType",
    toAddress: "toAddress",
    description: "description",
    currencyCode: "currencyCode",
    rate: "rate",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    returnStatusType: "returnStatusType", // § LEVEL ROOT, beda dari itemReturnStatusType
    paymentTermName: "paymentTermName",
    taxable: "taxable",
    inclusiveTax: "inclusiveTax",
    taxDate: "taxDate",
    taxNumber: "taxNumber",
    branchName: "branchName",
    fiscalRate: "fiscalRate",
    fobName: "fobName",
    shipmentName: "shipmentName",
    // Atribut Tambahan level HEADER — Excel client CUMA 3 slot Karakter
    // + 2 slot Tanggal (dari 10/10/2 yang tersedia), TIDAK ADA Angka.
    attributHeaderKarakter1: "charField1",
    attributHeaderKarakter2: "charField2",
    attributHeaderKarakter3: "charField3",
    attributHeaderTanggal1: "dateField1",
    attributHeaderTanggal2: "dateField2",
    // detailItem
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    itemReturnStatusType: "detailItem.returnDetailStatusType", // § LEVEL ITEM, beda dari returnStatusType
    projectNo: "detailItem.projectNo",
    departmentName: "detailItem.departmentName",
    warehouseName: "detailItem.warehouseName",
    itemCashDiscount: "detailItem.itemCashDiscount",
    itemDiscPercent: "detailItem.itemDiscPercent",
    useTax1: "detailItem.useTax1",
    useTax2: "detailItem.useTax2",
    useTax3: "detailItem.useTax3",
    // Kategori Keuangan level ITEM — Excel client CUMA 3 slot (CLS1-3).
    attribut1: "detailItem.dataClassification1Name",
    attribut2: "detailItem.dataClassification2Name",
    attribut3: "detailItem.dataClassification3Name",
    // § detailSerialNumber[] — NESTED, SENGAJA prefix "detailSerialNumber."
    // (bukan "detailItem.") supaya TIDAK ikut ke-flatten oleh
    // `buildDetailItemFromRow` generik, ditangani terpisah oleh
    // `buildDetailSerialNumberFromRow`.
    itemSerialNo: "detailSerialNumber.serialNumberNo",
    itemSerialQty: "detailSerialNumber.quantity",
    itemSerialExpDate: "detailSerialNumber.expiredDate",
    // detailExpense
    expenseAccountNo: "detailExpense.accountNo",
    expenseName: "detailExpense.expenseName",
    expenseAmount: "detailExpense.expenseAmount",
    expenseNotes: "detailExpense.expenseNotes",
    expenseDepartmentName: "detailExpense.departmentName",
    expenseSalesOrderNo: "detailExpense.salesOrderNumber",
    expenseSalesQuotationNo: "detailExpense.salesQuotationNumber",
    expenseKategoriKeuangan1: "detailExpense.dataClassification1Name",
    expenseKategoriKeuangan2: "detailExpense.dataClassification2Name",
    expenseKategoriKeuangan3: "detailExpense.dataClassification3Name",
  } as const,
  defaultColumnMap: {
    "Transaction Date": "transDate",
    "Invoice No": "invoiceNumber",
    "Retur No": "number",
    "Customer No": "customerNo",
    "Return Type": "returnType",
    "To Address": "toAddress",
    "Transaction Description": "description",
    "Delivery Order No": "deliveryOrderNumber",
    "Currency Code": "currencyCode",
    Rate: "rate",
    "Cash Disc": "cashDiscount",
    "Cash Disc Percent": "cashDiscPercent",
    "Return Status Type": "returnStatusType",
    "Payment Term Name": "paymentTermName",
    Taxable: "taxable",
    "Inclusive Tax": "inclusiveTax",
    "Tax Date": "taxDate",
    "Tax Number": "taxNumber",
    "Branch Name": "branchName",
    "Fiscal Rate": "fiscalRate",
    "FOB Name": "fobName",
    "Shipment Name": "shipmentName",
    "Header - CF1": "attributHeaderKarakter1",
    "Header - CF2": "attributHeaderKarakter2",
    "Header - CF3": "attributHeaderKarakter3",
    "Header - DF1": "attributHeaderTanggal1",
    "Header - DF2": "attributHeaderTanggal2",
    "Item No": "itemNo",
    "Item Name": "itemName",
    "Item Unit Price": "unitPrice",
    "Item Qty": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Note": "itemNotes",
    "Item Return Status Type": "itemReturnStatusType",
    "Item Project No": "projectNo",
    "Item Department": "departmentName",
    "Item Warehouse": "warehouseName",
    "Item Cash Discount": "itemCashDiscount",
    "Item Cash Disc Percent": "itemDiscPercent",
    "Item PPN (VAT)": "useTax1",
    "Item PPNMB": "useTax2",
    "Item PPH": "useTax3",
    "Item CLS1": "attribut1",
    "Item CLS2": "attribut2",
    "Item CLS3": "attribut3",
    "Item Serial No": "itemSerialNo",
    "Item Serial Number Qty": "itemSerialQty",
    "Item Serial Number Exp Date": "itemSerialExpDate",
    "Expense Account No": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    "Expense Note": "expenseNotes",
    "Expense Department": "expenseDepartmentName",
    "Expense Sales Order No": "expenseSalesOrderNo",
    "Expense Sales Quotation No": "expenseSalesQuotationNo",
    "Expense CLS1": "expenseKategoriKeuangan1",
    "Expense CLS2": "expenseKategoriKeuangan2",
    "Expense CLS3": "expenseKategoriKeuangan3",
  } as Record<string, string>,
};

export type SalesReturnField = keyof typeof salesReturnMapping.fieldToAccuratePath;

const DATE_FIELDS = new Set<SalesReturnField>(["transDate", "taxDate", "attributHeaderTanggal1", "attributHeaderTanggal2", "itemSerialExpDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const BOOLEAN_FIELDS = new Set<SalesReturnField>(["taxable", "inclusiveTax", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
const PERCENT_STRING_FIELDS = new Set<SalesReturnField>(["cashDiscPercent", "itemDiscPercent"]);

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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<SalesReturnField, unknown>> {
  const values: Partial<Record<SalesReturnField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as SalesReturnField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else values[f] = raw;
    }
  }
  return values;
}

// § Validasi `returnType` (§ architecture doc) — mirror
// `returnTypeRowError` Purchase Return, TAPI 4 nilai dengan susunan
// BEDA (DELIVERY di sini, RECEIVE di Purchase Return) dan field
// companion beda (deliveryOrderNumber vs receiveItemNumber).
export function returnTypeRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const values = extractRowValues(rawRow, columnMapping);
  const returnType = values.returnType !== undefined ? String(values.returnType).trim().toUpperCase() : "";

  if (!RETURN_TYPES.includes(returnType as SalesReturnType)) return ["returnType"];
  if (returnType === "DELIVERY" && values.deliveryOrderNumber === undefined) return ["deliveryOrderNumber"];
  if ((returnType === "INVOICE" || returnType === "INVOICE_DP") && values.invoiceNumber === undefined) return ["invoiceNumber"];
  return [];
}

export function buildSalesReturnPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);
  if (headerValues.returnType !== undefined) headerValues.returnType = String(headerValues.returnType).trim().toUpperCase();

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesReturnMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.") || accuratePath.startsWith("detailSerialNumber.")) continue;
    const value = headerValues[field as SalesReturnField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  // § `detailExpense` SELALU disertakan (default [] kalau kosong) —
  // sama pola Purchase Return.
  payload.detailExpense = rawRows.map((rawRow) => buildDetailExpenseFromRow(rawRow, columnMapping)).filter((entry): entry is Record<string, unknown> => entry !== null);

  return payload;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesReturnMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as SalesReturnField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }

  const serial = buildDetailSerialNumberFromRow(rawRow, columnMapping);
  if (serial) detailItem.detailSerialNumber = [serial];

  return detailItem;
}

// § `detailSerialNumber[]` — NESTED 2 level di dalam `detailItem[]`,
// tracking barang bernomor seri (jarang dipakai, tapi diminta eksplisit
// Excel client). Syarat minimal 1 baris punya data: `serialNumberNo`
// DAN `quantity` harus SAMA-SAMA terisi (mirror pola
// `buildDetailExpenseFromRow` — TIDAK dikirim setengah-setengah).
export function buildDetailSerialNumberFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const serial: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesReturnMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailSerialNumber.")) continue;
    const value = rowValues[field as SalesReturnField];
    if (value !== undefined) serial[accuratePath.slice("detailSerialNumber.".length)] = value;
  }
  if (serial.serialNumberNo === undefined || serial.quantity === undefined) return null;
  return serial;
}

// § syarat minimal 1 baris dianggap punya data Beban: accountNo DAN
// expenseAmount harus SAMA-SAMA terisi (pola sama modul lain).
export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesReturnMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as SalesReturnField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesReturnGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

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

// § grouping DEFAULT ADR-0011 by "Retur No" ("number", OPSIONAL).
export function groupSalesReturnRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesReturnGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: SalesReturnGroup[] = [];
  const byKey = new Map<string, SalesReturnGroup>();

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

export function validateGroupCustomerConsistency(group: SalesReturnGroup, columnMapping: Record<string, string>): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Retur No)";
  return `Nomor grup "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 Sales Return pakai Nomor Customer yang sama.`;
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
