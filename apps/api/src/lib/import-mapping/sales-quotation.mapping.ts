// § architecture-sales-quotation.md — Fase 123. Sales Quotation adalah
// dokumen PALING AWAL rantai penjualan (analog Purchase Order di rantai
// pembelian) — auto-create Customer+Item (mirror Sales Invoice, Fase
// 13), TIDAK ada dampak GL/stok, TIDAK ada "Batal Import". Grouping
// DEFAULT ADR-0011 (kunci "number"/Trans Number, OPSIONAL).
//
// § `salesmanListNumber` (detailItem) BERTIPE ARRAY of string di API —
// Excel client cuma py 1 kolom "Item Salesman No", dipetakan sebagai
// array 1-elemen `[value]` (TIDAK ada parsing multi-value/pemisah koma
// — sesuai rekomendasi architecture doc, JANGAN over-engineer sebelum
// dikonfirmasi butuh).
//
// § Koreksi 2026-09-15 (pola SAMA seperti Purchase Return): kolom Excel
// "Expense Project No" TIDAK punya field API — `detailExpense[]` Sales
// Quotation TIDAK punya `projectNo` sama sekali (dikonfirmasi
// `accurate-openapi.json`). SENGAJA tidak dimasukkan `defaultColumnMap`.
export const salesQuotationMapping = {
  requiredFields: ["customerNo", "transDate", "itemNo", "unitPrice", "quantity", "itemUnitName", "branchName"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    transDate: "transDate",
    number: "number", // Trans Number — opsional, kunci grouping DEFAULT (kosong = 1 baris = 1 quotation)
    currencyCode: "currencyCode",
    paymentTermName: "paymentTermName",
    toAddress: "toAddress",
    description: "description",
    branchName: "branchName",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    fobName: "fobName",
    taxable: "taxable",
    inclusiveTax: "inclusiveTax",
    // Atribut Tambahan level HEADER.
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
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    salesmanNo: "detailItem.salesmanListNumber", // § ARRAY, lihat komentar atas
    itemCashDiscount: "detailItem.itemCashDiscount",
    itemDiscPercent: "detailItem.itemDiscPercent",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    useTax1: "detailItem.useTax1",
    useTax2: "detailItem.useTax2",
    useTax3: "detailItem.useTax3",
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
    // detailExpense — TIDAK ADA projectNo/link ke dokumen lain (dikonfirmasi tidak ada di API).
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
    "Trans Number": "number",
    "Customer Number": "customerNo",
    "Currency Code": "currencyCode",
    "Payterm Name": "paymentTermName",
    "To Address": "toAddress",
    Description: "description",
    "Branch Name": "branchName",
    "Cash Discount": "cashDiscount",
    "Cash Discount Percent": "cashDiscPercent",
    "FOB Name": "fobName",
    Taxable: "taxable",
    "Include Tax": "inclusiveTax",
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
    "Item Number": "itemNo",
    "Item Name": "itemName",
    "Item price": "unitPrice",
    "Item Quantity": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Salesman No": "salesmanNo",
    "Item Cash Discount": "itemCashDiscount",
    "Item Discount Percent": "itemDiscPercent",
    "Item Tax1": "useTax1",
    "Item Tax2": "useTax2",
    "Item Tax3": "useTax3",
    "Item Note": "itemNotes",
    "Item Project No": "projectNo",
    "Item Department": "departmentName",
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
    "Expense Account no": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    "Expense Note": "expenseNotes",
    "Expense Department": "expenseDepartmentName",
    "Expense: Finance Category 1": "expenseKategoriKeuangan1",
    "Expense: Finance Category 2": "expenseKategoriKeuangan2",
    "Expense: Finance Category 3": "expenseKategoriKeuangan3",
    "Expense: Finance Category 4": "expenseKategoriKeuangan4",
    "Expense: Finance Category 5": "expenseKategoriKeuangan5",
    "Expense: Finance Category 6": "expenseKategoriKeuangan6",
    "Expense: Finance Category 7": "expenseKategoriKeuangan7",
    "Expense: Finance Category 8": "expenseKategoriKeuangan8",
    "Expense: Finance Category 9": "expenseKategoriKeuangan9",
    "Expense: Finance Category 10": "expenseKategoriKeuangan10",
    // § "Expense Project No" SENGAJA TIDAK dipetakan — tidak ada field
    // API untuk itu di endpoint ini (koreksi 2026-09-15).
  } as Record<string, string>,
};

export type SalesQuotationField = keyof typeof salesQuotationMapping.fieldToAccuratePath;

// § Auto-create customer+item, DUPLIKASI SENGAJA dari
// `customerAutoCreateMapping`/`itemAutoCreateMapping` di
// `sales-invoice.mapping.ts` — Excel client Sales Quotation TIDAK punya
// kolom detail customer/item (cuma "Customer Number"/"Item Number"),
// tapi mapping ini tetap disediakan supaya findOrCreateCustomer/Item
// bisa dipakai kalau user menambah kolom sendiri saat konfirmasi
// mapping (Combobox tidak dibatasi cuma ke defaultColumnMap).
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

const DATE_FIELDS = new Set<SalesQuotationField>(["transDate", "attributHeaderTanggal1", "attributHeaderTanggal2", "attributItemTanggal1", "attributItemTanggal2"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const BOOLEAN_FIELDS = new Set<SalesQuotationField>(["taxable", "inclusiveTax", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
const PERCENT_STRING_FIELDS = new Set<SalesQuotationField>(["cashDiscPercent", "itemDiscPercent"]);
// § field API bertipe ARRAY of string — 1 sel Excel jadi array 1-elemen.
const ARRAY_FIELDS = new Set<SalesQuotationField>(["salesmanNo"]);

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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<SalesQuotationField, unknown>> {
  const values: Partial<Record<SalesQuotationField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as SalesQuotationField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else if (ARRAY_FIELDS.has(f)) values[f] = [String(raw)];
      else values[f] = raw;
    }
  }
  return values;
}

export function buildSalesQuotationPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesQuotationMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as SalesQuotationField];
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
  for (const [field, accuratePath] of Object.entries(salesQuotationMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as SalesQuotationField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § syarat minimal 1 baris dianggap punya data Beban: accountNo DAN
// expenseAmount harus SAMA-SAMA terisi (pola sama modul lain).
export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesQuotationMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as SalesQuotationField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesQuotationGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

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

// § grouping DEFAULT ADR-0011 by "Trans Number" ("number", OPSIONAL).
export function groupSalesQuotationRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesQuotationGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: SalesQuotationGroup[] = [];
  const byKey = new Map<string, SalesQuotationGroup>();

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

export function validateGroupCustomerConsistency(group: SalesQuotationGroup, columnMapping: Record<string, string>): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Trans Number)";
  return `Nomor grup "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 Sales Quotation pakai Nomor Customer yang sama.`;
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
