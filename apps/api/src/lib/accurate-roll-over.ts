import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-roll-over.md (Fase 146) — save.do PER-GRUP (1 grup = 1 Roll Over). TIDAK ada lookup sebelum panggil ini: `jobOrderNumber`,
// `itemNo`, `accountNo`, `warehouseName` dikirim APA ADANYA, Accurate yang validasi eksistensi (mirror Inventory Adjustment/Job Costing).
export type RollOverSaveResult = {
  id: number;
  number: string;
};

export async function saveRollOver(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<RollOverSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/roll-over/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<RollOverSaveResult>(res);
  });
}
