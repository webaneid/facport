import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-item-requisition.md, Fase 164 — save.do PER-GRUP (konsisten
// pola modul lain). TIDAK ada lookup item/gudang sebelum panggil ini —
// `itemNo`/`warehouseName` dikirim APA ADANYA, Accurate yang validasi
// eksistensi (mirror Item Transfer).
export type PurchaseRequisitionSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseRequisition(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<PurchaseRequisitionSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-requisition/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseRequisitionSaveResult>(res);
  });
}
