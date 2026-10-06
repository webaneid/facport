import { parseAccurateEnvelope, parseAccurateSaveEnvelope, isAccurateRecordNotFound } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-quotation.md — Sales Quotation BUKAN transaksi
// akuntansi (tidak ada jurnal GL, tidak ada perubahan stok, sekadar
// "proposal/penawaran"), TIDAK ADA "Batal Import" — cuma butuh
// `save.do`. § Fase 169: `detail.do` dipakai MODUL SALES ORDER (bukan modul ini)
// untuk menarik baris item penawaran, § `getSalesQuotationLinesByNumber`.
export type SalesQuotationSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesQuotation(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<SalesQuotationSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-quotation/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesQuotationSaveResult>(res);
  });
}

// § Fase 169, architecture-sales-order.md — baris item penawaran untuk memperluas baris Sales Order. `GET sales-quotation/detail.do?number=`
// terdaftar di spec (param `id`/`number`) TAPI bentuk RESPONS-nya tidak terdokumentasi; dibaca mengikuti pola detail Sales Order yang
// SUDAH terbukti test call nyata (`item.no` nested, `quantity`, `unitPrice`, `detailName`, `detailNotes`) + unit sebagai objek nested
// (`itemUnit.name`, pola semua relasi lain di respons Accurate; `unit.name`/`itemUnitName` sebagai cadangan). ⚠️ BELUM diverifikasi
// dengan respons asli — karena itu parser KETAT: baris yang itemNo/harga/qty/satuannya tidak terbaca membuat seluruh perluasan GAGAL
// dengan pesan jelas; TIDAK PERNAH mengirim baris setengah-setengah ke Sales Order (harga 0 diam-diam = data akuntansi salah).
export type SalesQuotationLine = {
  itemNo: string;
  itemName: string | null;
  unitPrice: number;
  quantity: number;
  unitName: string;
  notes: string | null;
};

type RawQuotationLine = {
  item?: { no?: unknown } | null;
  itemNo?: unknown;
  detailName?: unknown;
  detailNotes?: unknown;
  unitPrice?: unknown;
  quantity?: unknown;
  itemUnit?: { name?: unknown } | null;
  unit?: { name?: unknown } | null;
  itemUnitName?: unknown;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// § security review Fase 169 (Medium) — batas jumlah baris hasil perluasan: penawaran nyata jauh di bawah ini; tanpa batas, 1 baris Excel bisa
// menggelembungkan payload `sales-order/save.do` tanpa kendali. Lebih dari batas → ditolak dengan pesan jelas (isi baris item manual di Excel).
export const MAX_QUOTATION_LINES = 500;

export function parseSalesQuotationLines(raw: { detailItem?: RawQuotationLine[] } | null | undefined, quotationNumber: string): SalesQuotationLine[] {
  const items = raw?.detailItem ?? [];
  if (items.length === 0) throw new Error(`Penawaran "${quotationNumber}" tidak punya baris item di Accurate — tidak ada yang bisa diambil.`);
  if (items.length > MAX_QUOTATION_LINES) {
    throw new Error(`Penawaran "${quotationNumber}" punya ${items.length} baris item — melebihi batas ${MAX_QUOTATION_LINES} baris untuk pengambilan otomatis. Isi baris item di Excel secara manual.`);
  }
  return items.map((it, index) => {
    const itemNo = text(it.item?.no) ?? text(it.itemNo);
    const unitName = text(it.itemUnit?.name) ?? text(it.unit?.name) ?? text(it.itemUnitName);
    const unitPrice = num(it.unitPrice);
    const quantity = num(it.quantity);
    const unreadable = [!itemNo && "kode barang", unitPrice === null && "harga", (quantity === null || quantity <= 0) && "qty", !unitName && "satuan"].filter(Boolean);
    if (unreadable.length > 0) {
      throw new Error(
        `Baris ke-${index + 1} penawaran "${quotationNumber}" tidak bisa dibaca lengkap dari Accurate (${unreadable.join(", ")}) — isi kolom item di Excel secara manual untuk baris ini, atau hubungi support.`,
      );
    }
    return { itemNo: itemNo!, itemName: text(it.detailName), unitPrice: unitPrice!, quantity: quantity!, unitName: unitName!, notes: text(it.detailNotes) };
  });
}

export async function getSalesQuotationLinesByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesQuotationLine[]> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-quotation/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: { detailItem?: RawQuotationLine[] };
    try {
      raw = await parseAccurateEnvelope<{ detailItem?: RawQuotationLine[] }>(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) throw new Error(`Penawaran "${number}" tidak ditemukan di Accurate — cek kembali kolom "Sales Quot No".`);
      throw err;
    }
    return parseSalesQuotationLines(raw, number);
  });
}
