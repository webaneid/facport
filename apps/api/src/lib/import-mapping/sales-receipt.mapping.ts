// § architecture-sales-receipt.md — Sales Receipt BUKAN mirror Sales
// Invoice (bikin tagihan), ini APLIKASI PENERIMAAN ke faktur yang SUDAH
// ADA di Accurate. Bayangan cermin PERSIS purchase-payment.mapping.ts
// (customerNo ganti vendorNo).
//
// § Fase 49 — DIREVISI: awalnya "1 baris Excel = 1 payload" (keputusan
// MVP, § architecture doc versi lama). Audit data ASLI kompetitor
// (`docs/referencehtml/FACPORT_Sales Receipt_v5.xlsx`, 556 baris)
// menemukan SEMUA 137 struk penerimaan (100%) itu MULTI-FAKTUR — bukan
// edge case, itu POLA UTAMA (contoh nyata: 1 struk bayar 2 faktur
// beda sekaligus). `detailInvoice[]` di Accurate SUDAH didesain sebagai
// array (dicek ke `accurate-openapi.json`), kita cuma belum pernah
// pakai kapasitasnya. `receiptNumber` (field BARU, → Accurate `number`)
// jadi kunci grouping — OPSIONAL, user yang belum mapping kolom ini
// tetap dapat perilaku LAMA (1 baris = 1 penerimaan), zero regression.
//
// § Fase 85 (2026-09-10) — EKSPANSI 18 field opsional sesuai wishlist
// client (sheet "NOTE", copy dari template kompetitor
// `FACPORT_Sales Receipt_v5.xlsx`), dikonfirmasi 4 sumber independen:
// spec resmi Accurate, template kompetitor, 7 screenshot UI Accurate
// ASLI dari client, dan dokumentasi resmi `/api/tax/*`. Detail lengkap
// riset & keputusan desain → `docs/architecture/architecture-sales-receipt.md`
// § "Ekspansi Field Opsional — Fase 85". 3 field TETAP DI-SKIP (Existing
// Credit/Return Overpay/Tax Amount) — tidak ada padanan API valid di
// sumber manapun, didokumentasikan lengkap untuk ditanyakan ke Accurate
// CS langsung kalau diperlukan nanti. § Fase 86 — "Tax ID" (awalnya
// SEMPAT di-skip juga) DIIMPLEMENTASI sebagai field VALIDASI-ONLY
// (lihat komentar `taxId` di bawah) — bukan mengikuti asumsi kompetitor,
// tapi berdasarkan test call nyata ke `/api/tax/*` milik Accurate.
export const salesReceiptMapping = {
  // § Fase 90 (2026-09-10) — "branchName" DIJADIKAN WAJIB. Dikonfirmasi
  // via test call NYATA ke Accurate (Purchase Payment, company sama
  // "Retail Demo", § purchase-payment.mapping.ts): company dengan
  // multi-cabang MENOLAK transaksi tanpa branch eksplisit — spec resmi
  // menandainya opsional di level SCHEMA, tapi validasi RUNTIME Accurate
  // mewajibkannya untuk company multi-cabang. Sama seperti Purchase
  // Payment, diputuskan (user): wajibkan di SEMUA kasus.
  requiredFields: ["customerNo", "bankNo", "chequeAmount", "transDate", "invoiceNo", "branchName"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    bankNo: "bankNo",
    // § "chequeAmount" ini SECARA HISTORIS (Fase 34/49) sebenarnya nilai
    // PEMBAYARAN PER BARIS ("Jumlah Bayar" → detailInvoice[].paymentAmount),
    // BUKAN root chequeAmount literal — root-nya dihitung otomatis (SUM)
    // di `buildSalesReceiptPayload`. Nama field internal ini TIDAK
    // diubah (hindari breaking change) — root chequeAmount EKSPLISIT
    // yang baru (Fase 85) pakai nama field TERPISAH: `receiptTotalAmount`.
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    receiptNumber: "number", // § Fase 49 — kunci grouping (opsional), nomor transaksi penerimaan sendiri
    // § Fase 85 — root/header (dari baris PERTAMA grup saja, sama pola
    // customerNo/bankNo/transDate).
    description: "description",
    branchName: "branchName",
    currencyCode: "currencyCode",
    rate: "rate",
    // § "Cheque Amount" (kolom BARU, EKSPLISIT) — kalau diisi user,
    // dipakai APA ADANYA sebagai root `chequeAmount` (override); kalau
    // kosong, tetap fallback ke auto-SUM (perilaku Fase 49, zero
    // regression). Lihat `buildSalesReceiptPayload`.
    receiptTotalAmount: "chequeAmount",
    chequeNo: "chequeNo",
    chequeDate: "chequeDate",
    paymentMethod: "paymentMethod", // ENUM, lihat PAYMENT_METHOD_MAP di bawah
    passValidateInvoiceDate: "passValidateInvoiceDate", // boolean, konvensi "Y"/kosong
    useCredit: "useCredit", // boolean, konvensi "Y"/kosong
    // § Fase 85 — per baris/faktur (nested di `detailInvoice[]`).
    invoiceDepartmentName: "detailInvoice[].departmentName",
    paidPph: "detailInvoice[].paidPph", // boolean, konvensi "Y"/kosong
    pphNumber: "detailInvoice[].pphNumber",
    // § Fase 85 — `detailDiscount[]` NESTED SATU LEVEL LEBIH DALAM, DI
    // DALAM tiap elemen `detailInvoice[]` (BEDA dari `detailExpense[]`
    // Sales Invoice/Purchase Invoice yang sibling dari `detailItem[]`).
    // 1 baris Excel (1 elemen detailInvoice) MAKSIMAL 1 entri
    // detailDiscount — dianggap punya data diskon kalau MINIMAL
    // "Discount" (amount) DAN "Discount Acc" (accountNo) terisi, mirror
    // pola `buildDetailExpenseFromRow` (Sales Invoice).
    discountAmount: "detailInvoice[].detailDiscount[].amount",
    discountAccountNo: "detailInvoice[].detailDiscount[].accountNo",
    discountNotes: "detailInvoice[].detailDiscount[].discountNotes",
    discountDepartmentName: "detailInvoice[].detailDiscount[].departmentName",
    discountProjectNo: "detailInvoice[].detailDiscount[].projectNo",
    // § Fase 99 (2026-09-10) — KOREKSI Fase 86: "Tax ID" TERNYATA BUKAN
    // validasi-only. Jawaban resmi Accurate Support (2026-09-10, balasan
    // pertanyaan PPh23 Sales Receipt) konfirmasi payload YANG BENAR:
    // `detailTax[]` ada di ROOT request (SIBLING dari `detailInvoice`,
    // BUKAN nested di dalamnya seperti asumsi awal) — tiap elemen punya
    // `detailInvoiceNo` (penghubung ke baris `detailInvoice` terkait),
    // `taxAmount` (nominal PPh), `taxId` (angka — id INTERNAL Accurate,
    // BUKAN taxCode/description). `taxId` di sini TETAP diterima
    // fleksibel dari user (angka/kode/nama, § `accurate-tax.ts`
    // `findTaxByIdentifier`) — worker RESOLVE ke `.id` numerik SEBELUM
    // `buildSalesReceiptPayload` dipanggil (§ `workers/index.ts`
    // `resolveTaxIdsForReceipt`), payload yang dikirim pakai angka hasil
    // resolve itu, BUKAN string mentah dari Excel.
    taxId: "detailTax[].taxId",
    // § Fase 99 — "Tax Amount" JUGA DIKOREKSI dari Fase 85 ("❌ SKIP,
    // CONFIRMED read-only/auto-computed lewat UI") — jawaban Support
    // EKSPLISIT bilang `detailTax[].taxAmount` "diisi dengan nominal PPh
    // yang dipotong": field ini ADA dan WAJIB diisi MANUAL di level API
    // (UI Accurate auto-hitung nilainya sendiri lewat jalur BEDA/internal,
    // tapi API TIDAK replikasi itu — caller yang harus supply angkanya).
    taxAmount: "detailTax[].taxAmount",
  } as const,
  // § Fase 86 (2026-09-10) — URUTAN entri di bawah SENGAJA mengikuti
  // PERSIS urutan sheet "NOTE" client (= template kompetitor
  // `FACPORT_Sales Receipt_v5.xlsx`) — permintaan eksplisit user, BUKAN
  // pola "field baru di ujung" yang dipakai modul lain. Urutan OBJECT
  // KEY di JS tidak memengaruhi fungsi matching (tetap by NAME), ini
  // MURNI supaya kode gampang dibaca sejalan dengan file client.
  defaultColumnMap: {
    "Tanggal": "transDate",
    "No. Sales Receipt": "receiptNumber", // § Fase 49 — PERSIS nama kolom template kompetitor
    "Nomor Penerimaan": "receiptNumber",
    "No Penerimaan": "receiptNumber",
    "Akun Bank/Kas": "bankNo",
    "Kode Akun Bank": "bankNo",
    "No Pelanggan": "customerNo",
    "Nomor Customer": "customerNo",
    "Customer No": "customerNo",
    // § Fase 85 (2026-09-10) — 18 kolom baru, nama PERSIS istilah
    // template kompetitor (client sudah familiar, § pola Fase 50
    // Purchase Payment).
    "Description": "description",
    "Branch": "branchName",
    "Currency Code": "currencyCode",
    "kurs": "rate",
    "Cheque Amount": "receiptTotalAmount",
    "Cheque No": "chequeNo",
    "Cheque Date": "chequeDate",
    "Payment Method": "paymentMethod",
    "Pass Validate Inv Date": "passValidateInvoiceDate",
    "Use credit": "useCredit",
    "No Faktur": "invoiceNo",
    "Nomor Faktur": "invoiceNo",
    "Jumlah Bayar": "chequeAmount",
    "Department": "invoiceDepartmentName",
    "Paid PPH": "paidPph",
    "PPh No": "pphNumber",
    "Tax ID": "taxId",
    "Tax Amount": "taxAmount",
    "Discount": "discountAmount",
    "Discount Acc": "discountAccountNo",
    "Discount Note": "discountNotes",
    "Diskon - Dept": "discountDepartmentName",
    "Diskon - Project No": "discountProjectNo",
  } as Record<string, string>,
};

