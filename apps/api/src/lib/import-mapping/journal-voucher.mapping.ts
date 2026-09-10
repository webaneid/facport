// § architecture-journal-voucher.md — Jurnal Umum BEDA TOTAL dari modul
// lain: transaksi akuntansi murni (debit/kredit ke akun COA), TANPA
// vendor/customer/faktur.
//
// § RIWAYAT (untuk konteks, BUKAN desain aktif lagi):
// - Awalnya (Fase 35) cuma Opsi A (format lebar) — 1 baris Excel = 1
//   jurnal LENGKAP (1 baris debit + 1 baris kredit), TIDAK ada grouping.
// - Fase 50 nambah Opsi B (format panjang ala kompetitor, grouping
//   N-akun via "Transaction Number") — DUA FORMAT hidup berdampingan.
// - Fase 95 redesain kolom Opsi B: "JV Amount"+"JV Amount Type" jadi
//   "Debit"/"Credit" terpisah.
//
// § Fase 96 (2026-09-10) — **OPSI A DIPENSIUNKAN TOTAL**. Client
// (3 template berturut-turut: v3, v4.1, template final ini) SELALU
// pakai format grouping N-akun, TIDAK PERNAH pakai format lebar 2-akun
// sederhana — dan modul ini belum punya customer produksi nyata (§
// [[feedback_dev_stage_no_real_customers]]), jadi aman dipensiunkan
// tanpa breaking change nyata. Manfaat: label kolom "Nominal Debit"/
// "Nominal Kredit" (dulu milik Opsi A) sekarang BEBAS dipakai ulang
// untuk Opsi B (yang sekarang jadi SATU-SATUNYA format) — persis nama
// kolom yang diminta client di template final, TANPA tabrakan nama.
// SEKALIAN dirapikan: semua ALIAS kolom ganda yang tidak diminta lagi
// client (mis. "Tanggal"+"Trans Date" dua-duanya, "JV No"+"Akun
// Perkiraan" dua-duanya) DIHAPUS — SATU nama kolom per konsep, PERSIS
// 26 kolom di `CLIENT_template-jurnal-umum-v2.xlsx`. Modul ini SEKARANG
// SATU FORMAT SAJA — `formatOf()`/`requiredFieldsFor()`/Opsi A TIDAK
// ADA LAGI, semua fungsi terkait dihapus (bukan dikosongkan/dideprecate).
export const journalVoucherMapping = {
  requiredFields: ["transDate", "journalNumber", "branchName", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    description: "description",
    // § `journalNumber` kunci grouping (→ Accurate `number`, field
    // opsional yang sudah ada di `journal-voucher/save.do` sejak awal).
    journalNumber: "number",
    branchName: "branchName", // root/header, WAJIB (screenshot UI client tanda merah *)
    // § `lineAccountNo` = 1 BARIS = 1 elemen `detailJournalVoucher[]`
    // (BEBAS panjang N-akun, dikelompokkan via journalNumber).
    lineAccountNo: "detailJournalVoucher[].accountNo",
    // § Kolom "Nominal Debit"/"Nominal Kredit" TERPISAH — isi SALAH
    // SATU per baris, tipe (DEBIT/CREDIT) ditentukan otomatis dari
    // kolom mana yang terisi (§ `debitCreditOf()`), BUKAN diketik
    // manual. Mirror radio button Debit/Kredit di UI Accurate asli.
    lineDebitAmount: "detailJournalVoucher[].amount",
    lineCreditAmount: "detailJournalVoucher[].amount",
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
    // konsisten precedent Sales Invoice Fase 61.
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
  // § PERSIS 26 kolom `CLIENT_template-jurnal-umum-v2.xlsx` — TIDAK
  // ada alias ganda lagi (client eksplisit minta "isinya ini saja").
  defaultColumnMap: {
    "Trans Date": "transDate",
    "Akun": "lineAccountNo",
    "Nominal Debit": "lineDebitAmount",
    "Nominal Kredit": "lineCreditAmount",
    "Trans Description": "description",
    "Transaction Number": "journalNumber",
    "Branch": "branchName",
    "Kurs": "lineRate",
    "JV Prime Amount": "linePrimeAmount",
    "No Department": "lineDepartmentName",
    "No Project": "lineProjectNo",
    "Memo": "lineMemo",
    "JV Subsidiary Type": "lineSubsidiaryType",
    "JV Cust No": "lineCustomerNo",
    "JV Employee No": "lineEmployeeNo",
    "JV Vendor No": "lineVendorNo",
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
  } as Record<string, string>,
};

export type JournalVoucherField = keyof typeof journalVoucherMapping.fieldToAccuratePath;

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

// § BEDA dari `groupSalesReceiptRows`: baris TANPA journalNumber TIDAK
// bisa jadi grup singleton yang valid (1 baris = 1 akun, jurnal minimal
// butuh 2 baris/2 akun buat seimbang) — tetap dikelompokkan (jadi grup
// ukuran 1) di sini, tapi `buildJournalVoucherPayload` akan gagal
// validasi balance kalau cuma 1 baris — pesan error natural, tidak
// perlu guard terpisah.
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

// § Cari nama kolom Excel yang di-mapping ke field tertentu. Helper
// generik, dipakai berulang kali di bawah untuk banyak field opsional
// — reduksi duplikasi `Object.entries(columnMapping).find(...)`.
function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  if (!column) return undefined;
  const value = rawRow[column];
  return value === undefined || value === null || value === "" ? undefined : value;
}

