// § architecture-accurate-integration.md § 3 — Purchase Invoice VERIFIED.
// § Fase 06 (2026-08-28, ADR-0011) — 1 Faktur Pembelian BISA punya banyak
// `detailItem`: baris Excel dengan kolom "Bill No" (`billNumber`) SAMA
// dikelompokkan jadi 1 payload `save.do` (lihat `groupPurchaseInvoiceRows`
// di bawah), bukan lagi selalu 1 baris = 1 faktur (batasan MVP lama, sudah
// tidak berlaku).
//
// Daftar field diperluas 2026-08-19 berdasarkan template referensi user
// (`FACPORT_TEMPLATE_Purchase_Inv_v8.xlsx`, tool integrasi Accurate lain)
// — nama field Accurate di `fieldToAccuratePath` TETAP diambil dari spec
// resmi (bukan ditebak dari nama kolom template itu), cuma cakupan &
// nama kolom Excel default yang mengikuti pola template tsb supaya user
// yang sudah familiar dengan format itu gampang pindah.
export const purchaseInvoiceMapping = {
  // "requiredFields" di sini LEBIH KETAT dari minimum API Accurate (yang
  // cuma vendorNo+itemNo+unitPrice) — quantity/itemUnitName/warehouseName
  // ditambahkan sebagai wajib karena tanpa itu faktur nyaris tidak
  // bermakna secara bisnis (juga konsisten dengan template referensi yang
  // menandai kolom-kolom ini "Wajib"). branchName SENGAJA TIDAK masuk sini
  // meski kadang wajib (akun multi-cabang) — itu bergantung setup Accurate
  // tiap user, bukan aturan universal, jadi errornya ditangani sebagai
  // error per-baris biasa (bukan validasi blocking di step konfirmasi).
  requiredFields: ["vendorNo", "transDate", "itemNo", "unitPrice", "quantity", "itemUnitName", "warehouseName"] as const,
  // Key kiri = nama field internal dipakai UI mapping & payload builder.
  // Key kanan = path field Accurate sungguhan (dot-path untuk detailItem),
  // SEMUA diverifikasi dari OpenAPI spec resmi Accurate (bukan tebakan).
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    transDate: "transDate",
    number: "number", // nomor transaksi Accurate — kosongkan utk auto-number
    billNumber: "billNumber", // nomor referensi tagihan dari vendor (beda dari `number`)
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
    toAddress: "toAddress",
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
  // Mapping default (bisa di-override user lewat UI "cocokkan kolom" saat
  // upload) — key = nama kolom Excel yang diharapkan (ikut pola template
  // referensi user), value = field internal (lihat fieldToAccuratePath).
  defaultColumnMap: {
    Tanggal: "transDate",
    "Bill No": "billNumber",
    "Vendor No": "vendorNo",
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
    "To Address": "toAddress",
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

export type PurchaseInvoiceField = keyof typeof purchaseInvoiceMapping.fieldToAccuratePath;

// § Fase 05 (Purchase Invoice — Auto-create Vendor & Item) — TERVERIFIKASI
// 2026-08-20 via test call nyata: kalau vendor/item di Excel BELUM ada di
// Accurate, dibuatkan dulu otomatis pakai field OPSIONAL ini, baru Faktur
// Pembelian dibuat. Field di sini SEMUA opsional — kalau vendor/item
// SUDAH ada (ditemukan by `vendorNo`/`itemNo`), field ini DIABAIKAN
// (tidak meng-update data master yang sudah ada, cuma dipakai saat CREATE
// baru — hindari efek samping "diam-diam ubah data existing", § Fase 04)
// — KECUALI `vendorPayableAccountNo` (Akun Hutang), lihat catatan di
// field itu (revisi 2026-08-22, keputusan eksplisit user).
export const vendorAutoCreateMapping = {
  fieldToAccuratePath: {
    vendorName: "name", // WAJIB DIISI kalau vendor belum ada (error jelas kalau kosong)
    vendorCategoryName: "categoryName", // default "Umum" kalau kosong
    vendorWorkPhone: "workPhone",
    vendorMobilePhone: "mobilePhone",
    // § Nilai path ini SENGAJA sentinel, BUKAN dot-path sungguhan — field
    // API asli "bbmPin" (peninggalan BlackBerry Messenger, deskripsi resmi
    // Accurate SUDAH direname "No. WhatsApp") nempel di `detailContact[0]`,
    // bukan field top-level vendor. Ditangani KHUSUS (di-skip loop generik,
    // ditangani manual) di extractVendorCreateFields di bawah.
    vendorWhatsapp: "__detailContact_bbmPin",
    vendorEmail: "email",
    vendorAddress: "billStreet",
    vendorCountry: "billCountry",
    // § revisi 2026-08-22 — SATU-SATUNYA field di sini yang JUGA berlaku
    // buat vendor yang SUDAH ADA (bukan cuma saat CREATE) — kalau vendor
    // ditemukan DAN kolom ini diisi, akun hutangnya di-update juga. Beda
    // dari field lain di atas yang tetap create-only. (Alternatif: modul
    // Import Akun Hutang Pemasok, Fase 04, tetap ada buat update akun
    // hutang TANPA perlu bikin/sertakan transaksi Faktur Pembelian.)
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
  fieldToAccuratePath: {
    itemCategoryName: "itemCategoryName", // default "Umum" kalau kosong
  } as const,
  defaultColumnMap: {
    "Kategori Barang": "itemCategoryName",
  } as Record<string, string>,
};
export type ItemAutoCreateField = keyof typeof itemAutoCreateMapping.fieldToAccuratePath;

// § lessons-learned.md 2026-08-19 — Accurate WAJIB format tanggal DD/MM/YYYY
// (dikonfirmasi via test call nyata: "19/08/2026" berhasil, "2026-08-19"
// ditolak "Invalid field value"). Excel bisa kasih tanggal dalam berbagai
// bentuk (serial number, Date object, string ISO, string DD/MM/YYYY) —
// normalisasi semua ke format yang Accurate terima.
const DATE_FIELDS = new Set<PurchaseInvoiceField>(["transDate", "taxDate", "shipDate"]);
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
  if (!date || Number.isNaN(date.getTime())) return value; // tidak dikenali, teruskan apa adanya
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function extractRowValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Partial<Record<PurchaseInvoiceField, unknown>> {
  const values: Partial<Record<PurchaseInvoiceField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as PurchaseInvoiceField;
      values[f] = DATE_FIELDS.has(f) ? toAccurateDate(rawRow[excelColumn]) : rawRow[excelColumn];
    }
  }
  return values;
}

// Bangun payload save.do dari SEKELOMPOK baris Excel yang jadi 1 Faktur
// Pembelian (columnMapping: excelColumn -> field internal, sesuai
// defaultColumnMap). § Fase 06 — SEBELUMNYA nerima 1 baris = 1 payload
// (1 detailItem), SEKARANG nerima array baris (hasil `groupPurchaseInvoiceRows`)
// — field HEADER (bukan prefix "detailItem.") diambil dari baris PERTAMA
// saja, `detailItem` jadi array 1 elemen per baris dalam grup.
export function buildPurchaseInvoicePayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseInvoiceMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.")) continue;
    const value = headerValues[field as PurchaseInvoiceField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => {
    const rowValues = extractRowValues(rawRow, columnMapping);
    const detailItem: Record<string, unknown> = {};
    for (const [field, accuratePath] of Object.entries(purchaseInvoiceMapping.fieldToAccuratePath)) {
      if (!accuratePath.startsWith("detailItem.")) continue;
      const value = rowValues[field as PurchaseInvoiceField];
      if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
    }
    return detailItem;
  });

  return payload;
}

