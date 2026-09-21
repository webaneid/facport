import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-inventory-adjustment.md — save.do PER-GRUP (bukan
// bulk-save.do, konsisten pola modul lain). TIDAK ada lookup item
// sebelum panggil ini — `itemNo`/`warehouseName` dikirim APA ADANYA,
// Accurate yang validasi eksistensi (mirror Item Transfer/Receive Item).
export type InventoryAdjustmentSaveResult = {
  id: number;
  number: string;
};

export async function saveInventoryAdjustment(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<InventoryAdjustmentSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/item-adjustment/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<InventoryAdjustmentSaveResult>(res);
  });
}
