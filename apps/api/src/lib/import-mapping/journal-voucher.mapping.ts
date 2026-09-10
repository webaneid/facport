// § architecture-journal-voucher.md — Jurnal Umum BEDA TOTAL dari modul
// lain: transaksi akuntansi murni (debit/kredit ke akun COA), TANPA
// vendor/customer/faktur. Keputusan granularitas Excel DIKONFIRMASI user
// 2026-09-05: Opsi A (format lebar) — 1 baris Excel = 1 jurnal LENGKAP
// (1 baris debit + 1 baris kredit), TIDAK ada grouping, PERSIS pola
// per-baris purchase-payment.mapping.ts (SEBELUM Fase 50).
//
// § Fase 50 — DITAMBAH Opsi B (format "panjang" ala kompetitor,
// `docs/referencehtml/FACPORT_BUKU_BESAR.xlsx`): audit data ASLI
// menemukan mayoritas transaksi (di satu sheet sampel, 84%) punya 3-6
// baris/transaksi (N-akun) — format lebar TIDAK BISA menampung ini
// sama sekali (cuma 2 akun/jurnal). Opsi A **TIDAK DIHAPUS** (user
// dikonfirmasi: modul ini sudah live sejak Fase 35, mengganti total
// berisiko rusak retry batch lama customer lain yang mungkin sudah
// pakai format lebar) — DUA FORMAT hidup berdampingan, dideteksi
// otomatis dari kolom yang di-mapping user (§ `formatOf`).
export const journalVoucherMapping = {
  // § Opsi A (format lebar) — TIDAK BERUBAH dari sebelum Fase 50.
  requiredFields: ["transDate", "debitAccountNo", "debitAmount", "creditAccountNo", "creditAmount"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    debitAccountNo: "detailJournalVoucher[0].accountNo",
    debitAmount: "detailJournalVoucher[0].amount",
    creditAccountNo: "detailJournalVoucher[1].accountNo",
    creditAmount: "detailJournalVoucher[1].amount",
    description: "description",
    // § Fase 50 — Opsi B (format panjang), field BARU. `journalNumber`
    // kunci grouping (→ Accurate `number`, field opsional yang sudah
    // ada di `journal-voucher/save.do` sejak awal). `lineAccountNo` =
    // 1 BARIS = 1 elemen `detailJournalVoucher[]` (BEBAS panjang, beda
    // dari Opsi A yang hardcode index 0/1).
    journalNumber: "number",
    lineAccountNo: "detailJournalVoucher[].accountNo",
    // § Fase 95 (2026-09-10) — GANTI TOTAL dari `lineAmount`+`lineAmountType`
    // (1 kolom nilai + 1 kolom tipe DEBIT/CREDIT) jadi 2 KOLOM TERPISAH
    // ("Debit"/"Credit", ala template client — screenshot UI Accurate
    // asli menunjukkan input Rp/nilai dasar per akun, tipe baris
    // ditentukan dari SISI mana yang diisi user, bukan diketik manual).
    // Diputuskan GANTI (bukan tambahan berdampingan) — instruksi
    // eksplisit user, disadari sebagai breaking change ke Opsi B yang
    // baru dipakai sejak Fase 50 — DITERIMA karena project ini belum
    // punya customer produksi nyata yang pakai Opsi B (§ [[feedback_dev_stage_no_real_customers]]).
    // Nama internal field prefix "line" (bukan reuse `debitAmount`/
    // `creditAmount` Opsi A) — field itu SUDAH dipakai Opsi A untuk
    // index [0]/[1] fixed, beda makna total dari kolom per-baris di sini.
    lineDebitAmount: "detailJournalVoucher[].amount",
    lineCreditAmount: "detailJournalVoucher[].amount",
    // § Fase 95 — field BARU dari riset 2 sumber (template kompetitor
    // `FACPORT_JV_v3/v4.1.xlsx` + template client dengan 3 screenshot
    // UI Accurate asli, § architecture-journal-voucher.md § "Fase 95").
    // SEMUA opsional KECUALI `branchName` (WAJIB — dikonfirmasi
    // screenshot UI client tanda merah *, pola sama Fase 90 Purchase
    // Payment/Sales Receipt).
    branchName: "branchName", // root/header, BUKAN per-baris (beda dari yang lain di blok ini)
    lineRate: "detailJournalVoucher[].rate",
    linePrimeAmount: "detailJournalVoucher[].primeAmount", // opsional — dikonfirmasi test call nyata: kalau kosong, Accurate AUTO-HITUNG dari amount/rate
    lineDepartmentName: "detailJournalVoucher[].departmentName",
    lineProjectNo: "detailJournalVoucher[].projectNo",
    lineMemo: "detailJournalVoucher[].memo",
    lineSubsidiaryType: "detailJournalVoucher[].subsidiaryType", // CUSTOMER | EMPLOYEE | VENDOR
    lineCustomerNo: "detailJournalVoucher[].customerNo", // isi kalau lineSubsidiaryType = CUSTOMER
    lineEmployeeNo: "detailJournalVoucher[].employeeNo", // isi kalau lineSubsidiaryType = EMPLOYEE
    lineVendorNo: "detailJournalVoucher[].vendorNo", // isi kalau lineSubsidiaryType = VENDOR
    // § Kategori Keuangan (dataClassificationNName) — SEMUA 10 dibuka,
    // konsisten precedent Sales Invoice Fase 61 (template kompetitor
    // cuma expose "Classification 1-3", tapi API dukung sampai 10).
    attribut1: "detailJournalVoucher[].dataClassification1Name",
    attribut2: "detailJournalVoucher[].dataClassification2Name",
    attribut3: "detailJournalVoucher[].dataClassification3Name",
    attribut4: "detailJournalVoucher[].dataClassification4Name",
    attribut5: "detailJournalVoucher[].dataClassification5Name",
    attribut6: "detailJournalVoucher[].dataClassification6Name",
    attribut7: "detailJournalVoucher[].dataClassification7Name",
    attribut8: "detailJournalVoucher[].dataClassification8Name",
    attribut9: "detailJournalVoucher[].dataClassification9Name",
    attribut10: "detailJournalVoucher[].dataClassification10Name",
  } as const,
  // § Fase 50 — requiredFields KHUSUS Opsi B (dipakai `formatOf`/route
  // saat format panjang terdeteksi, TERPISAH dari `requiredFields` di
  // atas yang tetap milik Opsi A). § Fase 95 — `branchName` BARU WAJIB,
  // `lineDebitAmount`+`lineCreditAmount` (bukan berarti tiap BARIS wajib
  // isi keduanya — WAJIB kedua KOLOM ter-mapping, tiap baris cukup isi
  // SATU dari keduanya, validasi per-baris di `buildJournalVoucherPayloadTall`).
  requiredFieldsTall: ["transDate", "journalNumber", "branchName", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"] as const,
  defaultColumnMap: {
    // § Opsi A (format lebar) — label lama, TIDAK BERUBAH.
    "Tanggal": "transDate",
    "Akun Debit": "debitAccountNo",
    "Nominal Debit": "debitAmount",
    "Akun Kredit": "creditAccountNo",
    "Nominal Kredit": "creditAmount",
    "Keterangan": "description",
    // § Fase 50 — Opsi B (format panjang), label ala kompetitor
    // (PERSIS nama kolom `FACPORT_BUKU_BESAR.xlsx`, client sudah
    // familiar). "JV No" di template kompetitor ISINYA kode akun COA
    // (penamaan mereka agak menyesatkan — "JV No" kedengaran seperti
    // "nomor jurnal", tapi dikonfirmasi dari data asli isinya akun),
    // BUKAN pengganti "Transaction Number" (itu kunci grouping asli).
    // § Fase 95 — "Akun Perkiraan" DITAMBAH sebagai ALIAS baru (istilah
    // template client kedua), "JV No" TETAP didukung (kompatibel
    // template kompetitor pertama) — keduanya map ke field yang sama.
    "Transaction Number": "journalNumber",
    "Transaction No.": "journalNumber",
    "JV No": "lineAccountNo",
    "Akun Perkiraan": "lineAccountNo",
    "Trans Date": "transDate",
    "Trans Description": "description",
    "Description": "description",
    // § Fase 95 — field BARU (§ komentar `fieldToAccuratePath` di atas).
    "Branch": "branchName",
    "Debit": "lineDebitAmount",
    "Credit": "lineCreditAmount",
    "Kurs": "lineRate",
    "JV Rate": "lineRate",
    "JV Prime Amount": "linePrimeAmount",
    "No Department": "lineDepartmentName",
    "JV Dept Name": "lineDepartmentName",
    "No Project": "lineProjectNo",
    "JV Project No": "lineProjectNo",
    "Memo": "lineMemo",
    "JV Memo": "lineMemo",
    "JV Subsidiary Type": "lineSubsidiaryType",
    "JV Cust No": "lineCustomerNo",
    "JV Employee No": "lineEmployeeNo",
    "JV Vendor No": "lineVendorNo",
    // § "Kategori Keuangan N" istilah resmi Facport/Accurate (konsisten
    // Sales Invoice Fase 61) — "Classification N" alias template
    // kompetitor (cuma sampai 3, TAPI diterima sampai 10 juga di sini
    // biar konsisten satu pola penamaan).
    "Kategori Keuangan 1": "attribut1",
    "Classification 1": "attribut1",
    "Kategori Keuangan 2": "attribut2",
    "Classification 2": "attribut2",
    "Kategori Keuangan 3": "attribut3",
    "Classification 3": "attribut3",
    "Kategori Keuangan 4": "attribut4",
    "Kategori Keuangan 5": "attribut5",
    "Kategori Keuangan 6": "attribut6",
    "Kategori Keuangan 7": "attribut7",
    "Kategori Keuangan 8": "attribut8",
    "Kategori Keuangan 9": "attribut9",
    "Kategori Keuangan 10": "attribut10",
  } as Record<string, string>,
};

export type JournalVoucherField = keyof typeof journalVoucherMapping.fieldToAccuratePath;

// § Fase 50 — deteksi format dari kolom yang di-mapping user. "tall"
// menang kalau field Opsi B ADA yang termapping (walau Opsi A juga
// termapping — kasus campur dianggap tall, cek `requiredFieldsTall`
// di route yang akan menolak kalau tidak lengkap). `null` = tidak ada
// indikasi format sama sekali (belum mapping apa pun / kolom acak).
export function formatOf(columnMapping: Record<string, string>): "wide" | "tall" | null {
  const mappedFields = new Set(Object.values(columnMapping));
  const hasTallField = ["journalNumber", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"].some((f) => mappedFields.has(f));
  if (hasTallField) return "tall";
  const hasWideField = ["debitAccountNo", "debitAmount", "creditAccountNo", "creditAmount"].some((f) => mappedFields.has(f));
  if (hasWideField) return "wide";
  return null;
}

// § Fase 50 — dipakai route (`journal-voucher-import.route.ts`) buat
// validasi `requiredFields` KONDISIONAL sesuai format yang terdeteksi
// (bukan gabungan Opsi A + Opsi B, yang akan minta field lebih banyak
// dari yang seharusnya untuk masing-masing format).
export function requiredFieldsFor(format: "wide" | "tall"): readonly string[] {
  return format === "tall" ? journalVoucherMapping.requiredFieldsTall : journalVoucherMapping.requiredFields;
}

// § "Validasi Krusial" architecture doc — aturan double-entry: total
// debit WAJIB SAMA PERSIS dengan total kredit. Opsi A (1 jurnal = 1
// baris debit + 1 baris kredit) — TIDAK BERUBAH dari sebelum Fase 50.
export function buildJournalVoucherPayload(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const values: Partial<Record<JournalVoucherField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      values[field as JournalVoucherField] = rawRow[excelColumn];
    }
  }

  const debitAmount = Number(values.debitAmount ?? 0);
  const creditAmount = Number(values.creditAmount ?? 0);
  if (debitAmount !== creditAmount) {
    throw new Error(
      `Jurnal tidak seimbang: Nominal Debit (${debitAmount}) tidak sama dengan Nominal Kredit (${creditAmount}) — total debit dan kredit WAJIB sama persis.`,
    );
  }

  const payload: Record<string, unknown> = {
    transDate: String(values.transDate ?? ""),
    detailJournalVoucher: [
      { accountNo: String(values.debitAccountNo ?? ""), amount: debitAmount, amountType: "DEBIT" },
      { accountNo: String(values.creditAccountNo ?? ""), amount: creditAmount, amountType: "CREDIT" },
    ],
  };
  if (values.description !== undefined) payload.description = values.description;

  return payload;
}

