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
    // § Fase 64 — Atribut Tambahan LEVEL HEADER/FAKTUR (BEDA dari
    // attribut1-10 di atas yang level ITEM). Ditemukan lewat email
    // resmi Accurate Support (forward dari client, tiket #357901,
    // 2026-04-24) — field ini TIDAK ADA di `accurate-openapi.json`
    // (dicek: 0 kemunculan "charField"/"numericField"/"dateField" di
    // seluruh file) — spec yang jadi acuan Fase 55/61 TERNYATA TIDAK
    // LENGKAP untuk fitur ini, BUKAN berarti field-nya tidak ada di API
    // sungguhan. Contoh body resmi dari Accurate Support (utk Purchase
    // Invoice, field TOP-LEVEL sejajar `vendorNo`/`transDate`, BUKAN di
    // dalam `detailItem`): `{"vendorNo":"V.00001","charField1":"...",
    // "detailItem":[...]}`. Diasumsikan berlaku sama untuk Sales
    // Invoice (API Accurate konsisten lintas jenis transaksi, § riset
    // dataClassificationNName Fase 61 yang konsisten di 30+ endpoint)
    // — DIPERKUAT bukti independen: Excel asli client (`format_sales_inv_v7 (PLAN).xlsx`)
    // punya PERSIS 10 kolom "CUSTOM CHARACTER" + 10 "CUSTOM NUMBER" + 2
    // "CUSTOM DATE" TANPA prefix "ITEM:" (level header) — cocok PERSIS
    // jumlah charField1-10/numericField1-10/dateField1-2. BELUM
    // diverifikasi end-to-end ke Accurate sungguhan untuk Sales Invoice
    // spesifik (baru dikonfirmasi resmi untuk Purchase Invoice) — catat
    // di Known Limitations kalau ternyata beda.
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
    // § Fase 73 (2026-09-09) — Atribut Tambahan LEVEL ITEM
    // (charField/numericField/dateField NESTED di `detailItem`, BEDA
    // dari attributHeader* di atas yang level FAKTUR/root). Dikonfirmasi
    // RESMI oleh Accurate Support (balasan ke pertanyaan spesifik
    // "detail item di transaksi Sales Invoice"): 15 slot Karakter
    // (charField1-15, BUKAN 10 seperti level header!), 10 slot Angka
    // (numericField1-10), 2 slot Tanggal (dateField1-2). Field ini juga
    // TIDAK ADA di `accurate-openapi.json` (pola sama seperti header
    // dulu, spec resmi memang tidak lengkap untuk fitur Atribut
    // Tambahan). Ini PERSIS field yang client maksud sejak awal sebagai
    // "ITEM: CUSTOM CHARACTER" (Fase 55/61 KELIRU menyimpulkan field ini
    // "tidak mungkin ada" — Excel asli client PUNYA PERSIS 15 kolom
    // "ITEM:CUSTOM CHARACTER", cocok PERSIS dengan 15 slot ini) dan
    // Fase 69/71 KELIRU menyamakannya dengan Kategori Keuangan
    // (dataClassificationNName) — dikoreksi sekarang, field API BENAR
    // untuk "ITEM: CUSTOM CHARACTER" adalah charField, BUKAN
    // dataClassificationNName.
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
    // § Fase 74 (2026-09-09) — Level EXPENSE (baris Beban, `detailExpense[]`
    // di payload — array TERPISAH dari `detailItem[]`), diverifikasi dari
    // spec resmi (`/api/sales-invoice/save.do` § `detailExpense.items.properties`):
    // `accountNo` (Kode Akun Perkiraan, WAJIB secara logis), `expenseName`,
    // `expenseAmount`, `expenseNotes`, `departmentName`, dan
    // `dataClassification1Name`-`10Name` (Kategori Keuangan — field API
    // SAMA PERSIS dengan level Item, § Fase 68, cuma nempel di array
    // berbeda — `findOrCreateDataClassification` di-reuse langsung,
    // tidak perlu fungsi auto-create baru). 1 baris Excel BISA
    // menyumbang 1 baris Barang (`detailItem`) DAN/ATAU 1 baris Beban
    // (`detailExpense`) sekaligus — kalau `expenseAccountNo` DAN
    // `expenseAmount` terisi di baris itu, baris itu ikut jadi 1 entri
    // expense terpisah (§ `buildDetailExpenseFromRow`).
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
    Tanggal: "transDate",
    // § Fase 70 (2026-09-08) — "Bill No" jadi judul kolom BARU (client
    // minta konsisten dengan istilah "Bill No" di Purchase Invoice),
    // "PO Number" TETAP dipertahankan sebagai sinonim lama (backward
    // compat, § pola sama Fase 69 untuk Kategori Keuangan).
    "Bill No": "poNumber",
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
    // § Fase 65 — bug ditemukan (feedback client, "Unit Price belum
    // masuk" dkk): dibandingkan header ASLI Excel standar Accurate
    // (`format_sales_inv_v7 (PLAN).xlsx`), TERNYATA MAYORITAS tebakan
    // `defaultColumnMap` di atas TIDAK COCOK — bukan cuma beda huruf
    // besar/kecil (matching SUDAH case-insensitive, § `sales-invoice-import.route.ts`),
    // tapi KATA-NYA SENDIRI beda (mis. "Unit Price" vs "ITEM UNIT PRICE",
    // "Note" vs "DESCRIPTION", "Pay Term" vs "PAYMENT TERM NAME"). Field
    // TETAP bisa dipetakan manual (semua ADA di dropdown
    // `ACCURATE_FIELDS`/`import/page.tsx`), tapi TIDAK auto-suggest —
    // client kemungkinan besar melihat "(tidak dipetakan)" dan
    // mengira field itu tidak didukung. Sinonim di bawah nama ASLI
    // template standar Accurate ("format_sales_inv_v7" — kemungkinan
    // besar nama file EXPORT BAKU Accurate, bukan custom 1 client,
    // jadi perbaikan ini menguntungkan SEMUA pengguna modul ini) —
    // tebakan lama TETAP DIPERTAHANKAN (bukan dihapus, harmless sebagai
    // sinonim tambahan kalau ada format lain yang kebetulan pakai itu).
    "TRANS DATE": "transDate",
    "PURCHASE ORDER NO": "poNumber",
    DESCRIPTION: "description",
    "PAYMENT TERM NAME": "paymentTermName",
    "REVERSE INVOICE": "reverseInvoice",
    "CASH DISC": "cashDiscount",
    "CASH DISC %": "cashDiscPercent",
    "DOCUMENT TRANSACTION": "documentTransaction",
    "ITEM UNIT PRICE": "unitPrice",
    "ITEM: WAREHOUSE": "warehouseName",
    "ITEM NOTE": "itemNotes",
    "ITEM: CASH DISCOUNT": "itemCashDiscount",
    "ITEM: CASH DISC %": "itemDiscPercent",
    "ITEM: DEPT": "departmentName",
    "ITEM: PROJECT NO": "projectNo",
    // § Fase 73 (2026-09-09) — Atribut Tambahan LEVEL ITEM
    // (charField/numericField/dateField NESTED di `detailItem`),
    // dikonfirmasi RESMI Accurate Support khusus untuk "detail item di
    // transaksi Sales Invoice": 15 slot Karakter, 10 slot Angka, 2 slot
    // Tanggal. INI PERSIS field yang dimaksud client sejak Fase 55/61
    // sebagai "ITEM: CUSTOM CHARACTER" (BUKAN Kategori Keuangan seperti
    // salah kesimpulan Fase 69/71 — dikoreksi di sini dengan field API
    // yang BENAR).
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
    // § Fase 55/61 — SEBELUMNYA "ITEM:CUSTOM CHARACTER 1..10" dipetakan
    // ke sini (attribut1-10). § Fase 71 (2026-09-08) DIKOREKSI/DIHAPUS:
    // client tunjukkan file Excel mereka sendiri (highlight kuning) yang
    // membuktikan "ITEM:CUSTOM CHARACTER N" itu field API BERBEDA dari
    // "Kategori Keuangan" (dataClassificationNName) — bukan sinonim.
    // § Fase 73 — field yang BENAR untuk "ITEM: CUSTOM CHARACTER" sudah
    // ditemukan (`attributItemKarakter1-15` di atas, § charField).
    // "Kategori Keuangan N" di bawah TETAP jadi satu-satunya nama kolom
    // untuk attribut1-10 (dataClassificationNName) — 2 field ini
    // TIDAK PERNAH sinonim satu sama lain, keduanya field API BERBEDA.
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
    // § Fase 64 — Atribut Tambahan LEVEL HEADER (nama kolom Excel client
    // TANPA prefix "ITEM:", beda dari yang di atas). `charField`/
    // `numericField`/`dateField` — lihat komentar `fieldToAccuratePath`.
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
    // § Fase 74 — level EXPENSE (baris Beban), lihat komentar
    // `fieldToAccuratePath`. Ditaruh PALING AKHIR di template (setelah
    // "Kategori Keuangan 10") sesuai permintaan — lihat `template-guide.ts`.
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
const DATE_FIELDS = new Set<SalesInvoiceField>([
  "transDate",
  "taxDate",
  "shipDate",
  "attributHeaderTanggal1",
  "attributHeaderTanggal2",
  // § Fase 73
  "attributItemTanggal1",
  "attributItemTanggal2",
]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § Fase 66 — bug ditemukan (feedback client: "isi kolom diskon & pajak
// -> gagal 'Faktur Penjualan tidak tepat', hapus -> berhasil"). Dicek ke
// `accurate-openapi.json`: field ini WAJIB tipe JSON `boolean` MURNI
// (`true`/`false`, § deskripsi resmi "Cth: true / false"), TAPI
// `template-guide.ts` instruksikan user ketik teks "TRUE"/"FALSE" di
// Excel — SheetJS baca cell teks sebagai STRING JS ("TRUE"), BUKAN
// boolean asli. Payload yang terkirim `"taxable": "TRUE"` (string) —
// Accurate reject dengan pesan generik yang TIDAK menyebut field
// spesifiknya sama sekali, bikin sulit didiagnosis dari sisi user.
const BOOLEAN_FIELDS = new Set<SalesInvoiceField>(["taxable", "inclusiveTax", "reverseInvoice", "useTax1", "useTax2", "useTax3"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "yes", "1", "ya"]);

function toAccurateBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return TRUE_TEXT_VALUES.has(value.trim().toLowerCase());
  return value;
}

// § Fase 66 — `cashDiscPercent`/`itemDiscPercent` WAJIB tipe JSON
// `string` di Accurate (BUKAN number — beda dari `cashDiscount`/
// `itemCashDiscount` yang justru WAJIB `number`), supaya bisa terima
// format diskon bertingkat ("5 + 2" = diskon 5% lalu 2%). Kalau user
// isi angka polos di Excel (mis. "5"), SheetJS baca sebagai JS number
// — dikirim sebagai number ke field yang expect string, Accurate
// reject dengan pesan generik yang sama.
const PERCENT_STRING_FIELDS = new Set<SalesInvoiceField>(["cashDiscPercent", "itemDiscPercent"]);

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
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (PERCENT_STRING_FIELDS.has(f)) values[f] = String(raw);
      else values[f] = raw;
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
    // § Fase 74 — "detailExpense." JUGA di-skip di sini (bukan cuma
    // "detailItem."), field itu masuk ke array `detailExpense[]`
    // terpisah (§ `buildDetailExpenseFromRow`), BUKAN root payload.
    if (accuratePath.startsWith("detailItem.") || accuratePath.startsWith("detailExpense.")) continue;
    const value = headerValues[field as SalesInvoiceField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  // § Fase 74 — 1 baris Excel BISA sumbang 1 entri `detailExpense`
  // TERPISAH dari `detailItem`-nya (kalau kolom Beban terisi di baris
  // itu) — `buildDetailExpenseFromRow` balikin `null` kalau baris itu
  // tidak punya data Beban sama sekali. Array `detailExpense` cuma
  // disertakan di payload KALAU ada minimal 1 baris yang isi Beban
  // (Accurate default-kan array kosong sendiri kalau field ini tidak
  // dikirim — konsisten pola field opsional lain di codebase ini).
  const detailExpense = rawRows.map((rawRow) => buildDetailExpenseFromRow(rawRow, columnMapping)).filter((entry): entry is Record<string, unknown> => entry !== null);
  if (detailExpense.length > 0) payload.detailExpense = detailExpense;

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

// § Fase 74 — mirror `buildDetailItemFromRow`, tapi untuk array
// `detailExpense` (baris Beban, § komentar `fieldToAccuratePath`).
// `accountNo`+`expenseAmount` dianggap syarat MINIMAL 1 baris punya
// data Beban yang valid (tanpa akun perkiraan & nominal, entri Beban
// tidak ada artinya) — kalau salah satu kosong, baris ini dianggap
// TIDAK punya data Beban sama sekali (return `null`), bukan dikirim
// setengah-setengah ke Accurate.
export function buildDetailExpenseFromRow(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> | null {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailExpense: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(salesInvoiceMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailExpense.")) continue;
    const value = rowValues[field as SalesInvoiceField];
    if (value !== undefined) detailExpense[accuratePath.slice("detailExpense.".length)] = value;
  }
  if (detailExpense.accountNo === undefined || detailExpense.expenseAmount === undefined) return null;
  return detailExpense;
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

// § Fase 68 — daftar (index, name) Atribut Tambahan item-level yang
// TERISI di 1 baris, dipakai worker untuk auto-create Kategori Keuangan
// (`findOrCreateDataClassification`, accurate-data-classification.ts)
// SEBELUM kirim payload faktur. `index` 1-10 HARUS persis cocok slot
// `attributN` (`dataClassificationNName`) — lihat komentar Fase 55 di
// `fieldToAccuratePath`.
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

// § Fase 74 — mirror `extractDataClassificationValues`, tapi untuk
// Kategori Keuangan level EXPENSE (`expenseKategoriKeuanganN`, field API
// SAMA `dataClassificationNName`, cuma nempel di `detailExpense[]`).
// Worker reuse `findOrCreateDataClassification` yang SAMA (fungsi itu
// tidak peduli item/expense, cuma peduli index+name).
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
