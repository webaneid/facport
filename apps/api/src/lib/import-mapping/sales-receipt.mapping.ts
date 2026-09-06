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
export const salesReceiptMapping = {
  requiredFields: ["customerNo", "bankNo", "chequeAmount", "transDate", "invoiceNo"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    bankNo: "bankNo",
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    receiptNumber: "number", // § Fase 49 — kunci grouping (opsional), nomor transaksi penerimaan sendiri
  } as const,
  defaultColumnMap: {
    "No Pelanggan": "customerNo",
    "Nomor Customer": "customerNo",
    "Customer No": "customerNo",
    "Akun Bank/Kas": "bankNo",
    "Kode Akun Bank": "bankNo",
    "Jumlah Bayar": "chequeAmount",
    "Tanggal": "transDate",
    "No Faktur": "invoiceNo",
    "Nomor Faktur": "invoiceNo",
    "No. Sales Receipt": "receiptNumber", // § Fase 49 — PERSIS nama kolom template kompetitor
    "Nomor Penerimaan": "receiptNumber",
    "No Penerimaan": "receiptNumber",
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

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<SalesReceiptField, unknown>> {
  const values: Partial<Record<SalesReceiptField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      values[field as SalesReceiptField] = rawRow[excelColumn];
    }
  }
  return values;
}

// § Fase 49 — signature BERUBAH: dari `(rawRow, columnMapping)` (1
// baris = 1 payload) jadi `(rawRows[], columnMapping)` (1 GRUP = 1
// payload, bisa banyak baris). Header (`customerNo`, `bankNo`,
// `transDate`) dari baris PERTAMA grup (sama pola `buildSalesInvoicePayload`)
// — divalidasi konsisten lewat `validateGroupCustomerConsistencyForReceipt`
// SEBELUM fungsi ini dipanggil (caller, § workers/index.ts). `chequeAmount`
// (total top-level) = SUM semua `paymentAmount` baris dalam grup — BEDA
// dari sebelumnya yang selalu ikut nilai baris tunggal.
export function buildSalesReceiptPayload(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): {
  customerNo: string;
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

  const payload: ReturnType<typeof buildSalesReceiptPayload> = {
    customerNo: String(headerValues.customerNo ?? ""),
    bankNo: String(headerValues.bankNo ?? ""),
    transDate: String(headerValues.transDate ?? ""),
    chequeAmount,
    detailInvoice,
  };
  if (headerValues.receiptNumber !== undefined) payload.number = String(headerValues.receiptNumber);

  return payload;
}