// § Fase 06, ADR-0011 — grouping baris Excel jadi 1 Faktur Pembelian
// berdasarkan kolom yang di-mapping ke "billNumber" (Bill No). Baris tanpa
// nilai Bill No (kolom tidak di-mapping user, ATAU di-mapping tapi
// kosong di baris itu) tetap jadi grup sendiri isi 1 baris — behavior
// SAMA PERSIS dengan sebelum ADR-0011, non-breaking buat user yang belum
// pakai multi-item.
export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type PurchaseInvoiceGroup = { billNumber: string | null; rows: ImportRowRecord[] };

function billNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "billNumber")?.[0] ?? null;
}

function billNumberOf(row: ImportRowRecord, billNumberColumn: string | null): string | null {
  if (!billNumberColumn) return null;
  const value = row.rawData[billNumberColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function groupPurchaseInvoiceRows(
  rows: ImportRowRecord[],
  columnMapping: Record<string, string>,
): PurchaseInvoiceGroup[] {
  const billNumberColumn = billNumberColumnOf(columnMapping);
  const groups: PurchaseInvoiceGroup[] = [];
  const byBillNumber = new Map<string, PurchaseInvoiceGroup>();

  for (const row of rows) {
    const billNumber = billNumberOf(row, billNumberColumn);
    if (billNumber === null) {
      groups.push({ billNumber: null, rows: [row] });
      continue;
    }
    const key = billNumber.toLowerCase();
    let group = byBillNumber.get(key);
    if (!group) {
      group = { billNumber, rows: [] };
      byBillNumber.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § ADR-0011 — semua baris dalam 1 grup (1 faktur) WAJIB vendorNo sama.
// Return pesan error jelas kalau tidak (grup digagalkan SELURUHNYA,
// TANPA panggil Accurate sama sekali), `null` kalau konsisten.
export function validateGroupVendorConsistency(
  group: PurchaseInvoiceGroup,
  columnMapping: Record<string, string>,
): string | null {
  const vendorNoColumn = Object.entries(columnMapping).find(([, field]) => field === "vendorNo")?.[0];
  if (!vendorNoColumn) return null; // vendorNo wajib di-mapping (requiredFields) — validasi itu terjadi di tempat lain

  const vendorNos = new Set(
    group.rows
      .map((row) => row.rawData[vendorNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (vendorNos.size <= 1) return null;

  const label = group.billNumber ?? "(tanpa Bill No)";
  return `Bill No "${label}" dipakai untuk vendor berbeda-beda (${[...vendorNos].join(", ")}) — pastikan semua baris 1 faktur pakai Nomor Vendor yang sama.`;
}

// Ambil nilai mentah 1 kolom internal dari 1 baris Excel (dipakai
// extractor vendor/item auto-create di bawah, bukan cuma buildPurchaseInvoicePayload).
function rawValueFor(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): unknown {
  const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!excelColumn) return undefined;
  const value = rawRow[excelColumn];
  return value === "" ? undefined : value;
}

// § Fase 05 — field vendor OPSIONAL buat auto-create (dipanggil hanya
// kalau vendor belum ketemu di Accurate). `name` WAJIB diisi (Excel kolom
// "Nama Vendor") kalau memang mau buat vendor baru — kalau kosong,
// `findOrCreateVendor` (lib/accurate-vendor.ts) lempar error jelas.
export function extractVendorCreateFields(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(vendorAutoCreateMapping.fieldToAccuratePath)) {
    if (field === "vendorWhatsapp") continue; // ditangani manual di bawah
    const value = rawValueFor(rawRow, columnMapping, field);
    if (value !== undefined) payload[accuratePath] = value;
  }

  const whatsapp = rawValueFor(rawRow, columnMapping, "vendorWhatsapp");
  if (whatsapp !== undefined) {
    // § belum ada kolom "Nama Kontak" terpisah — pakai nama vendor sebagai
    // nama kontak default (dikonfirmasi jalan via test call nyata,
    // TERVERIFIKASI 2026-08-20). `name` vendor WAJIB sudah terisi di
    // `payload` di titik ini (loop di atas sudah proses `vendorName`).
    payload.detailContact = [{ name: payload.name ?? rawValueFor(rawRow, columnMapping, "vendorNo"), bbmPin: whatsapp }];
  }

  return payload;
}

// § Fase 05 — field item OPSIONAL buat auto-create. `name`+`unit1Name`
// diambil dari field `itemName`/`itemUnitName` yang SUDAH ADA di mapping
// Purchase Invoice (bukan kolom baru) — 1 baris Excel = 1 sumber data,
// bukan minta user isi nama barang 2x.
export function extractItemCreateFields(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> {
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
