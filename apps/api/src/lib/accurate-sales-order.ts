import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-order.md — Sales Order BUKAN transaksi
// akuntansi (tidak ada jurnal GL, tidak ada perubahan stok, mirror
// Sales Quotation), TIDAK ADA "Batal Import" — cuma butuh `save.do`.
export type SalesOrderSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<SalesOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesOrderSaveResult>(res);
  });
}
