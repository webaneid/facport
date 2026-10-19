import { parseAccurateEnvelope, parseAccurateSaveEnvelope, isAccurateRecordNotFound, AccurateApiError } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { accurateFetch } from "./accurate-http";

// § architecture-sales-receipt.md — bayangan cermin PERSIS
// accurate-purchase-payment.ts (customerNo ganti vendorNo). save.do
// PER-GRUP (§ Fase 49 — 1 grup bisa berisi banyak faktur via
// `detailInvoice[]`, bukan cuma 1 baris Excel), bukan bulk-save.do —
// TIDAK ada lookup customer/faktur sebelum panggil ini —
// `customerNo`/`invoiceNo` dikirim APA ADANYA sebagai string, Accurate
// yang validasi eksistensinya. § Fase 86 — "Tax ID" (kalau diisi) SUDAH
// divalidasi terpisah SEBELUM fungsi ini dipanggil (`workers/index.ts`
// § `validateTaxIdsForReceipt`), payload di sini TIDAK PERNAH berisi
// field itu.
export type SalesReceiptSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesReceipt(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<SalesReceiptSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/sales-receipt/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesReceiptSaveResult>(res);
  });
}

// § Fase 199 (C2) — cari penerimaan berdasarkan NOMOR (verifikasi setelah timeout `save.do`). `null` = Accurate menjawab "tidak tepat" (tidak ada). Bentuk
// respons (id/number) mengikuti pola detail dokumen lain; ⚠️ pesan "tidak ada" untuk Sales Receipt belum dikonfirmasi test call nyata (terkonfirmasi untuk
// Faktur Penjualan) — pesan lain → galat → hasil verifikasi "tidak diketahui" (aman). Tidak terbaca (tanpa id) = galat, bukan "ada".
export type SalesReceiptLookup = { id: number; number: string };

export async function getSalesReceiptByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesReceiptLookup | null> {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/sales-receipt/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: { id?: unknown; number?: unknown };
    try {
      raw = await parseAccurateEnvelope<{ id?: unknown; number?: unknown }>(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) return null;
      throw err;
    }
    const id = Number(raw?.id);
    if (!Number.isFinite(id) || id <= 0) throw new AccurateApiError(`Respons detail penerimaan "${number}" tidak memuat id yang bisa dibaca`, 200);
    return { id, number: typeof raw.number === "string" && raw.number ? raw.number : number };
  });
}
