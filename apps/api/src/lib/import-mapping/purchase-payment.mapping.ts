// § architecture-purchase-payment.md — Purchase Payment BUKAN mirror
// Purchase Invoice (bikin tagihan), ini APLIKASI PEMBAYARAN ke faktur yang
// SUDAH ADA di Accurate.
//
// § Fase 50 — DIREVISI (mirror PERSIS fix Sales Receipt Fase 49): awalnya
// "1 baris Excel = 1 payload" (keputusan MVP). Audit data ASLI kompetitor
// (`docs/referencehtml/FACPORT_purchase_payment.xlsx`, 646 baris)
// menemukan 258 transaksi, **110 (43%) bayar >1 faktur sekaligus**
// (sampai 30 faktur dalam 1 pembayaran). `detailInvoice[]` di Accurate
// SUDAH didesain sebagai array, kita cuma belum pernah pakai
// kapasitasnya. `paymentNumber` (field BARU, → Accurate `number`) jadi
// kunci grouping — OPSIONAL, user yang belum mapping kolom ini tetap
// dapat perilaku LAMA (1 baris = 1 pembayaran), zero regression.
//
// § Fase 89 (2026-09-10) — EKSPANSI 16 field opsional sesuai wishlist
// client (`template-purchase-payment.xlsx` Sheet1, copy dari template
// kompetitor `Sample_Format_Import_PP_v4.0.xlsx`), dikonfirmasi 5
// sumber independen: spec resmi Accurate, template kompetitor, 595
// baris data TRANSAKSI ASLI kompetitor, 5 screenshot UI Accurate ASLI
// dari client. Detail lengkap → `docs/architecture/architecture-purchase-payment.md`
// § "Ekspansi Field Opsional — Fase 89". 1 field DI-SKIP (PPh Amount —
// nilai read-only/auto-computed, persis pola "Tax Amount" Sales
// Receipt Fase 85).
export const purchasePaymentMapping = {
  // § Fase 90 (2026-09-10) — "branchName" DIJADIKAN WAJIB. Dikonfirmasi
  // via test call NYATA ke Accurate (company "Retail Demo"): company
  // dengan multi-cabang MENOLAK transaksi tanpa branch eksplisit
  // ("Profil pengguna anda memiliki akses ke lebih dari satu cabang.
  // Anda harus menentukan cabang saat penulisan data.") — spec resmi
  // menandainya opsional di level SCHEMA, tapi validasi RUNTIME Accurate
  // sendiri mewajibkannya untuk company multi-cabang. Diputuskan (user):
  // wajibkan di SEMUA kasus (bukan cuma kondisional) — client company
  // 1-cabang cukup isi nama cabangnya sekali, lebih aman daripada error
  // membingungkan di tengah import besar.
  requiredFields: ["vendorNo", "bankNo", "chequeAmount", "transDate", "invoiceNo", "branchName"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    bankNo: "bankNo",
    // § "chequeAmount" ini SECARA HISTORIS (Fase 33/50) sebenarnya nilai
    // PEMBAYARAN PER BARIS ("Payment" → detailInvoice[].paymentAmount),
    // BUKAN root chequeAmount literal — root-nya dihitung otomatis (SUM)
    // di `buildPurchasePaymentPayload`. Nama field internal ini TIDAK
    // diubah (hindari breaking change) — root chequeAmount EKSPLISIT
    // yang baru (Fase 89) pakai nama field TERPISAH: `paymentTotalAmount`.
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    paymentNumber: "number", // § Fase 50 — kunci grouping (opsional), nomor transaksi pembayaran sendiri
    // § Fase 89 — root/header (dari baris PERTAMA grup saja, sama pola
    // customerNo/bankNo/transDate).
    description: "description",
    branchName: "branchName",
    currencyCode: "currencyCode",
    rate: "rate",
    // § "Cheque Amount" (kolom BARU, EKSPLISIT) — kalau diisi user,
    // dipakai APA ADANYA sebagai root `chequeAmount` (override); kalau
    // kosong, tetap fallback ke auto-SUM (perilaku Fase 50, zero
    // regression). Lihat `buildPurchasePaymentPayload`.
    paymentTotalAmount: "chequeAmount",
    chequeNo: "chequeNo",
    chequeDate: "chequeDate",
    paymentMethod: "paymentMethod", // ENUM, lihat PAYMENT_METHOD_LABEL_MAP di bawah
    // § Fase 89 — per baris/faktur (nested di `detailInvoice[]`).
    paidPph: "detailInvoice[].paidPph", // boolean, konvensi "Y"/kosong
    pphNumber: "detailInvoice[].pphNumber",
    // § Fase 89 — `detailDiscount[]` NESTED SATU LEVEL LEBIH DALAM, DI
    // DALAM tiap elemen `detailInvoice[]` (dikonfirmasi spec + screenshot
    // #3 "Informasi Diskon"). 1 baris Excel (1 elemen detailInvoice)
    // MAKSIMAL 1 entri detailDiscount — dianggap punya data diskon kalau
    // MINIMAL "Discount" (amount) DAN "Discount Acc" (accountNo) terisi,
    // mirror pola `buildDetailExpenseFromRow` (Sales Invoice)/Sales
    // Receipt Fase 85.
    discountAmount: "detailInvoice[].detailDiscount[].amount",
    discountAccountNo: "detailInvoice[].detailDiscount[].accountNo",
    discountNotes: "detailInvoice[].detailDiscount[].discountNotes",
    discountDepartmentName: "detailInvoice[].detailDiscount[].departmentName",
    discountProjectNo: "detailInvoice[].detailDiscount[].projectNo",
    // § Fase 100 (2026-09-10) — ⚠️ SPECULATIVE, MIRROR Sales Receipt
    // Fase 99, BELUM DIKONFIRMASI RESMI khusus untuk endpoint INI.
    // Jawaban Accurate Support soal PPh23 kemarin SPESIFIK untuk
    // `sales-receipt/save.do` — `purchase-payment/save.do` TIDAK
    // ditanyakan terpisah (user pilih terapkan sekarang berdasar
    // kemiripan struktur, bukan konfirmasi tertulis). Kalau ternyata
    // endpoint ini BEDA (riwayat project: field yang kelihatan simetris
    // antar endpoint Accurate TIDAK SELALU simetris, § saga Sales
    // Invoice Fase 71-73), retest akan gagal dengan error Accurate yang
    // jelas (bukan diam-diam diabaikan seperti sebelumnya) — BUKAN
    // silent failure, jadi risikonya terukur. `taxId` DIKOREKSI dari
    // "validasi-only" (Fase 89) jadi dikirim sebagai `detailTax[].taxId`
    // (angka, resolve lewat `findTaxByIdentifier` — fungsi SAMA yang
    // dipakai Sales Receipt).
    taxId: "detailTax[].taxId",
    // § Fase 100 — "PPh Amount" JUGA dikoreksi dari Fase 89 ("❌ SKIP,
    // read-only") — SAMA alasan Sales Receipt Fase 99: UI Accurate
    // auto-hitung lewat jalur internal berbeda, TAPI via API caller
    // harus supply sendiri nominalnya. SPECULATIVE, lihat komentar
    // `taxId` di atas.
    taxAmount: "detailTax[].taxAmount",
  } as const,
  // § Fase 89 (2026-09-10) — URUTAN entri di bawah SENGAJA mengikuti
  // PERSIS urutan wishlist client (`template-purchase-payment.xlsx`
  // Sheet1 = template kompetitor `Sample_Format_Import_PP_v4.0.xlsx`)
  // — permintaan eksplisit user, konsisten koreksi Sales Receipt Fase
  // 85/86. Alias Indonesia lama (§ Fase 50) TETAP ada di akhir sebagai
  // alias sekunder, non-breaking — urutan object key di JS TIDAK
  // memengaruhi fungsi matching (tetap by NAME).
  defaultColumnMap: {
    "Date": "transDate",
    "Purchase Payment No": "paymentNumber",
    "No. Bank Account": "bankNo",
    "No. Supplier": "vendorNo",
    "Description": "description",
    "Branch": "branchName",
    "Currency Code": "currencyCode",
    "Rate": "rate",
    "Cheque Amount": "paymentTotalAmount",
    "Cheque No": "chequeNo",
    "Cheque Date": "chequeDate",
    "Payment Method": "paymentMethod",
    "Invoice No": "invoiceNo",
    "Payment": "chequeAmount", // § BUKAN "Cheque Amount" — lihat komentar di atas
    "Paid PPH": "paidPph",
    "PPh No": "pphNumber",
    "PPh ID": "taxId",
    "PPh Amount": "taxAmount",
    "Discount": "discountAmount",
    "Discount Acc": "discountAccountNo",
    "Discount Note": "discountNotes",
    "Discount - Dept": "discountDepartmentName",
    "Discount - Project No": "discountProjectNo",
    // § label Indonesia lama (tetap didukung, non-breaking)
    "No Pemasok": "vendorNo",
    "Nomor Vendor": "vendorNo",
    "Akun Bank/Kas": "bankNo",
    "Kode Akun Bank": "bankNo",
    "Jumlah Bayar": "chequeAmount",
    "Tanggal": "transDate",
    "No Faktur": "invoiceNo",
    "Nomor Faktur": "invoiceNo",
  } as Record<string, string>,
};

