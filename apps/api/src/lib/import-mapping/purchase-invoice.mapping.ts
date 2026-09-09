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
    // § Fase 75 (2026-09-09) — mirror LENGKAP dari Sales Invoice
    // (Fase 55/61/64/68/73/74), field API SEMUA sudah diverifikasi dari
    // spec resmi + (untuk charField/numericField/dateField) balasan
    // resmi Accurate Support pada modul Sales Invoice — DIASUMSIKAN
    // konsisten untuk Purchase Invoice (API Accurate konsisten lintas
    // jenis transaksi, § riset dataClassificationNName Fase 61 yang
    // sudah terbukti benar di 30+ endpoint). `dataClassificationNName`
    // SUDAH dikonfirmasi ADA di `detailItem`/`detailExpense` Purchase
    // Invoice langsung dari spec resmi (`accurate-openapi.json`) — beda
    // dari charField/numericField/dateField yang TETAP tidak
    // terdokumentasi resmi untuk modul mana pun (pola yang sudah
    // berulang kali terbukti sejak Fase 64). BELUM diverifikasi end-to-
    // end nyata khusus utk Purchase Invoice — catat di Known Limitations
    // kalau ternyata beda.
    //
    // Kategori Keuangan level ITEM (dataClassificationNName).
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
    // Atribut Tambahan level FAKTUR/HEADER (charField/numericField/dateField, ROOT payload).
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
    // Atribut Tambahan level ITEM (charField 15 slot/numericField 10 slot/dateField 2 slot, NESTED detailItem).
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
    // Level EXPENSE (baris Beban, `detailExpense[]` — array TERPISAH
    // dari `detailItem[]`). Kategori Keuangan level Expense pakai field
    // API SAMA (`dataClassificationNName`), cuma nempel array beda.
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
    // § Fase 75 (2026-09-09) — SEMUA ditaruh PALING AKHIR (setelah
    // seluruh kolom existing), TIDAK diselipkan di tengah — sesuai
    // permintaan. Nama kolom PERSIS sama dengan Sales Invoice supaya
    // konsisten lintas modul.
    "CUSTOM CHARACTER 1": "attributHeaderKarakter1",
    "CUSTOM CHARACTER 2": "attributHeaderKarakter2",
    "CUSTOM CHARACTER 3": "attributHeaderKarakter3",
    "CUSTOM CHARACTER 4": "attributHeaderKarakter4",
    "CUSTOM CHARACTER 5": "attributHeaderKarakter5",
    "CUSTOM CHARACTER 6": "attributHeaderKarakter6",
    "CUSTOM CHARACTER 7": "attributHeaderKarakter7",
    "CUSTOM CHARACTER 8": "attributHeaderKarakter8",
    "CUSTOM CHARACTER 9": "attributHeaderKarakter9",
    "CUSTOM CHARACTER 10": "attributHeaderKarakter10",
    "CUSTOM NUMBER 1": "attributHeaderAngka1",
    "CUSTOM NUMBER 2": "attributHeaderAngka2",
    "CUSTOM NUMBER 3": "attributHeaderAngka3",
    "CUSTOM NUMBER 4": "attributHeaderAngka4",
    "CUSTOM NUMBER 5": "attributHeaderAngka5",
    "CUSTOM NUMBER 6": "attributHeaderAngka6",
    "CUSTOM NUMBER 7": "attributHeaderAngka7",
    "CUSTOM NUMBER 8": "attributHeaderAngka8",
    "CUSTOM NUMBER 9": "attributHeaderAngka9",
    "CUSTOM NUMBER 10": "attributHeaderAngka10",
    "CUSTOM DATE 1": "attributHeaderTanggal1",
    "CUSTOM DATE 2": "attributHeaderTanggal2",
    "ITEM: CUSTOM CHARACTER 1": "attributItemKarakter1",
    "ITEM: CUSTOM CHARACTER 2": "attributItemKarakter2",
    "ITEM: CUSTOM CHARACTER 3": "attributItemKarakter3",
    "ITEM: CUSTOM CHARACTER 4": "attributItemKarakter4",
    "ITEM: CUSTOM CHARACTER 5": "attributItemKarakter5",
    "ITEM: CUSTOM CHARACTER 6": "attributItemKarakter6",
    "ITEM: CUSTOM CHARACTER 7": "attributItemKarakter7",
    "ITEM: CUSTOM CHARACTER 8": "attributItemKarakter8",
    "ITEM: CUSTOM CHARACTER 9": "attributItemKarakter9",
    "ITEM: CUSTOM CHARACTER 10": "attributItemKarakter10",
    "ITEM: CUSTOM CHARACTER 11": "attributItemKarakter11",
    "ITEM: CUSTOM CHARACTER 12": "attributItemKarakter12",
    "ITEM: CUSTOM CHARACTER 13": "attributItemKarakter13",
    "ITEM: CUSTOM CHARACTER 14": "attributItemKarakter14",
    "ITEM: CUSTOM CHARACTER 15": "attributItemKarakter15",
    "ITEM: CUSTOM NUMBER 1": "attributItemAngka1",
    "ITEM: CUSTOM NUMBER 2": "attributItemAngka2",
    "ITEM: CUSTOM NUMBER 3": "attributItemAngka3",
    "ITEM: CUSTOM NUMBER 4": "attributItemAngka4",
    "ITEM: CUSTOM NUMBER 5": "attributItemAngka5",
    "ITEM: CUSTOM NUMBER 6": "attributItemAngka6",
    "ITEM: CUSTOM NUMBER 7": "attributItemAngka7",
    "ITEM: CUSTOM NUMBER 8": "attributItemAngka8",
    "ITEM: CUSTOM NUMBER 9": "attributItemAngka9",
    "ITEM: CUSTOM NUMBER 10": "attributItemAngka10",
    "ITEM: CUSTOM DATE 1": "attributItemTanggal1",
    "ITEM: CUSTOM DATE 2": "attributItemTanggal2",
    "Kategori Keuangan 1": "attribut1",
    "Kategori Keuangan 2": "attribut2",
    "Kategori Keuangan 3": "attribut3",
    "Kategori Keuangan 4": "attribut4",
    "Kategori Keuangan 5": "attribut5",
    "Kategori Keuangan 6": "attribut6",
    "Kategori Keuangan 7": "attribut7",
    "Kategori Keuangan 8": "attribut8",
    "Kategori Keuangan 9": "attribut9",
    "Kategori Keuangan 10": "attribut10",
    "Akun Beban": "expenseAccountNo",
    "Nama Beban": "expenseName",
    "Jumlah Beban": "expenseAmount",
    "Catatan Beban": "expenseNotes",
    "Beban - Department": "expenseDepartmentName",
    "Kategori Keuangan Beban 1": "expenseKategoriKeuangan1",
    "Kategori Keuangan Beban 2": "expenseKategoriKeuangan2",
    "Kategori Keuangan Beban 3": "expenseKategoriKeuangan3",
    "Kategori Keuangan Beban 4": "expenseKategoriKeuangan4",
    "Kategori Keuangan Beban 5": "expenseKategoriKeuangan5",
    "Kategori Keuangan Beban 6": "expenseKategoriKeuangan6",
    "Kategori Keuangan Beban 7": "expenseKategoriKeuangan7",
    "Kategori Keuangan Beban 8": "expenseKategoriKeuangan8",
    "Kategori Keuangan Beban 9": "expenseKategoriKeuangan9",
    "Kategori Keuangan Beban 10": "expenseKategoriKeuangan10",
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
// § Fase 75 — attributHeaderTanggal1/2 (level FAKTUR) dan
// attributItemTanggal1/2 (level ITEM) ikut ditambahkan.
const DATE_FIELDS = new Set<PurchaseInvoiceField>(["transDate", "taxDate", "shipDate", "attributHeaderTanggal1", "attributHeaderTanggal2", "attributItemTanggal1", "attributItemTanggal2"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § Fase 66 — bug ditemukan di Sales Invoice (mirror 1:1 modul ini,
// field & builder sama persis) — feedback client: "isi kolom diskon &
// pajak -> gagal 'Faktur Penjualan tidak tepat', hapus -> berhasil".
// `accurate-openapi.json`: field ini WAJIB tipe JSON `boolean` MURNI
// (`true`/`false`), TAPI `template-guide.ts` instruksikan user ketik
// teks "TRUE"/"FALSE" — SheetJS baca sebagai STRING, terkirim salah
// tipe, Accurate reject dengan pesan generik yang tidak menyebut field
// spesifik. § detail lengkap `sales-invoice.mapping.ts`.
const BOOLEAN_FIELDS = new Set<PurchaseInvoiceField>(["taxable", "inclusiveTax", "reverseInvoice", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);

function toAccurateBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUE_TEXT_VALUES.has(value.trim().toLowerCase());
  return value;
}

// § Fase 66 — `cashDiscPercent`/`itemDiscPercent` WAJIB tipe JSON
// `string` di Accurate (support diskon bertingkat "5 + 2"), BUKAN
// number — kalau user isi angka polos, SheetJS baca sebagai JS number.
const PERCENT_STRING_FIELDS = new Set<PurchaseInvoiceField>(["cashDiscPercent", "itemDiscPercent"]);

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
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else values[f] = raw;
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
    // § Fase 75 — "detailExpense." JUGA di-skip (mirror Sales Invoice
    // Fase 74), field itu masuk array `detailExpense[]` terpisah.
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as PurchaseInvoiceField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  // § Fase 75 — mirror Sales Invoice Fase 74: 1 baris BISA sumbang 1
  // entri `detailExpense` TERPISAH dari `detailItem`-nya, kalau kolom
  // Beban terisi di baris itu. `payload.detailExpense` cuma disertakan
  // kalau ADA minimal 1 baris yang isi Beban.
  const detailExpense = rawRows.map((rawRow) => buildDetailExpenseFromRow(rawRow, columnMapping)).filter((entry): entry is Record<string, unknown> => entry !== null);
  if (detailExpense.length > 0) payload.detailExpense = detailExpense;

  return payload;
}

// § Fase 08, ADR-0012 — diextract dari `.map()` di atas SUPAYA dipakai
// ulang oleh jalur UPDATE faktur existing (`appendToExistingPurchaseInvoice`
// di workers/index.ts) TANPA duplikasi logic. Perilaku SAMA PERSIS dengan
// sebelum diextract.
export function buildDetailItemFromRow(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseInvoiceMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    const value = rowValues[field as PurchaseInvoiceField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }
  return detailItem;
}

// § Fase 75 — mirror `buildDetailItemFromRow`/Sales Invoice
// `buildDetailExpenseFromRow` (Fase 74), untuk array `detailExpense`
// (baris Beban). `accountNo`+`expenseAmount` WAJIB dua-duanya terisi
// supaya baris dianggap punya data Beban yang valid — kalau salah satu
// kosong, baris ini dianggap TIDAK punya data Beban sama sekali
// (return `null`).
export function buildDetailExpenseFromRow(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(purchaseInvoiceMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as PurchaseInvoiceField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
}

// § Fase 06, ADR-0011 — grouping baris Excel jadi 1 Faktur Pembelian
// berdasarkan kolom yang di-mapping ke "billNumber" (Bill No). Baris tanpa
// nilai Bill No (kolom tidak di-mapping user, ATAU di-mapping tapi
// kosong di baris itu) tetap jadi grup sendiri isi 1 baris — behavior
// SAMA PERSIS dengan sebelum ADR-0011, non-breaking buat user yang belum
// pakai multi-item.
export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type PurchaseInvoiceGroup = { billNumber: string | null; rows: ImportRowRecord[] };

// § Fase 08 — diexport supaya worker bisa cari kolom Bill No lintas-batch
// (`findExistingAccurateInvoiceId`), tanpa duplikasi logic pencarian kolom.
export function billNumberColumnOf(columnMapping: Record<string, string>): string | null {
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

// § Fase 75 — mirror `extractDataClassificationValues` Sales Invoice
// (Fase 68). Daftar (index, name) Kategori Keuangan level ITEM yang
// TERISI di 1 baris, dipakai worker untuk auto-create
// (`findOrCreateDataClassification`) SEBELUM kirim payload faktur.
export function extractDataClassificationValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const value = rawValueFor(rawRow, columnMapping, `attribut${index}`);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}

// § Fase 75 — mirror `extractExpenseDataClassificationValues` Sales
// Invoice (Fase 74). Kategori Keuangan level EXPENSE.
export function extractExpenseDataClassificationValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const value = rawValueFor(rawRow, columnMapping, `expenseKategoriKeuangan${index}`);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}