// § Fase 98 (2026-09-10) — GAP ditemukan: `attribut1`-`attribut10`
// (`dataClassification1-10Name`) ditambahkan Fase 95 TANPA mirror
// mekanisme auto-create yang sudah ada untuk field yang SAMA di Sales
// Invoice (Fase 68)/Purchase Invoice (Fase 75) — akibatnya Accurate
// menolak ("Kategori Keuangan X tidak ditemukan atau sudah dihapus")
// kalau nilainya belum ada sebagai master data "Kategori Keuangan".
// Mirror PERSIS `extractDataClassificationValues` di
// `sales-invoice.mapping.ts` — dipanggil worker (`ensureJournalVoucherDataClassifications`)
// SEBELUM `saveJournalVoucher`, untuk SEMUA baris dalam 1 grup (bukan
// cuma baris pertama — setiap baris JV bisa punya Kategori Keuangan
// berbeda-beda, tidak seperti `branchName`/`description` yang cuma
// diambil dari header/baris pertama).
export function extractDataClassificationValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 10; index++) {
    const column = columnOf(columnMapping, `attribut${index}`);
    const value = valueOf(rawRow, column);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}

// § Dipakai route (`journal-voucher-import.route.ts`) di endpoint EDIT
// BARIS (single + bulk) — `journalVoucherMapping.requiredFields` TIDAK
// BISA dipakai APA ADANYA untuk validasi "field wajib berisi nilai per
// baris" seperti field lain, karena `lineDebitAmount`/`lineCreditAmount`
// itu XOR (isi SATU, bukan wajib DUA-DUANYA) — route WAJIB filter kedua
// field ini keluar dari loop generik lalu panggil fungsi ini terpisah.
// Balikin `["lineDebitAmount", "lineCreditAmount"]` (dianggap sebagai 2
// field "missing" sekaligus, konsisten bentuk array yang sudah dipakai
// `MISSING_REQUIRED_VALUES`) kalau baris ini SALAH (dua-duanya kosong
// ATAU dua-duanya terisi), array kosong kalau BENAR (tepat satu terisi).
export function debitCreditRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const debitColumn = columnOf(columnMapping, "lineDebitAmount");
  const creditColumn = columnOf(columnMapping, "lineCreditAmount");
  const hasDebit = valueOf(rawRow, debitColumn) !== undefined;
  const hasCredit = valueOf(rawRow, creditColumn) !== undefined;
  return hasDebit === hasCredit ? ["lineDebitAmount", "lineCreditAmount"] : [];
}

// § Validasi konsistensi `lineSubsidiaryType` vs
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

// § GANTI TOTAL dari "JV Amount"+"JV Amount Type" (1 kolom nilai + 1
// kolom tipe DEBIT/CREDIT diketik manual, § Fase 50/95) jadi 2 KOLOM
// TERPISAH ("Nominal Debit"/"Nominal Kredit") — tipe baris DITENTUKAN
// dari sisi mana yang diisi (bukan lagi diketik eksplisit), mirror
// pola input Accurate UI asli (screenshot client: 1 field nilai Rp per
// akun, radio button Debit/Kredit — BUKAN teks bebas). Validasi: SETIAP
// baris WAJIB isi TEPAT SATU dari keduanya — kosong dua-duanya ATAU
// terisi dua-duanya SAMA-SAMA error (ambigu/tidak lengkap).
function debitCreditOf(rawRow: Record<string, unknown>, debitColumn: string | null, creditColumn: string | null, rowNumber: number): { amount: number; amountType: "DEBIT" | "CREDIT" } {
  const debitValue = valueOf(rawRow, debitColumn);
  const creditValue = valueOf(rawRow, creditColumn);
  const hasDebit = debitValue !== undefined;
  const hasCredit = creditValue !== undefined;
  if (hasDebit && hasCredit) {
    throw new Error(`Baris ke-${rowNumber}: kolom Nominal Debit DAN Nominal Kredit sama-sama terisi — isi HANYA SATU per baris (baris ini debit atau kredit, bukan keduanya).`);
  }
  if (!hasDebit && !hasCredit) {
    throw new Error(`Baris ke-${rowNumber}: kolom Nominal Debit dan Nominal Kredit sama-sama kosong — WAJIB isi salah satu.`);
  }
  return hasDebit ? { amount: Number(debitValue), amountType: "DEBIT" } : { amount: Number(creditValue), amountType: "CREDIT" };
}

// § Terima ARRAY baris (1 grup = 1 jurnal, N akun). Validasi balance:
// SUM semua baris bertipe DEBIT WAJIB SAMA PERSIS dengan SUM semua
// baris bertipe CREDIT dalam grup.
export function buildJournalVoucherPayload(
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
  // transDate/description), WAJIB (dikonfirmasi screenshot UI client +
  // pola Fase 90 Purchase Payment/Sales Receipt).
  const branchName = branchNameColumn ? firstRow[branchNameColumn] : undefined;
  if (branchName !== undefined && branchName !== "") payload.branchName = String(branchName);

  // § `journalNumber` ("Transaction Number") jadi kunci grouping —
  // komentar `fieldToAccuratePath.journalNumber: "number"` di atas
  // bilang field ini harus jadi Accurate `number`.
  const journalNumber = journalNumberColumn ? firstRow[journalNumberColumn] : undefined;
  if (journalNumber !== undefined && journalNumber !== "") payload.number = String(journalNumber);

  return payload;
}
