import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-receive-item.md — dokumen bukti FISIK barang diterima,
// bukan transaksi akuntansi tersendiri (mirror pola Purchase Order/
// Purchase Payment): TIDAK ADA "Batal Import" — jadi cuma butuh
// `save.do`, TIDAK butuh `detail.do`/`delete.do`.
export type ReceiveItemSaveResult = {
  id: number;
  number: string;
};

export async function saveReceiveItem(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<ReceiveItemSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/receive-item/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<ReceiveItemSaveResult>(res);
  });
}
