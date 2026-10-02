import { matchItemUnit, extractItemUnits, type ItemUnit } from "./accurate-item-units";
import { parseAccurateEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import { resolveConnectionForDataUsaha } from "./accurate-connection";
import { openAccurateSession, type AccurateSessionContext } from "./accurate-session";
import { logger } from "./logger";

// § evaluasi client 2026-10-03 — Formula dulu bisa disimpan dengan satuan yang TIDAK ADA di master
// barang Accurate (mis. "pcs" untuk barang yang satuannya KG); errornya baru muncul saat Input
// Produksi ("satuan barang pcs tidak ditemukan"). Sekarang satuan tiap barang (Barang Jadi + Bahan
// Baku) dicocokkan ke master Accurate SAAT Formula disimpan.
//
// § FAIL-OPEN: pengecekan hanya bisa MENOLAK kalau daftar satuan barang berhasil dibaca LENGKAP.
// Tidak terkoneksi/sesi gagal/timeout/barang tidak ketemu/field satuan tambahan tidak dikenali →
// Formula tetap disimpan seperti sebelumnya (masalah apa pun tetap tertangkap saat Input Produksi).
// Alasan: nama field baca `unit2..5` belum diverifikasi test call nyata (§ accurate-item-units.ts),
// jangan sampai satuan ke-2 yang sah ikut tertolak. Saklar darurat: env AUTOPRODUKSI_UNIT_VALIDATION=off.
export type UnitTarget = { itemNo: string; unitName: string };
export type UnitCheckResult =
  | { ok: true; canonical: Record<string, string> } // kunci `${itemNo}\u0000${unitName}` → ejaan master
  | { ok: false; itemNo: string; unitName: string; available: string[] };

export type ItemUnitsLookup = { units: ItemUnit[]; complete: boolean } | null;
export type ItemUnitsFetcher = (itemNo: string) => Promise<ItemUnitsLookup>;

export const unitTargetKey = (t: UnitTarget) => `${t.itemNo}\u0000${t.unitName}`;

const FIELDS_FULL = "id,no,name,unit1,unit2,unit3,unit4,unit5,ratio2,ratio3,ratio4,ratio5";

async function fetchItemRecord(ctx: AccurateSessionContext, itemNo: string, fields: string): Promise<Record<string, unknown> | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({ "filter.no.val": itemNo, fields });
    const res = await fetch(`${ctx.host}/accurate/api/item/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
      signal: AbortSignal.timeout(8000),
    });
    const list = await parseAccurateEnvelope<Record<string, unknown>[]>(res);
    return list[0];
  });
}

export function buildFetcher(ctx: AccurateSessionContext): ItemUnitsFetcher {
  return async (itemNo) => {
    let record: Record<string, unknown> | undefined;
    try {
      record = await fetchItemRecord(ctx, itemNo, FIELDS_FULL);
    } catch {
      // Permintaan diperluas ditolak Accurate → ulangi dengan field dasar; hasilnya TIDAK lengkap (tidak boleh menolak).
      record = await fetchItemRecord(ctx, itemNo, "id,no,name,unit1");
      return record ? { units: extractItemUnits(record), complete: false } : null;
    }
    if (!record) return null;
    // Lengkap hanya kalau Accurate mengembalikan kunci satuan 2 (null = memang tidak ada) — kunci
    // tidak ada sama sekali berarti field diabaikan, jadi daftar satuan tambahan tidak bisa dipercaya.
    const complete = "unit2" in record || "unit2Name" in record;
    return { units: extractItemUnits(record), complete };
  };
}

export async function checkUnitsAgainstItems(targets: UnitTarget[], fetchUnits: ItemUnitsFetcher): Promise<UnitCheckResult> {
  const canonical: Record<string, string> = {};
  const cache = new Map<string, ItemUnitsLookup>();
  for (const target of targets) {
    let lookup = cache.get(target.itemNo);
    if (lookup === undefined) {
      try {
        lookup = await fetchUnits(target.itemNo);
      } catch (err) {
        logger.warn({ err, itemNo: target.itemNo }, "Cek satuan barang ke Accurate gagal, dilewati (fail-open)");
        lookup = null;
      }
      cache.set(target.itemNo, lookup);
    }
    if (!lookup || lookup.units.length === 0) continue;
    const match = matchItemUnit(lookup.units, target.unitName);
    if (match.status === "ok") canonical[unitTargetKey(target)] = match.canonical;
    else if (lookup.complete) return { ok: false, itemNo: target.itemNo, unitName: target.unitName, available: match.available };
  }
  return { ok: true, canonical };
}

// Titik masuk untuk route: buka sesi Data Usaha lalu cek. Apa pun yang menghalangi pengecekan → lolos (fail-open).
export async function checkFormulaUnits(dataUsahaId: string, targets: UnitTarget[]): Promise<UnitCheckResult> {
  if (process.env.AUTOPRODUKSI_UNIT_VALIDATION === "off" || targets.length === 0) return { ok: true, canonical: {} };
  try {
    const resolved = await resolveConnectionForDataUsaha(dataUsahaId);
    if (!resolved?.connection || !resolved.accurateDbId) return { ok: true, canonical: {} };
    const session = await openAccurateSession(resolved.connection, resolved.accurateDbId);
    return await checkUnitsAgainstItems(targets, buildFetcher(session));
  } catch (err) {
    logger.warn({ err, dataUsahaId }, "Cek satuan Formula dilewati — tidak bisa membuka sesi Accurate (fail-open)");
    return { ok: true, canonical: {} };
  }
}
