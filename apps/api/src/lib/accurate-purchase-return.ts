import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-purchase-return.md — dokumen LANJUTAN (retur terhadap
// transaksi yang sudah ada), TIDAK ADA "Batal Import" — cuma butuh
// `save.do`, TIDAK butuh `detail.do`/`delete.do`.
export type PurchaseReturnSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseReturn(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<PurchaseReturnSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-return/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseReturnSaveResult>(res);
  });
}