// ============================================================
// § Fase 50 — Opsi B (format panjang), mirror grouping Sales
// Receipt/Purchase Payment.
// ============================================================
export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type JournalVoucherGroup = { journalNumber: string | null; rows: ImportRowRecord[] };

export function journalNumberColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "journalNumber")?.[0] ?? null;
}

function journalNumberOf(row: ImportRowRecord, journalNumberColumn: string | null): string | null {
  if (!journalNumberColumn) return null;
  const value = row.rawData[journalNumberColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § Fase 50 — BEDA dari `groupSalesReceiptRows`: baris TANPA
// journalNumber TIDAK bisa jadi grup singleton yang valid untuk Opsi B
// (1 baris = 1 akun, jurnal minimal butuh 2 baris/2 akun buat seimbang)
// — tetap dikelompokkan (jadi grup ukuran 1) di sini, tapi
// `buildJournalVoucherPayloadTall` akan gagal validasi balance kalau
// cuma 1 baris (debit atau kredit doang, tidak mungkin balance sendiri
// kecuali amount 0) — pesan error natural, tidak perlu guard terpisah.
export function groupJournalVoucherRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): JournalVoucherGroup[] {
  const journalNumberColumn = journalNumberColumnOf(columnMapping);
  const groups: JournalVoucherGroup[] = [];
  const byJournalNumber = new Map<string, JournalVoucherGroup>();

  for (const row of rows) {
    const journalNumber = journalNumberOf(row, journalNumberColumn);
    if (journalNumber === null) {
      groups.push({ journalNumber: null, rows: [row] });
      continue;
    }
    const key = journalNumber.toLowerCase();
    let group = byJournalNumber.get(key);
    if (!group) {
      group = { journalNumber, rows: [] };
      byJournalNumber.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

// § Fase 95 — cari nama kolom Excel yang di-mapping ke field tertentu.
// Helper generik, dipakai berulang kali di bawah untuk >12 field
// opsional baru — reduksi duplikasi `Object.entries(columnMapping).find(...)`.
function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  if (!column) return undefined;
  const value = rawRow[column];
  return value === undefined || value === null || value === "" ? undefined : value;
}

// § Fase 95 — dipakai route (`journal-voucher-import.route.ts`) di
// endpoint EDIT BARIS (single + bulk) — `requiredFieldsFor("tall")`
// TIDAK BISA dipakai APA ADANYA untuk validasi "field wajib berisi
// nilai per baris" seperti field lain, karena `lineDebitAmount`/
// `lineCreditAmount` itu XOR (isi SATU, bukan wajib DUA-DUANYA) —
// route WAJIB filter kedua field ini keluar dari loop generik lalu
// panggil fungsi ini terpisah. Balikin `["lineDebitAmount",
// "lineCreditAmount"]` (dianggap sebagai 2 field "missing" sekaligus,
// konsisten bentuk array yang sudah dipakai `MISSING_REQUIRED_VALUES`)
// kalau baris ini SALAH (dua-duanya kosong ATAU dua-duanya terisi),
// array kosong kalau BENAR (tepat satu terisi).
export function debitCreditRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const debitColumn = columnOf(columnMapping, "lineDebitAmount");
  const creditColumn = columnOf(columnMapping, "lineCreditAmount");
  const hasDebit = valueOf(rawRow, debitColumn) !== undefined;
  const hasCredit = valueOf(rawRow, creditColumn) !== undefined;
  return hasDebit === hasCredit ? ["lineDebitAmount", "lineCreditAmount"] : [];
}

// § Fase 95 — validasi konsistensi `lineSubsidiaryType` vs
// `customerNo`/`employeeNo`/`vendorNo` SENGAJA TIDAK dilakukan (pola
// project ini: kirim apa adanya, Accurate yang validasi eksistensi/
// kecocokan — sama seperti `customerNo`/`invoiceNo` Sales Receipt yang
// tidak di-lookup dulu sebelum dikirim).
const OPTIONAL_LINE_FIELDS = [
  ["lineRate", "rate", Number] as const,
  ["linePrimeAmount", "primeAmount", Number] as const,
  ["lineDepartmentName", "departmentName", String] as const,
  ["lineProjectNo", "projectNo", String] as const,
  ["lineMemo", "memo", String] as const,
  ["lineSubsidiaryType", "subsidiaryType", String] as const,
  ["lineCustomerNo", "customerNo", String] as const,
  ["lineEmployeeNo", "employeeNo", String] as const,
  ["lineVendorNo", "vendorNo", String] as const,
  ["attribut1", "dataClassification1Name", String] as const,
  ["attribut2", "dataClassification2Name", String] as const,
  ["attribut3", "dataClassification3Name", String] as const,
  ["attribut4", "dataClassification4Name", String] as const,
  ["attribut5", "dataClassification5Name", String] as const,
  ["attribut6", "dataClassification6Name", String] as const,
  ["attribut7", "dataClassification7Name", String] as const,
  ["attribut8", "dataClassification8Name", String] as const,
  ["attribut9", "dataClassification9Name", String] as const,
  ["attribut10", "dataClassification10Name", String] as const,
];

// § Fase 95 — GANTI TOTAL dari Fase 50 (`lineAmount`+`lineAmountType`,
// 1 kolom nilai + 1 kolom tipe DEBIT/CREDIT diketik manual) jadi 2
// KOLOM TERPISAH ("Debit"/"Credit") — tipe baris DITENTUKAN dari sisi
// mana yang diisi (bukan lagi diketik eksplisit), mirror pola input
// Accurate UI asli (screenshot client: 1 field nilai Rp per akun,
// radio button Debit/Kredit — BUKAN teks bebas). Validasi baru: SETIAP
// baris WAJIB isi TEPAT SATU dari keduanya — kosong dua-duanya ATAU
// terisi dua-duanya SAMA-SAMA error (ambigu/tidak lengkap).
function debitCreditOf(rawRow: Record<string, unknown>, debitColumn: string | null, creditColumn: string | null, rowNumber: number): { amount: number; amountType: "DEBIT" | "CREDIT" } {
  const debitValue = valueOf(rawRow, debitColumn);
  const creditValue = valueOf(rawRow, creditColumn);
  const hasDebit = debitValue !== undefined;
  const hasCredit = creditValue !== undefined;
  if (hasDebit && hasCredit) {
    throw new Error(`Baris ke-${rowNumber}: kolom Debit DAN Credit sama-sama terisi — isi HANYA SATU per baris (baris ini debit atau kredit, bukan keduanya).`);
  }
  if (!hasDebit && !hasCredit) {
    throw new Error(`Baris ke-${rowNumber}: kolom Debit dan Credit sama-sama kosong — WAJIB isi salah satu.`);
  }
  return hasDebit ? { amount: Number(debitValue), amountType: "DEBIT" } : { amount: Number(creditValue), amountType: "CREDIT" };
}

// § Fase 50 — Opsi B: terima ARRAY baris (1 grup = 1 jurnal, N akun).
// Validasi balance DIGENERALISASI dari Opsi A: SUM semua baris
// bertipe DEBIT WAJIB SAMA PERSIS dengan SUM semua baris bertipe
// CREDIT dalam grup — bukan lagi cuma bandingkan 2 angka.
export function buildJournalVoucherPayloadTall(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const transDateColumn = columnOf(columnMapping, "transDate");
  const descriptionColumn = columnOf(columnMapping, "description");
  const journalNumberColumn = journalNumberColumnOf(columnMapping);
  const branchNameColumn = columnOf(columnMapping, "branchName");
  const accountNoColumn = columnOf(columnMapping, "lineAccountNo");
  const debitColumn = columnOf(columnMapping, "lineDebitAmount");
  const creditColumn = columnOf(columnMapping, "lineCreditAmount");
  const optionalColumns = OPTIONAL_LINE_FIELDS.map(([field, accuratePath, cast]) => [columnOf(columnMapping, field), accuratePath, cast] as const);

  const lines = rawRows.map((rawRow, i) => {
    const { amount, amountType } = debitCreditOf(rawRow, debitColumn, creditColumn, i + 1);
    const line: Record<string, unknown> = { accountNo: String((accountNoColumn && rawRow[accountNoColumn]) ?? ""), amount, amountType };
    for (const [column, accuratePath, cast] of optionalColumns) {
      const value = valueOf(rawRow, column);
      if (value !== undefined) line[accuratePath] = cast(value);
    }
    return line;
  });

  const totalDebit = lines.filter((l) => l.amountType === "DEBIT").reduce((sum, l) => sum + (l.amount as number), 0);
  const totalCredit = lines.filter((l) => l.amountType === "CREDIT").reduce((sum, l) => sum + (l.amount as number), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Jurnal tidak seimbang: total DEBIT (${totalDebit}) tidak sama dengan total CREDIT (${totalCredit}) — total debit dan kredit WAJIB sama persis dalam 1 jurnal.`,
    );
  }

  const firstRow = rawRows[0] ?? {};
  const payload: Record<string, unknown> = {
    transDate: String((transDateColumn && firstRow[transDateColumn]) ?? ""),
    detailJournalVoucher: lines,
  };
  const description = descriptionColumn ? firstRow[descriptionColumn] : undefined;
  if (description !== undefined && description !== "") payload.description = description;

  // § branchName — root/header (dari baris pertama grup, sama pola
  // transDate/description), § Fase 95 WAJIB (dikonfirmasi screenshot
  // UI client + pola Fase 90 Purchase Payment/Sales Receipt).
  const branchName = branchNameColumn ? firstRow[branchNameColumn] : undefined;
  if (branchName !== undefined && branchName !== "") payload.branchName = String(branchName);

  // § BUG DITEMUKAN & DIPERBAIKI (2026-09-10, audit) — `journalNumber`
  // ("Transaction Number") sudah jadi kunci grouping SEJAK Fase 50, dan
  // komentar `fieldToAccuratePath.journalNumber: "number"` di atas file
  // ini SUDAH bilang field ini harus jadi Accurate `number` — tapi
  // sebelumnya TIDAK PERNAH ditulis ke payload di sini, beda dari 2
  // modul saudara (Purchase Payment `paymentNumber`, Sales Receipt
  // `receiptNumber`) yang sudah benar melakukan ini sejak awal. Akibatnya
  // nomor transaksi dari Excel dibuang diam-diam, Accurate auto-number
  // sendiri — tidak sesuai dokumentasi/ekspektasi user.
  const journalNumber = journalNumberColumn ? firstRow[journalNumberColumn] : undefined;
  if (journalNumber !== undefined && journalNumber !== "") payload.number = String(journalNumber);

  return payload;
}
