import { parseAccurateEnvelope, parseAccurateSaveEnvelope, isAccurateRecordNotFound } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { parseSalesQuotationDetail, type RawQuotation, type SalesQuotationDetail } from "./accurate-sales-quotation";

// § architecture-delivery-order.md — dokumen bukti FISIK barang sudah
// dikirim ke customer, bukan transaksi akuntansi tersendiri (mirror pola
// Receive Item/Purchase Payment): TIDAK ADA "Batal Import" — jadi cuma
// butuh `save.do`, TIDAK butuh `detail.do`/`delete.do`.
export type DeliveryOrderSaveResult = {
  id: number;
  number: string;
};

export async function saveDeliveryOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<DeliveryOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/delivery-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<DeliveryOrderSaveResult>(res);
  });
}

// § Fase 198 tahap C — isi Delivery Order untuk memperluas baris Sales Invoice (nomor "ITEM: DELIVERY ORDER NO" terisi, kolom item kosong). Bentuk
// respons `delivery-order/detail.do` TIDAK terdokumentasi di spec dan belum pernah dibaca; diasumsikan sama dengan detail Sales Order/Quotation
// (`item.no`, `quantity`, `unitPrice`, `itemUnit.name`, `warehouse.name`) — parser KETAT di inti baris (kode barang, harga, qty, satuan: tidak
// terbaca = gagal jelas, tidak ada baris setengah). ⚠️ BELUM diverifikasi respons asli. Gudang dibaca bila ada; tidak ada → ditolak di perluasan
// (lihat `expandSourceRowsInPayload`), bukan dikirim kosong.
export async function getDeliveryOrderByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesQuotationDetail> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/delivery-order/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: RawQuotation;
    try {
      raw = await parseAccurateEnvelope<RawQuotation>(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) throw new Error(`Pengiriman "${number}" tidak ditemukan di Accurate — cek kembali kolom "Delivery Order No".`);
      throw err;
    }
    return parseSalesQuotationDetail(raw, number, "Pengiriman");
  });
}
