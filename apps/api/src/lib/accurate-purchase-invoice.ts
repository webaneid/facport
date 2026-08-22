import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-accurate-integration.md § 3 — Purchase Invoice VERIFIED.
// Pakai save.do PER-BARIS (bukan bulk-save.do) — lihat phase-02 doc
// "Keputusan Kecil" untuk alasannya (response schema bulk-save.do tidak
// terverifikasi Accurate).
// Record hasil save.do (field `r`) punya PULUHAN field turunan Accurate —
// cuma ambil yang dipakai (`id`, `number`), sisanya diabaikan.
export type PurchaseInvoiceSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseInvoice(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<PurchaseInvoiceSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-invoice/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseInvoiceSaveResult>(res);
  });
}
