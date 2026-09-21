// § architecture-sales-order.md — Fase 137. Sales Order = kelanjutan
// LANGSUNG Sales Quotation (client mengonfirmasi penawaran jadi pesanan
// resmi), TETAP dokumen non-akuntansi (tidak ada jurnal/stok). Mirror
// PERSIS pola `sales-quotation.mapping.ts`: auto-create Customer+Item,
// grouping DEFAULT ADR-0011 (kunci "number"/Trans No, OPSIONAL), TIDAK
// ADA "Batal Import". Field TAMBAHAN vs Sales Quotation: `poNumber`
// (referensi PO customer) dan `salesmanListNumber[]` (ARRAY beneran,
// di-split dari 1 kolom Excel "Sales List No (separate with comma)" —
// BEDA dari Sales Quotation yang cuma wrap 1 nilai jadi array 1-elemen).
// Field mapping SUDAH diverifikasi 100% ke portal developer Accurate
// live (2026-09-21, § architecture doc) — TIDAK ada gap dokumentasi API.
export const salesOrderMapping = {
  requiredFields: ["customerNo", "transDate", "itemNo", "unitPrice", "quantity", "itemUnitName", "branchName"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    number: "number", // Trans No — opsional, kunci grouping DEFAULT (kosong = 1 baris = 1 sales order)
    customerNo: "customerNo",
    paymentTermName: "paymentTermName",
    toAddress: "toAddress",
    description: "description",
    poNumber: "poNumber", // § field BARU vs Sales Quotation — referensi PO customer
    branchName: "branchName",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    currencyCode: "currencyCode",
    rate: "rate",
    fobName: "fobName",
    shipDate: "shipDate",
    shipmentName: "shipmentName",
    inclusiveTax: "inclusiveTax",
    taxable: "taxable",
    // detailItem
    itemNo: "detailItem.itemNo",
    itemName: "detailItem.detailName",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemNotes: "detailItem.detailNotes",
    salesQuotationNumber: "detailItem.salesQuotationNumber",
    itemCashDiscount: "detailItem.itemCashDiscount",
    itemDiscPercent: "detailItem.itemDiscPercent",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    // § ARRAY of string beneran (BEDA dari Sales Quotation `salesmanNo`
    // yang cuma 1 nilai) — 1 kolom Excel "dipisah koma" di-split saat
    // build payload, lihat `ARRAY_SPLIT_FIELDS` di bawah.
    salesmanListNumber: "detailItem.salesmanListNumber",
    useTax1: "detailItem.useTax1", // PPN
    useTax2: "detailItem.useTax2", // PPnBM
    useTax3: "detailItem.useTax3", // PPh
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
    // detailExpense
    expenseAccountNo: "detailExpense.accountNo",
    expenseName: "detailExpense.expenseName",
    expenseAmount: "detailExpense.expenseAmount",
    expenseNotes: "detailExpense.expenseNotes",
    expenseSalesQuotationNumber: "detailExpense.salesQuotationNumber",
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
  // § nama kolom PERSIS sesuai sheet "Sales Order" client
  // (developmen-15-september-2026.xlsx, gitignored) — architecture-sales-order.md
  // § "Field Mapping Excel Client → API", bukan ditulis ulang gaya
  // Sales Quotation lama.
  defaultColumnMap: {
    "Trans Date": "transDate",
    "Trans No": "number",
    "Cust No": "customerNo",
    "Pay Term Name": "paymentTermName",
    "To Address": "toAddress",
    Description: "description",
    "PO Number": "poNumber",
    "Branch Name": "branchName",
    "Cash Discount": "cashDiscount",
    "Cash Disc Percent": "cashDiscPercent",
    "Currency Code": "currencyCode",
    Rate: "rate",
    "FOB Name": "fobName",
    "Shipment Date": "shipDate",
    "Shipment Name": "shipmentName",
    "Include Tax": "inclusiveTax",
    Taxable: "taxable",
    "Item No": "itemNo",
    "Item Name": "itemName",
    "Item Price": "unitPrice",
    Qty: "quantity",
    "Unit Name": "itemUnitName",
    "Item Note": "itemNotes",
    "Sales Quot No": "salesQuotationNumber",
    "Item Cash Discount": "itemCashDiscount",
    "Item Disc Percent": "itemDiscPercent",
    "Item Dept": "departmentName",
    "Item Project No": "projectNo",
    "Sales List No (separate with comma)": "salesmanListNumber",
    PPN: "useTax1",
    PPnBM: "useTax2",
    PPh: "useTax3",
    "Item CLS1": "attribut1",
    "Item CLS2": "attribut2",
    "Item CLS3": "attribut3",
    "Expense Acc No": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    "Expense Note": "expenseNotes",
    "Expense Sales Quot No": "expenseSalesQuotationNumber",
    "Expense Dept": "expenseDepartmentName",
    "Expense CLS1": "expenseKategoriKeuangan1",
    "Expense CLS2": "expenseKategoriKeuangan2",
    "Expense CLS3": "expenseKategoriKeuangan3",
  } as Record<string, string>,
};

export type SalesOrderField = keyof typeof salesOrderMapping.fieldToAccuratePath;

// § Auto-create customer+item — DUPLIKASI SENGAJA dari
// `customerAutoCreateMapping`/`itemAutoCreateMapping` di
// `sales-quotation.mapping.ts` (pola project ini, bukan di-share).
export const customerAutoCreateMapping = {
  fieldToAccuratePath: {
    customerName: "name",
    customerCategoryName: "categoryName",
    customerWorkPhone: "workPhone",
    customerMobilePhone: "mobilePhone",
    customerEmail: "email",
    customerAddress: "billStreet",
    customerCountry: "billCountry",
    customerReceivableAccountListNo: "customerReceivableAccountListNo",
  } as const,
  defaultColumnMap: {
    "Nama Customer": "customerName",
    "Kategori Customer": "customerCategoryName",
    "Telepon Bisnis": "customerWorkPhone",
    Handphone: "customerMobilePhone",
    "Email Customer": "customerEmail",
    "Alamat Customer": "customerAddress",
    "Negara Customer": "customerCountry",
    "Akun Piutang": "customerReceivableAccountListNo",
  } as Record<string, string>,
};
export type CustomerAutoCreateField = keyof typeof customerAutoCreateMapping.fieldToAccuratePath;

export const itemAutoCreateMapping = {
  fieldToAccuratePath: { itemCategoryName: "itemCategoryName" } as const,
  defaultColumnMap: { "Kategori Barang": "itemCategoryName" } as Record<string, string>,
};
export type ItemAutoCreateField = keyof typeof itemAutoCreateMapping.fieldToAccuratePath;

const DATE_FIELDS = new Set<SalesOrderField>(["transDate", "shipDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const BOOLEAN_FIELDS = new Set<SalesOrderField>(["taxable", "inclusiveTax", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
const PERCENT_STRING_FIELDS = new Set<SalesOrderField>(["cashDiscPercent", "itemDiscPercent"]);
// § field API bertipe ARRAY of string BENERAN — 1 sel Excel "dipisah
// koma" di-split jadi banyak elemen (BEDA dari Sales Quotation
// `salesmanNo` yang cuma wrap 1 nilai). Delimiter: koma, spasi di
// sekitar tiap nilai di-trim, entri kosong dibuang.
const ARRAY_SPLIT_FIELDS = new Set<SalesOrderField>(["salesmanListNumber"]);

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

function toSalesmanList(value: unknown): string[] {
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<SalesOrderField, unknown>> {
  const values: Partial<Record<SalesOrderField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as SalesOrderField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else if (ARRAY_SPLIT_FIELDS.has(f)) values[f] = toSalesmanList(raw);
      else values[f] = raw;
    }
  }
  return values;
}

export function buildSalesOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesOrderMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as SalesOrderField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  const detailExpense = rawRows.map((rawRow) => buildDetailExpenseFromRow(rawRow, columnMapping)).filter((entry): entry is Record<string, unknown> => entry !== null);
  if (detailExpense.length > 0) payload.detailExpense = detailExpense;

  return payload;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesOrderMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as SalesOrderField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § syarat minimal 1 baris dianggap punya data Beban: accountNo DAN
// expenseAmount harus SAMA-SAMA terisi (pola sama modul lain).
export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesOrderMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as SalesOrderField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesOrderGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

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

// § grouping DEFAULT ADR-0011 by "Trans No" ("number", OPSIONAL).
export function groupSalesOrderRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesOrderGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: SalesOrderGroup[] = [];
  const byKey = new Map<string, SalesOrderGroup>();

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

export function validateGroupCustomerConsistency(group: SalesOrderGroup, columnMapping: Record<string, string>): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Trans No)";
  return `Nomor grup "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 Sales Order pakai Cust No yang sama.`;
}

function rawValueFor(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): unknown {
  const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!excelColumn) return undefined;
  const value = rawRow[excelColumn];
  return value === "" ? undefined : value;
}

export function extractCustomerCreateFields(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(customerAutoCreateMapping.fieldToAccuratePath)) {
    const value = rawValueFor(rawRow, columnMapping, field);
    if (value !== undefined) payload[accuratePath] = value;
  }
  return payload;
}

export function extractItemCreateFields(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: rawValueFor(rawRow, columnMapping, "itemName"),
    unit1Name: rawValueFor(rawRow, columnMapping, "itemUnitName"),
  };
  for (const [field, accuratePath] of Object.entries(itemAutoCreateMapping.fieldToAccuratePath)) {
    const value = rawValueFor(rawRow, columnMapping, field);
    if (value !== undefined) payload[accuratePath] = value;
  }
  return payload;
}

export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const value = rawValueFor(rawRow, columnMapping, `attribut${index}`);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}

export function extractExpenseDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const value = rawValueFor(rawRow, columnMapping, `expenseKategoriKeuangan${index}`);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}