export type PurchasePaymentField = keyof typeof purchasePaymentMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type PurchasePaymentGroup = { paymentNumber: string | null; rows: ImportRowRecord[] };

// § Fase 50 — mirror `receiptNumberColumnOf` (Sales Receipt, Fase 49).
export function paymentNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "paymentNumber")?.[0] ?? null;
}

function paymentNumberOf(row: ImportRowRecord, paymentNumberColumn: string | null): string | null {
  if (!paymentNumberColumn) return null;
  const value = row.rawData[paymentNumberColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § Fase 50 — mirror `groupSalesReceiptRows`. Baris TANPA nilai di
// kolom paymentNumber tetap jadi grup sendiri-sendiri — behavior LAMA
// (1 baris = 1 pembayaran), TIDAK ADA regresi.
export function groupPurchasePaymentRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): PurchasePaymentGroup[] {
  const paymentNumberColumn = paymentNumberColumnOf(columnMapping);
  const groups: PurchasePaymentGroup[] = [];
  const byPaymentNumber = new Map<string, PurchasePaymentGroup>();

  for (const row of rows) {
    const paymentNumber = paymentNumberOf(row, paymentNumberColumn);
    if (paymentNumber === null) {
      groups.push({ paymentNumber: null, rows: [row] });
      continue;
    }
    const key = paymentNumber.toLowerCase();
    let group = byPaymentNumber.get(key);
    if (!group) {
      group = { paymentNumber, rows: [] };
      byPaymentNumber.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § Fase 50 — mirror `validateGroupCustomerConsistencyForReceipt`: semua
// baris 1 grup (1 pembayaran) WAJIB vendorNo sama.
export function validateGroupVendorConsistencyForPayment(
  group: PurchasePaymentGroup,
  columnMapping: Record<string, string>,
): string | null {
  const vendorNoColumn = Object.entries(columnMapping).find(([, field]) => field === "vendorNo")?.[0];
  if (!vendorNoColumn) return null;

  const vendorNos = new Set(
    group.rows
      .map((row) => row.rawData[vendorNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (vendorNos.size <= 1) return null;

  const label = group.paymentNumber ?? "(tanpa Purchase Payment No)";
  return `Purchase Payment No "${label}" dipakai untuk vendor berbeda-beda (${[...vendorNos].join(", ")}) — pastikan semua baris 1 pembayaran pakai Nomor Vendor yang sama.`;
}

// § lessons-learned.md 2026-08-19 — Excel date input HARUS dinormalisasi
// ke DD/MM/YYYY (Accurate WAJIB format ini). BUG DITEMUKAN & DIPERBAIKI
// Fase 88 (2026-09-10) — `transDate` TIDAK PERNAH dinormalisasi sejak
// modul ini dibangun.
const DATE_FIELDS = new Set<PurchasePaymentField>(["transDate", "chequeDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § Fase 89 — konvensi boolean kompetitor "isikan Y jika ..., kosongkan
// jika tidak" (SAMA PERSIS Sales Receipt Fase 85) — TRUE_TEXT_VALUES
// SUDAH terima "y"/"ya" case-insensitive.
const BOOLEAN_FIELDS = new Set<PurchasePaymentField>(["paidPph"]);
const TRUE_TEXT_VALUES = new Set(["true", "y", "ya", "yes", "1"]);

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
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value; // sudah DD/MM/YYYY
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  if (!date || Number.isNaN(date.getTime())) return value;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// § Fase 89 — enum resmi `paymentMethod` (DIKONFIRMASI ke spec resmi +
// screenshot #4 "Metode Bayar" UI Accurate asli — IDENTIK Sales Receipt
// Fase 85, koreksi dari Penjelasan Kolom kompetitor yang cuma sebut 8
// nilai, kurang `CREDIT_CARD`/`DEBIT_CARD`/`E_WALLET`). Kolom Excel
// boleh isi label Indonesia ATAU enum API langsung; nilai lain
// diteruskan APA ADANYA (biar Accurate sendiri yang reject).
const VALID_PAYMENT_METHODS = new Set([
  "BANK_CHEQUE",
  "BANK_TRANSFER",
  "CASH_OTHER",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "EDC",
  "E_WALLET",
  "OTHERS",
  "PAYMENT_LINK",
  "QRIS",
  "VIRTUAL_ACCOUNT",
]);
const PAYMENT_METHOD_LABEL_MAP: Record<string, string> = {
  tunai: "CASH_OTHER",
  "cek/giro": "BANK_CHEQUE",
  "transfer bank": "BANK_TRANSFER",
  edc: "EDC",
  "kartu debit": "DEBIT_CARD",
  "kartu kredit": "CREDIT_CARD",
  qris: "QRIS",
  "payment link": "PAYMENT_LINK",
  "virtual account": "VIRTUAL_ACCOUNT",
  "dompet digital": "E_WALLET",
  "non tunai lainnya": "OTHERS",
};

function toAccuratePaymentMethod(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const asEnum = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_PAYMENT_METHODS.has(asEnum)) return asEnum;
  const mapped = PAYMENT_METHOD_LABEL_MAP[trimmed.toLowerCase()];
  return mapped ?? trimmed;
}

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<PurchasePaymentField, unknown>> {
  const values: Partial<Record<PurchasePaymentField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as PurchasePaymentField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (f === "paymentMethod") values[f] = toAccuratePaymentMethod(raw);
      else values[f] = raw;
    }
  }
  return values;
}

// § Fase 89, tujuan DIKOREKSI Fase 100 (speculative, mirror Sales
// Receipt Fase 99 — lihat komentar `taxId` di atas) — kumpulkan nilai
// "PPh ID" UNIK dari semua baris grup, untuk di-RESOLVE ke id numerik
// Accurate (`resolveTaxIdsForPurchasePayment` di `workers/index.ts`)
// SEBELUM payload dibangun — hasil resolve-nya dipakai
// `buildPurchasePaymentPayload` mengisi `detailTax[].taxId`. Dedupe
// (Set), mirror `extractTaxIdsFromRows` (Sales Receipt).
export function extractTaxIdsFromRows(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): string[] {
  const ids = new Set<string>();
  for (const rawRow of rawRows) {
    const values = extractRowValues(rawRow, columnMapping);
    if (values.taxId !== undefined) {
      const trimmed = String(values.taxId).trim();
      if (trimmed !== "") ids.add(trimmed);
    }
  }
  return [...ids];
}

// § Fase 89 — mirror `buildDetailDiscountFromRowValues` (Sales Receipt
// Fase 85): `discountAmount`+`discountAccountNo` syarat MINIMAL supaya
// baris dianggap punya data diskon.
function buildDetailDiscountFromRowValues(rowValues: Partial<Record<PurchasePaymentField, unknown>>): Record<string, unknown> | null {
  if (rowValues.discountAmount === undefined || rowValues.discountAccountNo === undefined) return null;
  const discount: Record<string, unknown> = {
    amount: Number(rowValues.discountAmount),
    accountNo: String(rowValues.discountAccountNo),
  };
  if (rowValues.discountNotes !== undefined) discount.discountNotes = String(rowValues.discountNotes);
  if (rowValues.discountDepartmentName !== undefined) discount.departmentName = String(rowValues.discountDepartmentName);
  if (rowValues.discountProjectNo !== undefined) discount.projectNo = String(rowValues.discountProjectNo);
  return discount;
}

// § Fase 50 — signature: `(rawRows[], columnMapping)`, mirror
// `buildSalesReceiptPayload`. Header (`vendorNo`, `bankNo`, `transDate`
// — § Fase 89, field root baru JUGA header) dari baris PERTAMA grup —
// divalidasi konsisten lewat `validateGroupVendorConsistencyForPayment`
// SEBELUM fungsi ini dipanggil (caller, § workers/index.ts).
// `chequeAmount` (root) = "Cheque Amount" EKSPLISIT kalau diisi (§ Fase
// 89), fallback SUM semua `paymentAmount` baris dalam grup kalau kosong
// (perilaku Fase 50, zero regression).
// § Fase 100 (2026-09-10) — parameter BARU `resolvedTaxIds`, SPECULATIVE
// mirror `buildSalesReceiptPayload` Fase 99 (lihat komentar `taxId` di
// `fieldToAccuratePath` atas) — BELUM dikonfirmasi resmi Accurate
// Support khusus endpoint ini. Default `new Map()` supaya caller lama
// (tanpa PPh ID) tetap jalan tanpa ubah signature call site.
export function buildPurchasePaymentPayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  resolvedTaxIds: Map<string, number> = new Map(),
): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);
  const detailTax: Record<string, unknown>[] = [];

  const detailInvoice = rawRows.map((rawRow) => {
    const rowValues = extractRowValues(rawRow, columnMapping);
    const invoiceNo = String(rowValues.invoiceNo ?? "");
    const entry: Record<string, unknown> = {
      invoiceNo,
      paymentAmount: Number(rowValues.chequeAmount ?? 0),
    };
    if (rowValues.paidPph !== undefined) entry.paidPph = rowValues.paidPph;
    if (rowValues.pphNumber !== undefined) entry.pphNumber = String(rowValues.pphNumber);
    const discount = buildDetailDiscountFromRowValues(rowValues);
    if (discount) entry.detailDiscount = [discount];

    // § Fase 100 — SPECULATIVE, mirror `buildSalesReceiptPayload` Fase
    // 99 persis (syarat minimal taxId+taxAmount sama-sama terisi, taxId
    // harus berhasil di-resolve).
    if (rowValues.taxId !== undefined && rowValues.taxAmount !== undefined) {
      const resolvedId = resolvedTaxIds.get(String(rowValues.taxId).trim());
      if (resolvedId !== undefined) {
        detailTax.push({ detailInvoiceNo: invoiceNo, taxAmount: Number(rowValues.taxAmount), taxId: resolvedId });
      }
    }
    return entry;
  });

  // § Fase 90 (2026-09-10, BUG DITEMUKAN via test call NYATA ke Accurate,
  // company "Retail Demo", vendor SGD "ASMUS") — root `chequeAmount`
  // HARUS dalam mata uang BANK (basis perusahaan), SEDANGKAN
  // `detailInvoice[].paymentAmount` (kolom "Payment") tetap dalam mata
  // uang FAKTUR ASLI. Auto-SUM polos (tanpa kali `rate`) menghasilkan
  // root `chequeAmount` SALAH untuk transaksi mata uang asing —
  // dikonfirmasi NYATA: Accurate menolak "Total Debit dan Kredit tidak
  // cocok" saat auto-SUM 1 (SGD) dikirim sebagai chequeAmount root,
  // padahal seharusnya 1 × kurs (12600.000001 IDR) — baru berhasil
  // setelah dikalikan `rate`. Kalau `rate` tidak diisi (transaksi mata
  // uang dasar, kasus PALING UMUM), kali 1 — ZERO REGRESSION.
  const rateMultiplier = headerValues.rate !== undefined ? Number(headerValues.rate) : 1;
  const autoSummedChequeAmount = detailInvoice.reduce((sum, d) => sum + (d.paymentAmount as number), 0) * rateMultiplier;

  const payload: Record<string, unknown> = {
    vendorNo: String(headerValues.vendorNo ?? ""),
    bankNo: String(headerValues.bankNo ?? ""),
    transDate: String(headerValues.transDate ?? ""),
    chequeAmount: headerValues.paymentTotalAmount !== undefined ? Number(headerValues.paymentTotalAmount) : autoSummedChequeAmount,
    detailInvoice,
  };
  if (headerValues.paymentNumber !== undefined) payload.number = String(headerValues.paymentNumber);
  if (headerValues.description !== undefined) payload.description = String(headerValues.description);
  if (headerValues.branchName !== undefined) payload.branchName = String(headerValues.branchName);
  if (headerValues.currencyCode !== undefined) payload.currencyCode = String(headerValues.currencyCode);
  if (headerValues.rate !== undefined) payload.rate = Number(headerValues.rate);
  if (headerValues.chequeNo !== undefined) payload.chequeNo = String(headerValues.chequeNo);
  if (headerValues.chequeDate !== undefined) payload.chequeDate = String(headerValues.chequeDate);
  if (headerValues.paymentMethod !== undefined) payload.paymentMethod = headerValues.paymentMethod;
  // § Fase 100 — SPECULATIVE, mirror Sales Receipt Fase 99 (root, sibling `detailInvoice`).
  if (detailTax.length > 0) payload.detailTax = detailTax;

  return payload;
}
