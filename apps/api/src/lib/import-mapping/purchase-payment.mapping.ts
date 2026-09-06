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
// § Fase 50 — diminta user: label kolom & susunan boleh ikut istilah
// kompetitor (client sudah familiar). Alias kompetitor jadi PRIORITAS
// (dicek lebih dulu di `defaultColumnMap`, walau urutan object literal
// tidak memengaruhi lookup — ini murni dokumentasi/preferensi tampilan),
// label Indonesia lama TETAP ada sebagai alias sekunder (non-breaking).
// PENTING: kolom "Payment" (BUKAN "Cheque Amount") yang menyimpan
// nominal pembayaran SEBENARNYA di data asli kompetitor — "Cheque
// Amount" sering KOSONG (cuma dipakai kalau metode bayar cek fisik).
export const purchasePaymentMapping = {
  requiredFields: ["vendorNo", "bankNo", "chequeAmount", "transDate", "invoiceNo"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    bankNo: "bankNo",
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    paymentNumber: "number", // § Fase 50 — kunci grouping (opsional), nomor transaksi pembayaran sendiri
  } as const,
  defaultColumnMap: {
    // § Fase 50 — alias kompetitor (PERSIS nama kolom template mereka)
    "Purchase Payment No": "paymentNumber",
    "No. Bank Account": "bankNo",
    "No. Supplier": "vendorNo",
    "Invoice No": "invoiceNo",
    "Payment": "chequeAmount", // § BUKAN "Cheque Amount" — lihat komentar atas
    "Date": "transDate",
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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<PurchasePaymentField, unknown>> {
  const values: Partial<Record<PurchasePaymentField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      values[field as PurchasePaymentField] = rawRow[excelColumn];
    }
  }
  return values;
}

// § Fase 50 — signature BERUBAH: dari `(rawRow, columnMapping)` jadi
// `(rawRows[], columnMapping)`, mirror `buildSalesReceiptPayload`.
// Header (`vendorNo`, `bankNo`, `transDate`) dari baris PERTAMA grup —
// divalidasi konsisten lewat `validateGroupVendorConsistencyForPayment`
// SEBELUM fungsi ini dipanggil (caller, § workers/index.ts).
// `chequeAmount` (total top-level) = SUM semua `paymentAmount` baris
// dalam grup.
export function buildPurchasePaymentPayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): {
  vendorNo: string;
  bankNo: string;
  transDate: string;
  chequeAmount: number;
  number?: string;
  detailInvoice: { invoiceNo: string; paymentAmount: number }[];
} {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const detailInvoice = rawRows.map((rawRow) => {
    const rowValues = extractRowValues(rawRow, columnMapping);
    return { invoiceNo: String(rowValues.invoiceNo ?? ""), paymentAmount: Number(rowValues.chequeAmount ?? 0) };
  });
  const chequeAmount = detailInvoice.reduce((sum, d) => sum + d.paymentAmount, 0);

  const payload: ReturnType<typeof buildPurchasePaymentPayload> = {
    vendorNo: String(headerValues.vendorNo ?? ""),
    bankNo: String(headerValues.bankNo ?? ""),
    transDate: String(headerValues.transDate ?? ""),
    chequeAmount,
    detailInvoice,
  };
  if (headerValues.paymentNumber !== undefined) payload.number = String(headerValues.paymentNumber);

  return payload;
}
