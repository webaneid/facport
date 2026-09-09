import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-purchase-payment.md — save.do PER-GRUP (§ Fase 50 — 1
// grup bisa berisi banyak faktur via `detailInvoice[]`, bukan cuma 1
// baris Excel), bukan bulk-save.do. TIDAK ada lookup vendor/faktur
// sebelum panggil ini (beda dari accurate-vendor.ts) — `vendorNo`/
// `invoiceNo` dikirim APA ADANYA sebagai string, Accurate yang validasi
// eksistensinya (menolak `s:false` kalau tidak ketemu, § architecture
// doc "Keputusan yang Perlu Dikonfirmasi" #2/#3).
export type PurchasePaymentSaveResult = {
  id: number;
  number: string;
};

export async function savePurchasePayment(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<PurchasePaymentSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-payment/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchasePaymentSaveResult>(res);
  });
}
