// § architecture-accurate-integration.md § "Sales Invoice (Faktur Penjualan)
// — Fase 13" — bayangan cermin `purchase-invoice.mapping.ts`: vendorNo↔
// customerNo, billNumber↔poNumber (pengganti "Bill No" — nomor referensi
// PO dari customer, field resmi Accurate `poNumber`). Semua nama field
// Accurate di `fieldToAccuratePath` diverifikasi dari OpenAPI spec resmi
// (`docs/referencehtml/accurate-openapi.json`), BUKAN tebakan.
export const salesInvoiceMapping = {
  // Sama filosofi PI — lebih ketat dari minimum API Accurate (yang cuma
  // itemNo+unitPrice) karena tanpa quantity/itemUnitName/warehouseName
  // faktur nyaris tidak bermakna secara bisnis.
  requiredFields: ["customerNo", "transDate", "itemNo", "unitPrice", "quantity", "itemUnitName", "warehouseName"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    transDate: "transDate",
    number: "number", // nomor transaksi Accurate — kosongkan utk auto-number
    poNumber: "poNumber", // nomor PO referensi dari customer (beda dari `number`) — pengganti peran "Bill No" di PI
    branchName: "branchName",
    description: "description",
    currencyCode: "currencyCode",
    rate: "rate",
    paymentTermName: "paymentTermName",
    taxable: "taxable",
    inclusiveTax: "inclusiveTax",
    taxNumber: "taxNumber",
    taxDate: "taxDate",
    reverseInvoice: "reverseInvoice",
    cashDiscount: "cashDiscount",
    cashDiscPercent: "cashDiscPercent",
    documentCode: "documentCode",
    documentTransaction: "documentTransaction",
    shipmentName: "shipmentName",
    shipDate: "shipDate",
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    warehouseName: "detailItem.warehouseName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    itemCashDiscount: "detailItem.itemCashDiscount",
    itemDiscPercent: "detailItem.itemDiscPercent",
    departmentName: "detailItem.departmentName",
    projectNo: "detailItem.projectNo",
    useTax1: "detailItem.useTax1", // PPN
    useTax2: "detailItem.useTax2", // PPnBM
    useTax3: "detailItem.useTax3", // PPh23
  } as const,
  defaultColumnMap: {
    Tanggal: "transDate",
    "PO Number": "poNumber",
    "Customer No": "customerNo",
    "Trans No": "number",
    "Branch Name": "branchName",
    Note: "description",
    "Currency Code": "currencyCode",
    Rate: "rate",
    "Pay Term": "paymentTermName",
    Taxable: "taxable",
    "Inclusive Tax": "inclusiveTax",
    "Tax No": "taxNumber",
    "Tax Date": "taxDate",
    "Reverse Inv": "reverseInvoice",
    "Cash Discount": "cashDiscount",
    "Cash Disc (%)": "cashDiscPercent",
    "Document Code": "documentCode",
    "Document Transaction Type": "documentTransaction",
    "Shipment Name": "shipmentName",
    "Shipment Date": "shipDate",
    "Item No": "itemNo",
    "Unit Price": "unitPrice",
    "Item Qty": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Warehouse": "warehouseName",
    "Item Name": "itemName",
    "Item Notes": "itemNotes",
    "Item Cash Disc": "itemCashDiscount",
    "Item Disc (%)": "itemDiscPercent",
    "Item - Department": "departmentName",
    "Item Prj No": "projectNo",
    PPN: "useTax1",
    PPnBM: "useTax2",
    PPH: "useTax3",
  } as Record<string, string>,
};

export type SalesInvoiceField = keyof typeof salesInvoiceMapping.fieldToAccuratePath;

// § mirror `vendorAutoCreateMapping` — `customerReceivableAccountListNo`
// ("Akun Piutang") setara `vendorPayableAccountListNo`: BOLEH update
// customer yang SUDAH ADA (bukan cuma create-only seperti field lain),
// konsisten dengan revisi 2026-08-22 di sisi vendor.
export const customerAutoCreateMapping = {
  fieldToAccuratePath: {
    customerName: "name", // WAJIB DIISI kalau customer belum ada
    customerCategoryName: "categoryName", // default "Umum" kalau kosong
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
  fieldToAccuratePath: {
    itemCategoryName: "itemCategoryName", // default "Umum" kalau kosong
  } as const,
  defaultColumnMap: {
    "Kategori Barang": "itemCategoryName",
  } as Record<string, string>,
};
export type ItemAutoCreateField = keyof typeof itemAutoCreateMapping.fieldToAccuratePath;

// § lessons-learned.md 2026-08-19 — Accurate WAJIB format tanggal DD/MM/YYYY.
const DATE_FIELDS = new Set<SalesInvoiceField>(["transDate", "taxDate", "shipDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

function toAccurateDate(value: unknown): unknown {
  let date: Date | null = null;
  if (typeof value === "number") {
    date = new Date(EXCEL_EPOCH_UTC_MS + value * 86400000);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value; // sudah DD/MM/YYYY
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  if (!date || Number.isNaN(date.getTime())) return value;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function extractRowValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Partial<Record<SalesInvoiceField, unknown>> {
  const values: Partial<Record<SalesInvoiceField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as SalesInvoiceField;
      values[f] = DATE_FIELDS.has(f) ? toAccurateDate(rawRow[excelColumn]) : rawRow[excelColumn];
    }
  }
  return values;
}

// § mirror `buildPurchaseInvoicePayload` — header dari baris PERTAMA grup,
// `detailItem` array 1 elemen per baris dalam grup (grouping by PO Number).
export function buildSalesInvoicePayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesInvoiceMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.")) continue;
    const value = headerValues[field as SalesInvoiceField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  return payload;
}

export function buildDetailItemFromRow(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesInvoiceMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as SalesInvoiceField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § mirror grouping PI (ADR-0011) — pengganti kolom "Bill No" adalah
// "PO Number" (`poNumber`).
export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesInvoiceGroup = { poNumber: string | null; rows: ImportRowRecord[] };

export function poNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "poNumber")?.[0] ?? null;
}

function poNumberOf(row: ImportRowRecord, poNumberColumn: string | null): string | null {
  if (!poNumberColumn) return null;
  const value = row.rawData[poNumberColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function groupSalesInvoiceRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesInvoiceGroup[] {
  const poNumberColumn = poNumberColumnOf(columnMapping);
  const groups: SalesInvoiceGroup[] = [];
  const byPoNumber = new Map<string, SalesInvoiceGroup>();

  for (const row of rows) {
    const poNumber = poNumberOf(row, poNumberColumn);
    if (poNumber === null) {
      groups.push({ poNumber: null, rows: [row] });
      continue;
    }
    const key = poNumber.toLowerCase();
    let group = byPoNumber.get(key);
    if (!group) {
      group = { poNumber, rows: [] };
      byPoNumber.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § mirror `validateGroupVendorConsistency` — semua baris 1 grup (1
// faktur) WAJIB customerNo sama.
export function validateGroupCustomerConsistency(group: SalesInvoiceGroup, columnMapping: Record<string, string>): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.poNumber ?? "(tanpa PO Number)";
  return `PO Number "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 faktur pakai Nomor Customer yang sama.`;
}

function rawValueFor(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): unknown {
  const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!excelColumn) return undefined;
  const value = rawRow[excelColumn];
  return value === "" ? undefined : value;
}

// § mirror `extractVendorCreateFields` — TANPA field WhatsApp/`bbmPin`
// khusus (tidak diminta client untuk SI, beda dari PI yang sudah punya
// dari awal — bisa ditambah nanti kalau dibutuhkan, bukan simetri wajib).
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
