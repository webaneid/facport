import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-material-slip.md (Fase 148) — save.do PER-DOKUMEN. TIDAK ada lookup: `itemNo`/`branchName`/`warehouseName`
// dikirim apa adanya, Accurate yang validasi eksistensi (mirror Roll Over/Job Costing — beda dari Finished Good Slip/Work
// Order yang butuh lookup cabang/gudang).
export type MaterialSlipSaveResult = {
  id: number;
  number: string;
};

export async function saveMaterialSlip(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<MaterialSlipSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/material-slip/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<MaterialSlipSaveResult>(res);
  });
}
