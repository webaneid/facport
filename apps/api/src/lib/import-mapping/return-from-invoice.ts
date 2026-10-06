// § Fase 170, architecture-sales-return.md / architecture-purchase-return.md § "Fase 170" — Sales Return & Purchase Return mengambil HARGA
// (dan DISKON baris) dari FAKTUR ASAL bila "Unit Price" dikosongkan. `unitPrice` wajib di `detailItem` (spec Accurate); membuatnya opsional tanpa
// sumber akan mengirim 0 = data akuntansi salah. Inti MURNI (tanpa DB/jaringan) dipakai kedua modul; pembaca faktur di accurate-*-invoice.ts.
//
// Aturan (user 2026-10-06): hanya returnType INVOICE/INVOICE_DP dengan Invoice No terisi; baris dengan Unit Price KOSONG → harga dari baris faktur
// ber-Item No sama; Unit Price terisi → dipakai apa adanya. Diskon baris faktur ikut disalin (persen apa adanya; nominal di-pro-rata ke qty retur)
// HANYA kalau kedua kolom diskon baris retur kosong (diskon di Excel = Excel menang). Tipe lain (DELIVERY/RECEIVE/NO_INVOICE) → Unit Price tetap
// wajib manual. Kasus tak bisa dipastikan GAGAL jelas, tidak pernah mengirim 0.

export type InvoiceLine = {
  itemNo: string;
  unitPrice: number;
  quantity: number;
  /** Diskon persen baris faktur (string, mendukung "5 + 2"), null = tanpa diskon. */
  discPercent: string | null;
  /** Diskon nominal baris faktur untuk qty PENUH baris itu, null = tanpa diskon. */
  cashDiscount: number | null;
};

export const INVOICE_RETURN_TYPES = new Set(["INVOICE", "INVOICE_DP"]);
/** Maksimum baris faktur yang dibaca (pengaman payload/memori; faktur nyata jauh di bawah ini). */
export const MAX_INVOICE_LINES = 1000;

type RawInvoiceLine = {
  item?: { no?: unknown } | null;
  unitPrice?: unknown;
  quantity?: unknown;
  itemDiscPercent?: unknown;
  itemCashDiscount?: unknown;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Parse KETAT respons `detail.do` faktur → baris. Baris yang kode barang/harga/qty tidak terbaca = error jelas (bukan diam-diam harga 0). */
export function parseInvoiceLines(raw: { detailItem?: RawInvoiceLine[] } | null | undefined, invoiceNumber: string): InvoiceLine[] {
  const items = raw?.detailItem ?? [];
  if (items.length === 0) throw new Error(`Faktur "${invoiceNumber}" tidak punya baris item di Accurate — harga tidak bisa diambil.`);
  if (items.length > MAX_INVOICE_LINES) throw new Error(`Faktur "${invoiceNumber}" punya ${items.length} baris item — melebihi batas ${MAX_INVOICE_LINES} untuk pengambilan harga otomatis. Isi Unit Price di Excel secara manual.`);
  return items.map((it, index) => {
    const itemNo = text(it.item?.no);
    const unitPrice = num(it.unitPrice);
    const quantity = num(it.quantity);
    const unreadable = [!itemNo && "kode barang", unitPrice === null && "harga", (quantity === null || quantity <= 0) && "qty"].filter(Boolean);
    if (unreadable.length > 0) {
      throw new Error(`Baris ke-${index + 1} faktur "${invoiceNumber}" tidak bisa dibaca lengkap dari Accurate (${unreadable.join(", ")}) — isi Unit Price di Excel secara manual, atau hubungi support.`);
    }
    const percentRaw = it.itemDiscPercent;
    const percentText = typeof percentRaw === "number" ? String(percentRaw) : text(percentRaw);
    const percent = percentText !== null && Number(percentText) !== 0 ? percentText : null;
    const cash = num(it.itemCashDiscount);
    return { itemNo: itemNo!, unitPrice: unitPrice!, quantity: quantity!, discPercent: percent, cashDiscount: cash !== null && cash > 0 ? cash : null };
  });
}

function cellFilled(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): boolean {
  const column = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!column) return false;
  const value = rawRow[column];
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cellValue(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): string {
  const column = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  return column ? String(rawRow[column] ?? "").trim() : "";
}

/** Baris retur bertipe INVOICE/INVOICE_DP dengan Invoice No terisi — satu-satunya jenis baris yang boleh mengosongkan Unit Price. */
export function isInvoiceReturnRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): boolean {
  return INVOICE_RETURN_TYPES.has(cellValue(rawRow, columnMapping, "returnType").toUpperCase()) && cellFilled(rawRow, columnMapping, "invoiceNumber");
}

