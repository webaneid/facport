import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

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
