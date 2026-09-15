import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-quotation.md — Sales Quotation BUKAN transaksi
// akuntansi (tidak ada jurnal GL, tidak ada perubahan stok, sekadar
// "proposal/penawaran"), TIDAK ADA "Batal Import" — cuma butuh
// `save.do`, TIDAK butuh `detail.do`/`delete.do`.
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