export type SalesReceiptField = keyof typeof salesReceiptMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type SalesReceiptGroup = { receiptNumber: string | null; rows: ImportRowRecord[] };

// § Fase 49 — mirror `poNumberColumnOf`/`billNumberColumnOf`.
export function receiptNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "receiptNumber")?.[0] ?? null;
}

function receiptNumberOf(row: ImportRowRecord, receiptNumberColumn: string | null): string | null {
  if (!receiptNumberColumn) return null;
  const value = row.rawData[receiptNumberColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § Fase 49 — mirror `groupSalesInvoiceRows`. Baris TANPA nilai di
// kolom receiptNumber (kolom tidak di-mapping, ATAU di-mapping tapi
// kosong di baris itu) tetap jadi grup sendiri-sendiri — behavior LAMA
// (1 baris = 1 penerimaan), TIDAK ADA regresi.
export function groupSalesReceiptRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): SalesReceiptGroup[] {
  const receiptNumberColumn = receiptNumberColumnOf(columnMapping);
  const groups: SalesReceiptGroup[] = [];
  const byReceiptNumber = new Map<string, SalesReceiptGroup>();

  for (const row of rows) {
    const receiptNumber = receiptNumberOf(row, receiptNumberColumn);
    if (receiptNumber === null) {
      groups.push({ receiptNumber: null, rows: [row] });
      continue;
    }
    const key = receiptNumber.toLowerCase();
    let group = byReceiptNumber.get(key);
    if (!group) {
      group = { receiptNumber, rows: [] };
      byReceiptNumber.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § Fase 49 — mirror `validateGroupCustomerConsistency` (Sales
// Invoice): semua baris 1 grup (1 penerimaan) WAJIB customerNo sama —
// cegah gabung baris LINTAS-customer diam-diam kalau receiptNumber
// kebetulan sama (harusnya tidak pernah terjadi kalau data rapi, tapi
// ini pengaman, bukan asumsi).
export function validateGroupCustomerConsistencyForReceipt(
  group: SalesReceiptGroup,
  columnMapping: Record<string, string>,
): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.receiptNumber ?? "(tanpa No. Sales Receipt)";
  return `No. Sales Receipt "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 penerimaan pakai Nomor Customer yang sama.`;
}

// § lessons-learned.md 2026-08-19 — Accurate WAJIB format tanggal DD/MM/YYYY.
const DATE_FIELDS = new Set<SalesReceiptField>(["transDate", "chequeDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § Fase 85 — konvensi boolean kompetitor "isikan Y jika ..., kosongkan
// jika tidak" (BEDA dari "TRUE"/"FALSE" Sales Invoice/Purchase
// Invoice) — TRUE_TEXT_VALUES SUDAH terima "y"/"ya" case-insensitive
// sejak awal, jadi kompatibel TANPA logic tambahan.
const BOOLEAN_FIELDS = new Set<SalesReceiptField>(["passValidateInvoiceDate", "useCredit", "paidPph"]);
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

// § Fase 85 — enum resmi `paymentMethod` (DIKONFIRMASI ke spec resmi +
// screenshot dropdown "Metode Bayar" UI Accurate asli — koreksi dari
// riset awal yang cuma 8 nilai dari dokumentasi kompetitor, TERNYATA
// kurang `CREDIT_CARD`/`DEBIT_CARD`/`E_WALLET`). Kolom Excel boleh isi
// label Indonesia (UI Accurate) ATAU enum API langsung — diterjemahkan
// otomatis; nilai lain diteruskan APA ADANYA (biar Accurate sendiri
// yang reject dengan pesan jelas kalau benar-benar tidak valid, BUKAN
// blocking validation client-side yang bisa salah/ketinggalan zaman).
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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<SalesReceiptField, unknown>> {
  const values: Partial<Record<SalesReceiptField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as SalesReceiptField;
      const raw = rawRow[excelColumn];
      if (DATE_FIELDS.has(f)) values[f] = toAccurateDate(raw);
      else if (BOOLEAN_FIELDS.has(f)) values[f] = toAccurateBoolean(raw);
      else if (f === "paymentMethod") values[f] = toAccuratePaymentMethod(raw);
      else values[f] = raw;
    }
  }
  return values;
}

// § Fase 86, tujuan DIKOREKSI Fase 99 — kumpulkan nilai "Tax ID" UNIK
// dari semua baris grup, untuk di-RESOLVE ke id numerik Accurate
// (`resolveTaxIdsForReceipt` di `workers/index.ts`, pakai
// `findTaxByIdentifier` di `accurate-tax.ts`) SEBELUM payload dibangun
// — hasil resolve-nya (Map<identifier, numericId>) yang dipakai
// `buildSalesReceiptPayload` mengisi `detailTax[].taxId` (§ Fase 99,
// BUKAN lagi validasi murni tanpa efek ke payload). Dedupe (Set) — 1
// nilai yang sama dipakai berkali-kali cuma perlu 1x lookup, mirror
// pola `ensureDataClassifications`.
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

// § Fase 85 — mirror `buildDetailExpenseFromRow` (Sales Invoice):
// `discountAmount`+`discountAccountNo` syarat MINIMAL supaya baris
// dianggap punya data diskon — kalau salah satu kosong, TIDAK ada
// entri `detailDiscount` sama sekali untuk baris ini (bukan dikirim
// setengah-setengah).
function buildDetailDiscountFromRowValues(rowValues: Partial<Record<SalesReceiptField, unknown>>): Record<string, unknown> | null {
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

// § Fase 49 — signature BERUBAH: dari `(rawRow, columnMapping)` (1
// baris = 1 payload) jadi `(rawRows[], columnMapping)` (1 GRUP = 1
// payload, bisa banyak baris). Header (`customerNo`, `bankNo`,
// `transDate`, dst — § Fase 85, field root baru JUGA header) dari baris
// PERTAMA grup (sama pola `buildSalesInvoicePayload`) — divalidasi
// konsisten lewat `validateGroupCustomerConsistencyForReceipt` SEBELUM
// fungsi ini dipanggil (caller, § workers/index.ts). `chequeAmount`
// (root) = "Cheque Amount" EKSPLISIT kalau diisi (§ Fase 85), fallback
// SUM semua `paymentAmount` baris dalam grup kalau kosong (perilaku
// Fase 49, zero regression).
// § Fase 99 (2026-09-10) — parameter BARU `resolvedTaxIds`: Map dari
// nilai "Tax ID" MENTAH Excel (string, sebelum di-trim) ke id NUMERIK
// Accurate (§ `workers/index.ts` `resolveTaxIdsForReceipt`). Fungsi ini
// SENGAJA tetap sync/pure (tidak panggil Accurate sendiri) — caller
// WAJIB resolve semua Tax ID dulu (dan gagal lebih awal kalau ada yang
// tidak ketemu) SEBELUM panggil builder ini, sama filosofi
// `ensureDataClassifications` dipanggil SEBELUM `buildXPayload` di
// modul lain. Default `new Map()` supaya caller lama (tanpa Tax ID)
// tetap jalan tanpa ubah signature call site.
export function buildSalesReceiptPayload(
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
    if (rowValues.invoiceDepartmentName !== undefined) entry.departmentName = String(rowValues.invoiceDepartmentName);
    if (rowValues.paidPph !== undefined) entry.paidPph = rowValues.paidPph;
    if (rowValues.pphNumber !== undefined) entry.pphNumber = String(rowValues.pphNumber);
    const discount = buildDetailDiscountFromRowValues(rowValues);
    if (discount) entry.detailDiscount = [discount];

    // § Fase 99 — `detailTax[]` dikonfirmasi Accurate Support BERADA DI
    // ROOT (sibling `detailInvoice`), BUKAN nested di `entry` ini —
    // dikumpulkan di sini (per-baris, karena sumber datanya per-baris)
    // tapi DITULIS ke array root `detailTax` di bawah, bukan ke `entry`.
    // Syarat MINIMAL: `taxId` DAN `taxAmount` dua-duanya terisi (mirror
    // pola `buildDetailDiscountFromRowValues`) — `taxId` harus berhasil
    // di-resolve ke angka (kalau tidak ada di map, berarti caller belum
    // resolve/skip baris ini, JANGAN kirim setengah-setengah).
    if (rowValues.taxId !== undefined && rowValues.taxAmount !== undefined) {
      const resolvedId = resolvedTaxIds.get(String(rowValues.taxId).trim());
      if (resolvedId !== undefined) {
        detailTax.push({ detailInvoiceNo: invoiceNo, taxAmount: Number(rowValues.taxAmount), taxId: resolvedId });
      }
    }
    return entry;
  });

  // § Fase 90 (2026-09-10, BUG DITEMUKAN via test call NYATA ke Accurate)
  // — root `chequeAmount` HARUS dalam mata uang BANK (basis perusahaan),
  // SEDANGKAN `detailInvoice[].paymentAmount` (dari kolom "Jumlah Bayar")
  // tetap dalam mata uang FAKTUR ASLI. Untuk transaksi mata uang asing
  // (`rate` != 1), auto-SUM polos (tanpa kali `rate`) menghasilkan root
  // `chequeAmount` yang SALAH — dikonfirmasi NYATA: Accurate menolak
  // dengan "Total Debit dan Kredit tidak cocok" saat auto-SUM 1 (SGD)
  // dikirim sebagai chequeAmount root, padahal seharusnya 1 × kurs
  // (12600.000001 IDR). Kalau `rate` tidak diisi (transaksi mata uang
  // dasar, kasus PALING UMUM), kali 1 — ZERO REGRESSION.
  const rateMultiplier = headerValues.rate !== undefined ? Number(headerValues.rate) : 1;
  const autoSummedChequeAmount = detailInvoice.reduce((sum, d) => sum + (d.paymentAmount as number), 0) * rateMultiplier;

  const payload: Record<string, unknown> = {
    customerNo: String(headerValues.customerNo ?? ""),
    bankNo: String(headerValues.bankNo ?? ""),
    transDate: String(headerValues.transDate ?? ""),
    chequeAmount: headerValues.receiptTotalAmount !== undefined ? Number(headerValues.receiptTotalAmount) : autoSummedChequeAmount,
    detailInvoice,
  };
  if (headerValues.receiptNumber !== undefined) payload.number = String(headerValues.receiptNumber);
  if (headerValues.description !== undefined) payload.description = String(headerValues.description);
  if (headerValues.branchName !== undefined) payload.branchName = String(headerValues.branchName);
  if (headerValues.currencyCode !== undefined) payload.currencyCode = String(headerValues.currencyCode);
  if (headerValues.rate !== undefined) payload.rate = Number(headerValues.rate);
  if (headerValues.chequeNo !== undefined) payload.chequeNo = String(headerValues.chequeNo);
  if (headerValues.chequeDate !== undefined) payload.chequeDate = String(headerValues.chequeDate);
  if (headerValues.paymentMethod !== undefined) payload.paymentMethod = headerValues.paymentMethod;
  if (headerValues.passValidateInvoiceDate !== undefined) payload.passValidateInvoiceDate = headerValues.passValidateInvoiceDate;
  if (headerValues.useCredit !== undefined) payload.useCredit = headerValues.useCredit;
  // § Fase 99 — `detailTax[]` di ROOT, sibling `detailInvoice` (dikonfirmasi
  // Accurate Support 2026-09-10), BUKAN nested di dalam `detailInvoice[]`.
  if (detailTax.length > 0) payload.detailTax = detailTax;

  return payload;
}
