// § Perbaikan kecil (2026-10-20) — galat Accurate pada pembayaran/penerimaan menyebut faktur dengan NOMOR LAIN dari yang ada di Excel (kasus nyata: Excel
// "PIN-2606-172", pesan Accurate "351-09061110" — kemungkinan nomor tagihan pemasok), sehingga pelanggan tidak bisa mencocokkannya. Pesan ditambah daftar faktur
// pada dokumen itu MENURUT EXCEL (nomor + nilai Payment). Tanpa panggilan Accurate baru; hanya untuk galat yang memang soal faktur/jumlah.

const INVOICE_AMOUNT_ERROR = /melebihi nilai (utang|piutang)|tidak ditemukan atau sudah dihapus/i;

function columnOf(columnMapping: Record<string, string>, field: string): string | undefined {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
}

function formatAmount(raw: unknown): string {
  const n = Number(raw);
  return Number.isFinite(n) && String(raw).trim() !== "" ? n.toLocaleString("id-ID") : String(raw ?? "").trim();
}

export function annotatePaymentFailure(
  message: string,
  rows: { rawData: Record<string, unknown> }[],
  columnMapping: Record<string, string>,
  maxList = 15,
): string {
  if (!INVOICE_AMOUNT_ERROR.test(message)) return message;
  const invoiceCol = columnOf(columnMapping, "invoiceNo");
  if (!invoiceCol) return message;
  const amountCol = columnOf(columnMapping, "chequeAmount");

  // Nomor faktur sama di beberapa baris → satu entri; nilai Payment dijumlahkan bila semuanya angka (cocok dengan cara Facport menggabungkan baris).
  const byInvoice = new Map<string, { amounts: unknown[] }>();
  for (const row of rows) {
    const no = String(row.rawData[invoiceCol] ?? "").trim();
    if (!no) continue;
    const entry = byInvoice.get(no) ?? { amounts: [] };
    if (amountCol && row.rawData[amountCol] !== undefined && String(row.rawData[amountCol]).trim() !== "") entry.amounts.push(row.rawData[amountCol]);
    byInvoice.set(no, entry);
  }
  if (byInvoice.size === 0) return message;

  const items = [...byInvoice.entries()].map(([no, { amounts }]) => {
    if (amounts.length === 0) return no;
    const unique = [...new Set(amounts.map((a) => String(a).trim()))];
    // Baris ganda untuk faktur yang sama biasanya mengulang angka yang SAMA (diskon tambahan) — tampilkan sekali; angka berbeda dijumlahkan.
    const shown = unique.length === 1 ? formatAmount(unique[0]) : formatAmount(unique.reduce((s, a) => s + Number(a), 0));
    return `${no} (Payment ${shown})`;
  });
  const listed = items.slice(0, maxList).join(", ");
  const more = items.length > maxList ? `, dan ${items.length - maxList} faktur lain` : "";
  return `${message} Faktur pada dokumen ini menurut Excel: ${listed}${more}. Accurate bisa menyebut faktur dengan nomor lain (mis. nomor tagihan pemasok) — cocokkan dengan daftar ini.`;
}
