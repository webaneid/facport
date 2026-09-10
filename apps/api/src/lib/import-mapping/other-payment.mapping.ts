// § architecture-other-payment.md — Other Payment = pembayaran BANK/KAS
// untuk BEBAN LANGSUNG (listrik, gaji, sewa, dll), TANPA faktur/vendor
// — BEDA dari Purchase Payment (melunasi faktur yang sudah ada).
// Grouping by "Trans No" SEJAK AWAL (modul baru, TIDAK ada versi lama
// yang perlu dijaga kompatibel seperti Opsi A Jurnal Umum) — 1 baris
// Excel = 1 elemen `detailAccount[]`, baris dengan "Trans No" sama
// digabung jadi 1 payload. TIDAK ADA validasi balance debit=kredit
// (beda dari Jurnal Umum) — `bankNo` otomatis sisi kredit via API,
// `detailAccount[]` semua otomatis debit, bukan transaksi double-entry
// manual.
//
// § Fase 96 (2026-09-10) — 2 gap field (TIDAK ADA di spec resmi
// `other-payment/save.do` SPESIFIK, tapi ADA di endpoint LAIN Accurate)
// diimplementasikan dengan catatan "BELUM diverifikasi end-to-end untuk
// endpoint ini" (keputusan eksplisit user — dokumentasikan yang sudah
// confirmed, sisakan yang belum, bukan skip total): `lineProjectNo`
// (ada di 48 endpoint lain termasuk Purchase Payment/Journal Voucher)
// dan `attributTambahan*`/`attributNumber*`/`attributTanggal*`
// (charField/numericField/dateField LEVEL ROOT — dikonfirmasi resmi
// Accurate Support untuk Purchase Invoice via email, § Fase 64
// `sales-invoice.mapping.ts`, diasumsikan konsisten lintas transaksi).
// Tab "Deferral" SENGAJA TIDAK diimplementasi — bukan gap, tidak ada
// kolom Excel untuk ini di template client sama sekali (murni elemen
// UI Accurate, dicek langsung ke file asli).
//
// § "Expense Name" (kolom BARU, TIDAK ADA di template client asli) —
// `expenseName` WAJIB di `other-payment/save.do` ("Nama beban yang
// ingin dicatat, mis. Pembayaran listrik", bebas teks — BUKAN lookup/
// auto dari akun), tapi template client tidak punya kolom untuk ini
// sama sekali. Keputusan eksplisit user: JANGAN repurpose kolom
// "Account Name" (risiko salah asumsi, field itu sendiri TIDAK
// di-mapping — display-only, echo dari accountNo) ATAU biarkan kosong
// (Accurate pasti tolak field wajib kosong) — tambah kolom BARU
// "Expense Name", WAJIB diisi user.
//
// § Kategori Keuangan (`dataClassification1-10Name`, level
// `detailAccount[]`) — BELAJAR dari gap Fase 98 (field yang SAMA di
// Journal Voucher ditambahkan Fase 95 TANPA mirror auto-create-nya) —
// modul ini LANGSUNG dilengkapi `extractDataClassificationValues` dari
// awal (dipanggil worker, § `ensureOtherPaymentDataClassifications`),
// TIDAK ditunda ke fase perbaikan terpisah.
export const otherPaymentMapping = {
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
    branchName: "branchName", // root, WAJIB (screenshot UI client tanda merah *)
    bankNo: "bankNo", // root, WAJIB — akun kas/bank sumber dana
    payee: "payee", // root, WAJIB — informasi penerima (mis. "PLN")
    chequeNo: "chequeNo",
    description: "description",
    rate: "rate",
    // § 1 BARIS = 1 elemen `detailAccount[]` (BEBAS panjang N-baris,
    // dikelompokkan via transNo).
    lineAccountNo: "detailAccount[].accountNo",
    lineAmount: "detailAccount[].amount",
    lineExpenseName: "detailAccount[].expenseName", // "Paid to"/"Nama Beban" di UI — kolom BARU, § komentar atas
    lineDepartmentName: "detailAccount[].departmentName",
    // § Gap #1 — TIDAK ADA di spec other-payment/save.do SPESIFIK, ADA
    // di 48 endpoint lain — BELUM diverifikasi end-to-end endpoint ini.
    lineProjectNo: "detailAccount[].projectNo",
    lineMemo: "detailAccount[].memo",
    // § Kategori Keuangan — line-level, SAMA field family Journal
    // Voucher Fase 95/98 (auto-create dari awal, lihat komentar atas).
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
    // § Gap #2 — ROOT level (BUKAN di detailAccount[]), 0 kemunculan di
    // spec resmi untuk endpoint APA PUN, TAPI dikonfirmasi resmi
    // Accurate Support (email, § Fase 64) untuk Purchase Invoice —
    // diasumsikan konsisten lintas transaksi, BELUM diverifikasi
    // end-to-end endpoint ini. Diambil dari baris PERTAMA grup saja
    // (sama pola branchName/bankNo/payee).
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
  // § URUTAN kolom mengikuti PERSIS template client
  // (`CLIENT_other-payment-v1.2.xlsx`) — "Atribut Tambahan 1-10"/
  // "Atribut Number 1-10"/"Kategori Keuangan 1-10" di file asli cuma
  // label ringkas, DI-EXPAND jadi kolom individual di sini (pola numerik
  // "Atribut Tambahan 1", "Atribut Tambahan 2", dst). "Account Name"
  // (antara "Acc No" dan "Amount") SENGAJA TIDAK ada di map — display-
  // only, echo dari accountNo, sama pola "Nama Perkiraan" Jurnal Umum.
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
    "Amount": "lineAmount",
    "Expense Name": "lineExpenseName",
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

export type OtherPaymentField = keyof typeof otherPaymentMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type OtherPaymentGroup = { transNo: string | null; rows: ImportRowRecord[] };

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
// TETAP VALID di sini — 1 transaksi Other Payment SAH punya cuma 1
// baris/1 akun beban (tidak ada aturan double-entry/minimal N baris).
export function groupOtherPaymentRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): OtherPaymentGroup[] {
  const transNoColumn = transNoColumnOf(columnMapping);
  const groups: OtherPaymentGroup[] = [];
  const byTransNo = new Map<string, OtherPaymentGroup>();

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

// § mirror PERSIS `extractDataClassificationValues` (`journal-voucher.mapping.ts`
// § Fase 98) — dipanggil worker (`ensureOtherPaymentDataClassifications`)
// buat auto-create Kategori Keuangan SEBELUM kirim ke Accurate, DARI
// AWAL modul ini dibangun (bukan fase perbaikan terpisah, § komentar atas).
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

const ROOT_OPTIONAL_FIELDS: readonly OtherPaymentField[] = [
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

// § Gap #2 (charField/numericField/dateField) — ROOT level, diambil
// dari baris PERTAMA grup saja (sama pola branchName/bankNo/payee),
// BUKAN per-baris seperti Kategori Keuangan (§ komentar atas file ini).
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
  ["attributTanggal1", "dateField1", String] as const,
  ["attributTanggal2", "dateField2", String] as const,
];

// § Terima ARRAY baris (1 grup = 1 transaksi, N akun beban). TIDAK ADA
// validasi balance (beda dari Jurnal Umum) — `bankNo` otomatis sisi
// kredit via API, `detailAccount[]` semua otomatis debit.
export function buildOtherPaymentPayload(
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
  const rootOptionalColumns = ROOT_OPTIONAL_FIELDS.map((field) => [columnOf(columnMapping, field), otherPaymentMapping.fieldToAccuratePath[field]] as const);
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
    transDate: String((transDateColumn && firstRow[transDateColumn]) ?? ""),
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
