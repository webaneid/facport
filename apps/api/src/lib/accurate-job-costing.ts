import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-job-costing.md — Job Costing panggil 2 endpoint
// BERURUTAN, TERPISAH (bukan bulk-save.do): `job-order/save.do` DULU
// (bikin shell Job Order), baru `material-adjustment/save.do` (realisasi
// RM, REFERENSI `jobOrderNumber` = `number` hasil panggilan pertama —
// endpoint KEDUA TIDAK ADA di `accurate-openapi.json` lokal, ditemukan
// via verifikasi portal developer live 2026-09-21). TIDAK ada lookup
// item/gudang sebelum panggil ini — `itemNo`/`warehouseName` dikirim
// APA ADANYA, Accurate yang validasi eksistensi.
export type JobOrderSaveResult = {
  id: number;
  number: string;
};

export type MaterialAdjustmentSaveResult = {
  id: number;
  number: string;
};

export async function saveJobOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<JobOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/job-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<JobOrderSaveResult>(res);
  });
}

export async function saveMaterialAdjustment(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<MaterialAdjustmentSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/material-adjustment/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<MaterialAdjustmentSaveResult>(res);
  });
}
