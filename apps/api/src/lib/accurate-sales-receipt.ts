import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-receipt.md — bayangan cermin PERSIS
// accurate-purchase-payment.ts (customerNo ganti vendorNo). save.do
// PER-BARIS (bukan bulk-save.do), TIDAK ada lookup customer/faktur
// sebelum panggil ini — `customerNo`/`invoiceNo` dikirim APA ADANYA
// sebagai string, Accurate yang validasi eksistensinya.
export type SalesReceiptSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesReceipt(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<SalesReceiptSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-receipt/save.do`, {
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
