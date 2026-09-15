import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-purchase-order.md — Purchase Order BUKAN transaksi
// akuntansi (tidak ada jurnal GL, sekadar "pesanan"/komitmen ke vendor),
// dan konsisten pola Purchase Payment/Sales Receipt: TIDAK ADA "Batal
// Import" (2 PO nominal sama bukan duplikat, bisa jadi 2 pesanan sah
// beda) — jadi cuma butuh `save.do`, TIDAK butuh `detail.do`/`delete.do`
// seperti Purchase Invoice.
export type PurchaseOrderSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<PurchaseOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseOrderSaveResult>(res);
  });
}