/** Field wajib yang kosong di SATU baris; "unitPrice" dikecualikan untuk baris retur-faktur (diisi dari faktur asal saat kirim). */
export function missingRequiredFieldsForReturnRow(
  requiredFields: readonly string[],
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): string[] {
  const exemptPrice = isInvoiceReturnRow(rawRow, columnMapping);
  return requiredFields.filter((field) => !(exemptPrice && field === "unitPrice") && !cellFilled(rawRow, columnMapping, field));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Isi `unitPrice` (dan diskon) baris `payload.detailItem` yang Unit Price-nya kosong dari faktur asal. `fetchLines` disuntikkan (worker: baca
 * Accurate; test: palsu). Faktur dibaca SEKALI per retur, hanya kalau ada baris yang perlu diisi. Mengubah `payload.detailItem` di tempat.
 */
export async function fillReturnPricesFromInvoice(
  payload: Record<string, unknown>,
  fetchLines: (invoiceNumber: string) => Promise<InvoiceLine[]>,
): Promise<void> {
  const entries = (payload.detailItem as Record<string, unknown>[] | undefined) ?? [];
  const blank = entries.filter((e) => e.unitPrice === undefined);
  if (blank.length === 0) return;

  const returnType = String(payload.returnType ?? "").trim().toUpperCase();
  const invoiceNumber = text(payload.invoiceNumber);
  if (!INVOICE_RETURN_TYPES.has(returnType) || !invoiceNumber) {
    throw new Error(
      `Unit Price wajib diisi untuk Return Type "${returnType || "-"}" — hanya Return Type INVOICE/INVOICE_DP (dengan Invoice No terisi) yang bisa mengambil harga otomatis dari faktur.`,
    );
  }

  const lines = await fetchLines(invoiceNumber);
  for (const entry of blank) {
    const itemNo = String(entry.itemNo ?? "").trim();
    const matches = lines.filter((l) => l.itemNo.toLowerCase() === itemNo.toLowerCase());
    if (matches.length === 0) {
      throw new Error(`Item "${itemNo}" tidak ada di faktur "${invoiceNumber}" — Unit Price tidak bisa diambil otomatis; cek kode barang atau isi Unit Price manual.`);
    }
    const key = (l: InvoiceLine) => `${l.unitPrice}|${l.discPercent ?? ""}|${l.cashDiscount === null ? "" : (l.cashDiscount / l.quantity).toFixed(8)}`;
    if (new Set(matches.map(key)).size > 1) {
      throw new Error(`Item "${itemNo}" muncul ${matches.length}× di faktur "${invoiceNumber}" dengan harga/diskon berbeda — tidak bisa dipastikan baris mana; isi Unit Price manual.`);
    }
    const line = matches[0]!;
    entry.unitPrice = line.unitPrice;
    // Diskon baris faktur ikut disalin hanya kalau Excel tidak mengisi diskon baris retur sama sekali.
    if (entry.itemDiscPercent === undefined && entry.itemCashDiscount === undefined) {
      if (line.discPercent !== null) entry.itemDiscPercent = line.discPercent;
      const returnQty = Number(entry.quantity);
      if (line.cashDiscount !== null && Number.isFinite(returnQty) && returnQty > 0) {
        entry.itemCashDiscount = round6((line.cashDiscount / line.quantity) * returnQty);
      }
    }
  }
}
