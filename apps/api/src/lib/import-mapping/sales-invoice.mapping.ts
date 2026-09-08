// § architecture-accurate-integration.md § "Sales Invoice (Faktur Penjualan)
// — Fase 13" — bayangan cermin `purchase-invoice.mapping.ts`: vendorNo↔
// customerNo, billNumber↔poNumber (pengganti "Bill No" — nomor referensi
// PO dari customer, field resmi Accurate `poNumber`). Semua nama field
// Accurate di `fieldToAccuratePath` diverifikasi dari OpenAPI spec resmi
// (`docs/referencehtml/accurate-openapi.json`), BUKAN tebakan.
export const salesInvoiceMapping = {
  // § disamakan persis dengan aturan WAJIB/TIDAK WAJIB di format Excel
  // resmi client (`docs/referencehtml/format_sales_inv_v7 (PLAN).xlsx`,
  // sheet "Penjelasan Kolom", dikonfirmasi 2026-09-08) — BUKAN cuma
  // tebakan minimum API Accurate: "number" (Trans No) WAJIB (dipakai
  // juga sebagai kunci grouping multi-item, § Fase 49, jadi mewajibkan
  // ini sekaligus memperkuat grouping supaya selalu ada kunci valid),
  // "itemUnitName" (Item Unit Name) JUSTRU TIDAK WAJIB menurut client
  // (sebelumnya diwajibkan di sini, keliru).
  requiredFields: ["customerNo", "transDate", "number", "itemNo", "unitPrice", "quantity", "warehouseName"] as const,
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
    // § Fase 55 — "Atribut Tambahan" Accurate (menu Rancangan Formulir
    // Faktur Penjualan, screenshot client) = fitur "Data Classification"
    // di API resmi (diverifikasi ke accurate-openapi.json). Per BARIS
    // ITEM (bukan header), tipe string, 10 slot bebas — label yang
    // client lihat di Accurate BISA di-rename beda (mis. "Nomor SPK"),
    // TAPI nama field API tetap dataClassificationNName, tidak berubah.
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
    // § Fase 55, diperbarui 2026-09-08 setelah file Excel ASLI client
    // diterima (`format_sales_inv_v7 (PLAN).xlsx`) — nama kolom asli
    // client "ITEM:CUSTOM CHARACTER 1..10" (LEVEL ITEM/baris, bukan
    // "Karakter 1..10" yang sebelumnya cuma tebakan). Diriset ulang ke
    // SELURUH endpoint API Accurate (30+ jenis transaksi): field
    // `dataClassificationNName` KONSISTEN cuma ada 1-10 di mana pun,
    // TIDAK PERNAH sampai 15 — jadi "ITEM:CUSTOM CHARACTER 11-15" di
    // Excel client TIDAK BISA diimport via API sama sekali (bukan
    // dibatasi kode ini, field-nya memang tidak ada). "ITEM:CUSTOM
    // NUMBER"/"ITEM:CUSTOM DATE"/"ITEM:CUSTOM FINANCE CATEGORY" di Excel
    // client JUGA TIDAK BISA — `detailItem` Accurate cuma punya varian
    // "Character" (dataClassificationNName), tidak ada varian
    // Number/Date/FinanceCategory sama sekali. Ini tetap cuma
    // DEFAULT/auto-suggest — kalau nanti client rename lagi label
    // kolomnya, user tinggal remap manual saat konfirmasi import.
    "ITEM:CUSTOM CHARACTER 1": "attribut1",
    "ITEM:CUSTOM CHARACTER 2": "attribut2",
    "ITEM:CUSTOM CHARACTER 3": "attribut3",
    "ITEM:CUSTOM CHARACTER 4": "attribut4",
    "ITEM:CUSTOM CHARACTER 5": "attribut5",
    "ITEM:CUSTOM CHARACTER 6": "attribut6",
    "ITEM:CUSTOM CHARACTER 7": "attribut7",
    "ITEM:CUSTOM CHARACTER 8": "attribut8",
    "ITEM:CUSTOM CHARACTER 9": "attribut9",
    "ITEM:CUSTOM CHARACTER 10": "attribut10",
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

// § mirror grouping PI (ADR-0011) — awalnya pengganti kolom "Bill No"
// cuma "PO Number" (`poNumber`). § Fase 49 — DIGENERALISASI: audit data
// ASLI kompetitor (`docs/referencehtml/format_sales_inv_v7.xlsx`, 833
// baris) menemukan "PO Number" SELALU KOSONG di praktik nyata, padahal
// 52% faktur (77/149) itu multi-item — grouping by PO Number gagal
// TOTAL untuk pola data ini (tiap baris kebaca faktur sendiri-sendiri,
// TANPA error, diam-diam salah). "Trans No" (`number`) di data yang
// SAMA justru SELALU terisi & konsisten per faktur — jadi field
// `groupKey`/`groupColumn` (bukan `poNumber` literal) dipakai supaya
// grouping bisa pakai KOLOM MANA PUN yang relevan, bukan cuma PO Number.
export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesInvoiceGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

export function poNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "poNumber")?.[0] ?? null;
}

// § Fase 49 — "Trans No" (field internal `number`, SUDAH ada di
// `defaultColumnMap` sejak awal & sudah otomatis diteruskan ke Accurate)
// dipakai juga sebagai kunci grouping, DIUTAMAKAN dari PO Number kalau
// keduanya termapping — lihat alasan di komentar `SalesInvoiceGroup`.
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

// § Fase 49 — PER BARIS: pakai "Trans No" kalau kolom itu termapping
// DAN terisi di baris ini, fallback ke "PO Number" (perilaku LAMA,
// TIDAK berubah untuk siapa pun yang sudah pakai PO Number tanpa Trans
// No), fallback akhir tetap "1 baris = 1 faktur sendiri" (sama seperti
// sebelum Fase 49 — TIDAK ADA regresi buat mapping yang sudah ada).
export function groupSalesInvoiceRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesInvoiceGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const poNumberColumn = poNumberColumnOf(columnMapping);
  const groups: SalesInvoiceGroup[] = [];
  const byKey = new Map<string, SalesInvoiceGroup>();

  for (const row of rows) {
    const numberValue = valueOfColumn(row, numberColumn);
    const groupColumn = numberValue !== null ? numberColumn : poNumberColumn;
    const groupKey = numberValue !== null ? numberValue : valueOfColumn(row, poNumberColumn);

    if (groupKey === null || groupColumn === null) {
      groups.push({ groupKey: null, groupColumn: null, rows: [row] });
      continue;
    }
    const mapKey = `${groupColumn}::${groupKey.toLowerCase()}`;
    let group = byKey.get(mapKey);
    if (!group) {
      group = { groupKey, groupColumn, rows: [] };
      byKey.set(mapKey, group);
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

  const label = group.groupKey ?? "(tanpa Trans No/PO Number)";
  return `Nomor grup "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 faktur pakai Nomor Customer yang sama.`;
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
