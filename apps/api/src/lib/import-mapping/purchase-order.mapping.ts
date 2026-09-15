// § architecture-purchase-order.md — Fase 120. Purchase Order adalah
// titik AWAL rantai procurement (mirip Purchase Invoice: auto-create
// vendor+item, grouping multi-baris by "Trans No"), BUKAN transaksi
// akuntansi (tidak ada jurnal GL dari PO sendiri). Field API SEMUA
// diverifikasi dari `accurate-openapi.json` `/api/purchase-order/save.do`
// (bukan tebakan) + field "Atribut Tambahan" (charField/numericField/
// dateField) yang SUDAH dikonfirmasi resmi Accurate Support di Purchase
// Invoice/Sales Invoice (Fase 64/71-73) dan konsisten lintas jenis
// transaksi — lihat komentar di `purchase-invoice.mapping.ts` untuk
// riwayat lengkap penemuan field itu.
export const purchaseOrderMapping = {
  // § "number" (Trans No) dijadikan WAJIB sejak awal (bukan retrofit
  // seperti Purchase Invoice/Sales Invoice Fase 81) — supaya grouping
  // multi-item selalu punya kunci reliable dari hari pertama.
  requiredFields: ["vendorNo", "transDate", "number", "itemNo", "unitPrice", "quantity", "itemUnitName"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    transDate: "transDate",
    number: "number", // nomor transaksi Accurate — kosongkan utk auto-number, JUGA kunci grouping
    branchName: "branchName",
    description: "description",
    fillPriceByVendorPrice: "fillPriceByVendorPrice",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    currencyCode: "currencyCode",
    rate: "rate",
    fobName: "fobName",
    shipDate: "shipDate",
    shipmentName: "shipmentName",
    toAddress: "toAddress",
    paymentTermName: "paymentTermName",
    taxable: "taxable",
    inclusiveTax: "inclusiveTax",
    // detailItem
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    warehouseName: "detailItem.warehouseName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    itemCashDiscount: "detailItem.itemCashDiscount",
    itemDiscPercent: "detailItem.itemDiscPercent",
    purchaseRequisitionNumber: "detailItem.purchaseRequisitionNumber",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    useTax1: "detailItem.useTax1", // PPN
    useTax2: "detailItem.useTax2", // PPnBM
    useTax3: "detailItem.useTax3", // PPh
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
    // § Atribut Tambahan level ITEM SAJA — Excel client cuma minta versi
    // ini (tidak ada versi header-level di sheet Purchase Order), §
    // architecture-purchase-order.md § "Atribut Tambahan".
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
    // detailExpense (biaya tambahan level dokumen, opsional).
    expenseAccountNo: "detailExpense.accountNo",
    expenseName: "detailExpense.expenseName",
    expenseAmount: "detailExpense.expenseAmount",
    expenseNotes: "detailExpense.expenseNotes",
    expenseDepartmentName: "detailExpense.departmentName",
    expenseProjectNo: "detailExpense.projectNo",
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
    "Trans Date": "transDate",
    "Trans No": "number",
    "Vendor No": "vendorNo",
    "Pay Term Name": "paymentTermName",
    "To Address": "toAddress",
    "Branch Name": "branchName",
    Description: "description",
    "Fill Price By Vendor": "fillPriceByVendorPrice",
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
    Qty: "quantity",
    "Unit Name": "itemUnitName",
    "Item Price": "unitPrice",
    "Item Note": "itemNotes",
    "Item Warehouse": "warehouseName",
    "ITEM: Cash Discount": "itemCashDiscount",
    "ITEM: Disc Percent": "itemDiscPercent",
    "ITEM: Requisite No": "purchaseRequisitionNumber",
    "ITEM: Department": "departmentName",
    "ITEM: Project No": "projectNo",
    PPN: "useTax1",
    PPnBM: "useTax2",
    PPh: "useTax3",
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
    "Expense Note": "expenseNotes",
    "EXPENSE: Department": "expenseDepartmentName",
    "EXPENSE: Project No": "expenseProjectNo",
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

export type PurchaseOrderField = keyof typeof purchaseOrderMapping.fieldToAccuratePath;

// § Auto-create vendor+item, DUPLIKASI SENGAJA dari `vendorAutoCreateMapping`/
// `itemAutoCreateMapping` di `purchase-invoice.mapping.ts` — konsisten
// filosofi "3 baris mirip lebih baik dari abstraksi prematur" yang sudah
// dipakai project ini (lihat alias `extractDataClassificationValues as
// extractDataClassificationValuesPI` di workers/index.ts).
export const vendorAutoCreateMapping = {
  fieldToAccuratePath: {
    vendorName: "name",
    vendorCategoryName: "categoryName",
    vendorWorkPhone: "workPhone",
    vendorMobilePhone: "mobilePhone",
    vendorWhatsapp: "__detailContact_bbmPin",
    vendorEmail: "email",
    vendorAddress: "billStreet",
    vendorCountry: "billCountry",
    vendorPayableAccountNo: "vendorPayableAccountListNo",
  } as const,
  defaultColumnMap: {
    "Nama Vendor": "vendorName",
    "Kategori Vendor": "vendorCategoryName",
    "Telepon Bisnis": "vendorWorkPhone",
    Handphone: "vendorMobilePhone",
    WhatsApp: "vendorWhatsapp",
    "Email Vendor": "vendorEmail",
    "Alamat Vendor": "vendorAddress",
    "Negara Vendor": "vendorCountry",
    "Akun Hutang": "vendorPayableAccountNo",
  } as Record<string, string>,
};
export type VendorAutoCreateField = keyof typeof vendorAutoCreateMapping.fieldToAccuratePath;

export const itemAutoCreateMapping = {
  fieldToAccuratePath: { itemCategoryName: "itemCategoryName" } as const,
  defaultColumnMap: { "Kategori Barang": "itemCategoryName" } as Record<string, string>,
};
export type ItemAutoCreateField = keyof typeof itemAutoCreateMapping.fieldToAccuratePath;

const DATE_FIELDS = new Set<PurchaseOrderField>(["transDate", "shipDate", "attributItemTanggal1", "attributItemTanggal2"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const BOOLEAN_FIELDS = new Set<PurchaseOrderField>(["taxable", "inclusiveTax", "fillPriceByVendorPrice", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);
const PERCENT_STRING_FIELDS = new Set<PurchaseOrderField>(["cashDiscPercent", "itemDiscPercent"]);

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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<PurchaseOrderField, unknown>> {
  const values: Partial<Record<PurchaseOrderField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as PurchaseOrderField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else values[f] = raw;
    }
  }
  return values;
}

export function buildPurchaseOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseOrderMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as PurchaseOrderField];
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
  for (const [field, accuratePath] of Object.entries(purchaseOrderMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as PurchaseOrderField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § syarat minimal 1 baris dianggap punya data Beban: accountNo DAN
// expenseAmount harus SAMA-SAMA terisi (mirror pola `detailDiscount`/
// `detailExpense` modul lain) — TIDAK dikirim setengah-setengah.
export function buildDetailExpenseFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseOrderMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as PurchaseOrderField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type PurchaseOrderGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

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

// § grouping MURNI by "Trans No" ("number", WAJIB di `requiredFields`
// sejak awal modul ini) — beda dari Purchase Invoice yang masih perlu
// fallback ke "Bill No" untuk backward-compat modul lama. Baris tanpa
// "Trans No" (mustahil lolos validasi confirm, tapi tetap dijaga di sini)
// jadi grup sendiri.
export function groupPurchaseOrderRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): PurchaseOrderGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: PurchaseOrderGroup[] = [];
  const byKey = new Map<string, PurchaseOrderGroup>();

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

export function validateGroupVendorConsistency(group: PurchaseOrderGroup, columnMapping: Record<string, string>): string | null {
  const vendorNoColumn = Object.entries(columnMapping).find(([, field]) => field === "vendorNo")?.[0];
  if (!vendorNoColumn) return null;

  const vendorNos = new Set(
    group.rows
      .map((row) => row.rawData[vendorNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (vendorNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Trans No)";
  return `Nomor grup "${label}" dipakai untuk vendor berbeda-beda (${[...vendorNos].join(", ")}) — pastikan semua baris 1 Purchase Order pakai Nomor Vendor yang sama.`;
}

function rawValueFor(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): unknown {
  const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!excelColumn) return undefined;
  const value = rawRow[excelColumn];
  return value === "" ? undefined : value;
}

export function extractVendorCreateFields(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(vendorAutoCreateMapping.fieldToAccuratePath)) {
    if (field === "vendorWhatsapp") continue;
    const value = rawValueFor(rawRow, columnMapping, field);
    if (value !== undefined) payload[accuratePath] = value;
  }

  const whatsapp = rawValueFor(rawRow, columnMapping, "vendorWhatsapp");
  if (whatsapp !== undefined) {
    payload.detailContact = [{ name: payload.name ?? rawValueFor(rawRow, columnMapping, "vendorNo"), bbmPin: whatsapp }];
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
