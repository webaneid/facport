// § architecture-other-deposit.md — Other Deposit = PENERIMAAN kas/bank
// TANPA faktur/customer (kebalikan Other Payment, § other-payment.mapping.ts
// — modul ini UANG MASUK, itu UANG KELUAR). Struktur payload API Accurate
// `other-deposit/save.do` IDENTIK `other-payment/save.do` byte-for-byte
// (dikonfirmasi langsung dari `accurate-openapi.json` — sampai field
// `detailAccount[].expenseName` pun namanya SAMA PERSIS "expenseName",
// bukan typo di sini — itu quirk penamaan Accurate sendiri yang reuse
// istilah "beban" walau konteksnya transaksi penerimaan). Grouping by
// "Trans No" sejak awal (modul baru), 1 baris Excel = 1 elemen
// `detailAccount[]`, baris "Trans No" sama digabung jadi 1 payload.
// TIDAK ADA validasi balance debit=kredit — `bankNo` otomatis sisi
// debit via API (kebalikan Other Payment yang kredit), `detailAccount[]`
// semua otomatis kredit.
//
// § Gap sama persis Other Payment (dikonfirmasi ULANG terhadap
// `accurate-openapi.json` § `/api/other-deposit/save.do`, BUKAN asumsi
// dari Other Payment tanpa cek): `detailAccount[].expenseName` WAJIB di
// spec resmi endpoint ini, TAPI template client (sheet "Othe Deposit",
// developmen-15-september-2026.xlsx) TIDAK punya kolom untuk ini —
// sama solusi: kolom BARU "Expense Name" (bukan "Income Name"/dll —
// dipertahankan sama sesuai NAMA FIELD ASLI Accurate, supaya user yang
// baca error Accurate langsung nyambung ke kolom mana, bukan istilah
// yang kita karang sendiri). `lineProjectNo` dan
// `attributTambahan*`/`attributNumber*`/`attributTanggal*` (charField/
// numericField/dateField root) SAMA "belum diverifikasi end-to-end
// untuk endpoint ini" seperti Other Payment — TIDAK ada di spec resmi
// endpoint ini juga (dicek ulang), status gap-nya SAMA.
export const otherDepositMapping = {
  requiredFields: [
    "transDate",
    "transNo",
    "branchName",
    "bankNo",
    "payee",
    "lineAccountNo",
    "lineAmount",
    "lineExpenseName",
  ] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    // § `transNo` kunci grouping (→ Accurate `number`, field opsional
    // manual numbering) — sama pola journalNumber/receiptNumber/paymentNumber.
    transNo: "number",
    branchName: "branchName", // root, WAJIB
    bankNo: "bankNo", // root, WAJIB — akun kas/bank TUJUAN dana masuk
    payee: "payee", // root, WAJIB — informasi pemberi/sumber dana (mis. "Setoran Modal")
    chequeNo: "chequeNo",
    description: "description",
    rate: "rate",
    // § 1 BARIS = 1 elemen `detailAccount[]` (BEBAS panjang N-baris,
    // dikelompokkan via transNo).
    lineAccountNo: "detailAccount[].accountNo",
    lineAmount: "detailAccount[].amount",
    lineExpenseName: "detailAccount[].expenseName", // field API Accurate literal namanya "expenseName" walau konteks penerimaan, § komentar atas
    lineDepartmentName: "detailAccount[].departmentName",
    // § Gap #1 — TIDAK ADA di spec other-deposit/save.do SPESIFIK, ADA
    // di endpoint lain — BELUM diverifikasi end-to-end untuk endpoint ini.
    lineProjectNo: "detailAccount[].projectNo",
    lineMemo: "detailAccount[].memo",
    // § Kategori Keuangan — line-level, sama field family Journal
    // Voucher/Other Payment (auto-create dari awal).
    attribut1: "detailAccount[].dataClassification1Name",
    attribut2: "detailAccount[].dataClassification2Name",
    attribut3: "detailAccount[].dataClassification3Name",
    attribut4: "detailAccount[].dataClassification4Name",
    attribut5: "detailAccount[].dataClassification5Name",
    attribut6: "detailAccount[].dataClassification6Name",
    attribut7: "detailAccount[].dataClassification7Name",
    attribut8: "detailAccount[].dataClassification8Name",
    attribut9: "detailAccount[].dataClassification9Name",
    attribut10: "detailAccount[].dataClassification10Name",
    // § Gap #2 — ROOT level, 0 kemunculan di spec resmi endpoint APA
    // PUN yang dicek, TAPI dikonfirmasi resmi Accurate Support (email,
    // konteks Purchase Invoice) — diasumsikan konsisten lintas transaksi,
    // BELUM diverifikasi end-to-end endpoint ini. Diambil dari baris
    // PERTAMA grup saja (sama pola branchName/bankNo/payee).
    attributTambahan1: "charField1",
    attributTambahan2: "charField2",
    attributTambahan3: "charField3",
    attributTambahan4: "charField4",
    attributTambahan5: "charField5",
    attributTambahan6: "charField6",
    attributTambahan7: "charField7",
    attributTambahan8: "charField8",
    attributTambahan9: "charField9",
    attributTambahan10: "charField10",
    attributNumber1: "numericField1",
    attributNumber2: "numericField2",
    attributNumber3: "numericField3",
    attributNumber4: "numericField4",
    attributNumber5: "numericField5",
    attributNumber6: "numericField6",
    attributNumber7: "numericField7",
    attributNumber8: "numericField8",
    attributNumber9: "numericField9",
    attributNumber10: "numericField10",
    attributTanggal1: "dateField1",
    attributTanggal2: "dateField2",
  } as const,
  // § URUTAN kolom mengikuti PERSIS sheet "Othe Deposit"
  // (developmen-15-september-2026.xlsx) — "Atribut Tambahan 1-10"/
  // "Atribut Number 1-10"/"Kategori Keuangan 1-10" di file asli cuma
  // label ringkas, DI-EXPAND jadi kolom individual (pola sama Other
  // Payment). "Account Name" (antara "Acc No" dan "Amount") SENGAJA
  // TIDAK ada di map — display-only, echo dari accountNo. "Expense
  // Name" TIDAK ada di sheet asli — kolom BARU (§ komentar atas).
  defaultColumnMap: {
    "Trans Date": "transDate",
    "Trans No": "transNo",
    "Branch Name": "branchName",
    "Bank No": "bankNo",
    "Payee": "payee",
    "Cheque No": "chequeNo",
    "Description": "description",
    "Rate": "rate",
    "Acc No": "lineAccountNo",
    // § pola sama Other Payment — "Expense Name" tepat setelah "Acc No"
    // (Akun → Nama → Nominal, urutan natural dibaca).
    "Expense Name": "lineExpenseName",
    "Amount": "lineAmount",
    "Memo": "lineMemo",
    "Department": "lineDepartmentName",
    "Project No": "lineProjectNo",
    "Atribut Tambahan 1": "attributTambahan1",
    "Atribut Tambahan 2": "attributTambahan2",
    "Atribut Tambahan 3": "attributTambahan3",
    "Atribut Tambahan 4": "attributTambahan4",
    "Atribut Tambahan 5": "attributTambahan5",
    "Atribut Tambahan 6": "attributTambahan6",
    "Atribut Tambahan 7": "attributTambahan7",
    "Atribut Tambahan 8": "attributTambahan8",
    "Atribut Tambahan 9": "attributTambahan9",
    "Atribut Tambahan 10": "attributTambahan10",
    "Atribut Number 1": "attributNumber1",
    "Atribut Number 2": "attributNumber2",
    "Atribut Number 3": "attributNumber3",
    "Atribut Number 4": "attributNumber4",
    "Atribut Number 5": "attributNumber5",
    "Atribut Number 6": "attributNumber6",
    "Atribut Number 7": "attributNumber7",
    "Atribut Number 8": "attributNumber8",
    "Atribut Number 9": "attributNumber9",
    "Atribut Number 10": "attributNumber10",
    "Atribut Tanggal 1": "attributTanggal1",
    "Atribut Tanggal 2": "attributTanggal2",
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

export type OtherDepositField = keyof typeof otherDepositMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type OtherDepositGroup = { transNo: string | null; rows: ImportRowRecord[] };

export function transNoColumnOf(columnMapping: Record<string, string>): string | null {
  return Object.entries(columnMapping).find(([, field]) => field === "transNo")?.[0] ?? null;
}

function transNoOf(row: ImportRowRecord, transNoColumn: string | null): string | null {
  if (!transNoColumn) return null;
  const value = row.rawData[transNoColumn];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § BEDA dari Jurnal Umum: grup singleton (1 baris, tanpa Trans No)
// TETAP VALID di sini — 1 transaksi Other Deposit SAH punya cuma 1
// baris/1 akun (tidak ada aturan double-entry/minimal N baris).
export function groupOtherDepositRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): OtherDepositGroup[] {
  const transNoColumn = transNoColumnOf(columnMapping);
  const groups: OtherDepositGroup[] = [];
  const byTransNo = new Map<string, OtherDepositGroup>();

  for (const row of rows) {
    const transNo = transNoOf(row, transNoColumn);
    if (transNo === null) {
      groups.push({ transNo: null, rows: [row] });
      continue;
    }
    const key = transNo.toLowerCase();
    let group = byTransNo.get(key);
    if (!group) {
      group = { transNo, rows: [] };
      byTransNo.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  if (!column) return undefined;
  const value = rawRow[column];
  return value === undefined || value === null || value === "" ? undefined : value;
}

// § mirror PERSIS `toAccurateDate` di `other-payment.mapping.ts` (§ bug
// ditemukan 2026-09-11, client retest nyata) — cell Excel bertipe
// Tanggal asli kebaca sebagai angka serial, WAJIB dikonversi ke
// DD/MM/YYYY, bukan di-`String()` polos. SENGAJA fungsi terpisah
// (bukan di-share), konsisten pola project ini.
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

// § dipakai SETIAP kali baca nilai kolom yang di-mapping ke salah satu
// field tanggal — WAJIB dipanggil, bukan `valueOf`/akses langsung
// `rawRow[column]`, supaya konversi Excel-serial-ke-DD/MM/YYYY konsisten.
function dateValueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  const raw = valueOf(rawRow, column);
  return raw === undefined ? undefined : toAccurateDate(raw);
}

// § mirror PERSIS `extractDataClassificationValues` (other-payment/
// journal-voucher) — dipanggil worker buat auto-create Kategori
// Keuangan SEBELUM kirim ke Accurate, DARI AWAL modul ini dibangun.
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

const ROOT_OPTIONAL_FIELDS: readonly OtherDepositField[] = [
  "chequeNo",
  "description",
] as const;

const LINE_OPTIONAL_FIELDS = [
  ["lineDepartmentName", "departmentName", String] as const,
  ["lineProjectNo", "projectNo", String] as const,
  ["lineMemo", "memo", String] as const,
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

// § Gap #2 — ROOT level, diambil dari baris PERTAMA grup saja.
const ROOT_GAP_FIELDS = [
  ["attributTambahan1", "charField1", String] as const,
  ["attributTambahan2", "charField2", String] as const,
  ["attributTambahan3", "charField3", String] as const,
  ["attributTambahan4", "charField4", String] as const,
  ["attributTambahan5", "charField5", String] as const,
  ["attributTambahan6", "charField6", String] as const,
  ["attributTambahan7", "charField7", String] as const,
  ["attributTambahan8", "charField8", String] as const,
  ["attributTambahan9", "charField9", String] as const,
  ["attributTambahan10", "charField10", String] as const,
  ["attributNumber1", "numericField1", Number] as const,
  ["attributNumber2", "numericField2", Number] as const,
  ["attributNumber3", "numericField3", Number] as const,
  ["attributNumber4", "numericField4", Number] as const,
  ["attributNumber5", "numericField5", Number] as const,
  ["attributNumber6", "numericField6", Number] as const,
  ["attributNumber7", "numericField7", Number] as const,
  ["attributNumber8", "numericField8", Number] as const,
  ["attributNumber9", "numericField9", Number] as const,
  ["attributNumber10", "numericField10", Number] as const,
  ["attributTanggal1", "dateField1", toAccurateDate] as const,
  ["attributTanggal2", "dateField2", toAccurateDate] as const,
];

// § Terima ARRAY baris (1 grup = 1 transaksi, N akun). TIDAK ADA
// validasi balance — `bankNo` otomatis sisi debit via API,
// `detailAccount[]` semua otomatis kredit (kebalikan Other Payment).
export function buildOtherDepositPayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const transDateColumn = columnOf(columnMapping, "transDate");
  const transNoColumn = transNoColumnOf(columnMapping);
  const branchNameColumn = columnOf(columnMapping, "branchName");
  const bankNoColumn = columnOf(columnMapping, "bankNo");
  const payeeColumn = columnOf(columnMapping, "payee");
  const accountNoColumn = columnOf(columnMapping, "lineAccountNo");
  const amountColumn = columnOf(columnMapping, "lineAmount");
  const expenseNameColumn = columnOf(columnMapping, "lineExpenseName");
  const rateColumn = columnOf(columnMapping, "rate");
  const rootOptionalColumns = ROOT_OPTIONAL_FIELDS.map((field) => [columnOf(columnMapping, field), otherDepositMapping.fieldToAccuratePath[field]] as const);
  const lineOptionalColumns = LINE_OPTIONAL_FIELDS.map(([field, accuratePath, cast]) => [columnOf(columnMapping, field), accuratePath, cast] as const);
  const rootGapColumns = ROOT_GAP_FIELDS.map(([field, accuratePath, cast]) => [columnOf(columnMapping, field), accuratePath, cast] as const);

  const detailAccount = rawRows.map((rawRow) => {
    const line: Record<string, unknown> = {
      accountNo: String((accountNoColumn && rawRow[accountNoColumn]) ?? ""),
      amount: Number((amountColumn && rawRow[amountColumn]) ?? 0),
      expenseName: String((expenseNameColumn && rawRow[expenseNameColumn]) ?? ""),
    };
    for (const [column, accuratePath, cast] of lineOptionalColumns) {
      const value = valueOf(rawRow, column);
      if (value !== undefined) line[accuratePath] = cast(value);
    }
    return line;
  });

  const firstRow = rawRows[0] ?? {};
  const payload: Record<string, unknown> = {
    transDate: String(dateValueOf(firstRow, transDateColumn) ?? ""),
    branchName: String((branchNameColumn && firstRow[branchNameColumn]) ?? ""),
    bankNo: String((bankNoColumn && firstRow[bankNoColumn]) ?? ""),
    payee: String((payeeColumn && firstRow[payeeColumn]) ?? ""),
    detailAccount,
  };

  const transNo = transNoColumn ? firstRow[transNoColumn] : undefined;
  if (transNo !== undefined && transNo !== "") payload.number = String(transNo);

  const rate = rateColumn ? firstRow[rateColumn] : undefined;
  if (rate !== undefined && rate !== "") payload.rate = Number(rate);

  for (const [column, accuratePath] of rootOptionalColumns) {
    const value = valueOf(firstRow, column);
    if (value !== undefined) payload[accuratePath] = String(value);
  }
  for (const [column, accuratePath, cast] of rootGapColumns) {
    const value = valueOf(firstRow, column);
    if (value !== undefined) payload[accuratePath] = cast(value);
  }

  return payload;
}
