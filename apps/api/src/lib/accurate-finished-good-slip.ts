import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { findByExactName, resolveBranchId } from "./accurate-work-order";

// § architecture-finished-good-slip.md (Fase 149) — save.do PER-DOKUMEN, setelah resolve `branchId` DAN `detailItem[].warehouseId`
// (KEDUANYA REQUIRED integer, dikonfirmasi live portal developer 2026-09-22 — beda dari Material Slip yang tidak perlu keduanya).
// `resolveBranchId` REUSE dari `accurate-work-order.ts`; `resolveWarehouseId` di sini generalisasi `findByExactName` yang sama
// (resource "warehouse") — HINDARI duplikasi logic pencocokan nama. `itemNo` dikirim apa adanya, TIDAK auto-create.
export { resolveBranchId };

export type FinishedGoodSlipSaveResult = {
  id: number;
  number: string;
};

/**
 * Gudang → `warehouseId`. TIDAK auto-create (gudang = data struktural perusahaan, mirror alasan cabang tidak auto-create)
 * — tidak ketemu = galat jelas.
 */
export async function resolveWarehouseId(ctx: AccurateSessionContext, warehouseName: string): Promise<number> {
  const warehouse = await findByExactName(ctx, "warehouse", warehouseName);
  if (!warehouse) {
    throw new Error(`Gudang "${warehouseName}" tidak ditemukan di Accurate — cek ejaan, atau buat gudang itu dulu di Accurate.`);
  }
  return warehouse.id;
}

export async function saveFinishedGoodSlip(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<FinishedGoodSlipSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/finished-good-slip/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<FinishedGoodSlipSaveResult>(res);
  });
}
