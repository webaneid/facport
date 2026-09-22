import { AccurateApiError, parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-work-order.md (Fase 147) — save.do PER-GRUP (1 grup = 1 Work Order) + 2 lookup pendukung yang WAJIB dipanggil worker
// SEBELUM save: cabang (`branchId` REQUIRED integer, beda dari modul lain) dan PIC (`personInChargeId`). `itemNo`/akun dikirim apa
// adanya, Accurate yang validasi eksistensi (mirror Roll Over/Job Costing).
export type WorkOrderSaveResult = {
  id: number;
  number: string;
};

export async function saveWorkOrder(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<WorkOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/work-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<WorkOrderSaveResult>(res);
  });
}

// `list.do` dengan `filter.keywords` (CONTAIN) + `fields=id,name` — pencocokan NAMA PERSIS (tanpa peduli huruf besar/kecil) dilakukan di
// sini supaya "Jakarta" tidak salah cocok ke "Jakarta Barat". § EXPORTED — dipakai ulang `accurate-finished-good-slip.ts` (Fase 149)
// untuk lookup gudang (`resource: "warehouse"`), HINDARI duplikasi logic pencocokan nama (§ architecture-finished-good-slip.md).
export async function findByExactName(
  ctx: AccurateSessionContext,
  resource: "branch" | "wo-pic" | "warehouse",
  name: string,
): Promise<{ id: number; name: string } | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({ "filter.keywords.val": name, fields: "id,name", "sp.pageSize": "100" });
    const res = await fetch(`${ctx.host}/accurate/api/${resource}/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; name: string }[]>(res);
    const wanted = name.trim().toLowerCase();
    return list.find((entry) => typeof entry.name === "string" && entry.name.trim().toLowerCase() === wanted);
  });
}

/**
 * Cabang → `branchId`. TIDAK auto-create (cabang = data struktural perusahaan, bukan entitas transaksional; typo di Excel tidak boleh
 * diam-diam melahirkan cabang baru) — tidak ketemu = galat jelas.
 */
export async function resolveBranchId(ctx: AccurateSessionContext, branchName: string): Promise<number> {
  const branch = await findByExactName(ctx, "branch", branchName);
  if (!branch) {
    throw new Error(`Cabang "${branchName}" tidak ditemukan di Accurate — cek ejaan, atau buat cabang itu dulu di Accurate.`);
  }
  return branch.id;
}

/**
 * PIC (Person In Charge) → `personInChargeId`. Find-or-create by nama (`wo-pic/save.do` cukup `name`). Bila 2 impor bersamaan sama-sama
 * membuat, save kedua ditolak "sudah ada" → cari ulang, jangan gagalkan Work Order.
 */
export async function findOrCreateWoPic(ctx: AccurateSessionContext, name: string): Promise<number> {
  const existing = await findByExactName(ctx, "wo-pic", name);
  if (existing) return existing.id;
  try {
    const created = await withAccurateRateLimit(async () => {
      const res = await fetch(`${ctx.host}/accurate/api/wo-pic/save.do`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          "X-Session-ID": ctx.session,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      return parseAccurateSaveEnvelope<{ id: number }>(res);
    });
    return created.id;
  } catch (err) {
    if (err instanceof AccurateApiError && /sudah ada data lain/i.test(err.message)) {
      const again = await findByExactName(ctx, "wo-pic", name);
      if (again) return again.id;
    }
    throw err;
  }
}
