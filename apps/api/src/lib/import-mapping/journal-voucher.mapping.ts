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
    // ada di `journal-voucher/save.do` sejak awal). `lineAccountNo`/
    // `lineAmount`/`lineAmountType` = 1 BARIS = 1 elemen
    // `detailJournalVoucher[]` (BEBAS panjang, beda dari Opsi A yang
    // hardcode index 0/1).
    journalNumber: "number",
    lineAccountNo: "detailJournalVoucher[].accountNo",
    lineAmount: "detailJournalVoucher[].amount",
    lineAmountType: "detailJournalVoucher[].amountType",
  } as const,
  // § Fase 50 — requiredFields KHUSUS Opsi B (dipakai `formatOf`/route
  // saat format panjang terdeteksi, TERPISAH dari `requiredFields` di
  // atas yang tetap milik Opsi A).
  requiredFieldsTall: ["transDate", "journalNumber", "lineAccountNo", "lineAmount", "lineAmountType"] as const,
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
    "Transaction Number": "journalNumber",
    "JV No": "lineAccountNo",
    "JV Amount": "lineAmount",
    "JV Amount Type": "lineAmountType",
    "Trans Date": "transDate",
    "Trans Description": "description",
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
  const hasTallField = ["journalNumber", "lineAccountNo", "lineAmount", "lineAmountType"].some((f) => mappedFields.has(f));
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

// § Fase 50 — normalisasi nilai kolom "JV Amount Type"/tipe baris:
// terima "DEBIT"/"CREDIT" (Inggris, ala kompetitor) ATAU "D"/"K"
// (singkatan Indonesia umum) ATAU "Debit"/"Kredit", case-insensitive.
// Selain itu → error jelas (bukan tebak/default diam-diam).
function normalizeAmountType(raw: unknown): "DEBIT" | "CREDIT" {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "DEBIT" || value === "D" || value === "DR") return "DEBIT";
  if (value === "CREDIT" || value === "KREDIT" || value === "K" || value === "CR" || value === "C") return "CREDIT";
  throw new Error(`Tipe baris jurnal "${raw}" tidak dikenali — isi "DEBIT" atau "CREDIT" (boleh singkatan "D"/"K").`);
}

// § Fase 50 — Opsi B: terima ARRAY baris (1 grup = 1 jurnal, N akun).
// Validasi balance DIGENERALISASI dari Opsi A: SUM semua baris
// bertipe DEBIT WAJIB SAMA PERSIS dengan SUM semua baris bertipe
// CREDIT dalam grup — bukan lagi cuma bandingkan 2 angka.
export function buildJournalVoucherPayloadTall(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const transDateColumn = Object.entries(columnMapping).find(([, f]) => f === "transDate")?.[0];
  const descriptionColumn = Object.entries(columnMapping).find(([, f]) => f === "description")?.[0];
  const accountNoColumn = Object.entries(columnMapping).find(([, f]) => f === "lineAccountNo")?.[0];
  const amountColumn = Object.entries(columnMapping).find(([, f]) => f === "lineAmount")?.[0];
  const amountTypeColumn = Object.entries(columnMapping).find(([, f]) => f === "lineAmountType")?.[0];

  const lines = rawRows.map((rawRow) => ({
    accountNo: String((accountNoColumn && rawRow[accountNoColumn]) ?? ""),
    amount: Number((amountColumn && rawRow[amountColumn]) ?? 0),
    amountType: normalizeAmountType(amountTypeColumn ? rawRow[amountTypeColumn] : undefined),
  }));

  const totalDebit = lines.filter((l) => l.amountType === "DEBIT").reduce((sum, l) => sum + l.amount, 0);
  const totalCredit = lines.filter((l) => l.amountType === "CREDIT").reduce((sum, l) => sum + l.amount, 0);
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

  return payload;
}
