import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { plans } from "../db/schema";
import { MODULE_CATALOG } from "../lib/module-catalog";

// § diminta user 2026-09-27 — endpoint ini SEBELUMNYA tidak punya ORDER BY
// sama sekali, urutan balikannya kebetulan urutan insert row di DB
// (riwayat pembuatan plan lintas fase — TIDAK match urutan bisnis yang
// diinginkan klien sekarang). `useGroupedPlans` (apps/web/lib/use-grouped-plans.ts)
// yang dipakai `/subscribe` DAN landing (`module-features.tsx`) membentuk
// urutan tampil dari urutan MUNCUL PERTAMA tiap moduleKey di array `plans`
// balikan endpoint ini — jadi cukup sort SEKALI di sini, kedua konsumen
// otomatis ikut benar, tanpa ubah logic gating/harga apa pun.
// Sort di JS (bukan `ORDER BY` SQL) — index lookup dari array TypeScript
// `MODULE_CATALOG` (SATU sumber kebenaran urutan, sama yang dipakai
// sidebar & dropdown admin plan), dataset kecil (puluhan plan aktif),
// tidak perlu `CASE WHEN` SQL untuk ini.
const MODULE_ORDER_INDEX = new Map<string, number>(MODULE_CATALOG.map((m, i) => [m.key, i]));

function moduleOrderIndex(moduleKey: string | undefined): number {
  return moduleKey !== undefined && MODULE_ORDER_INDEX.has(moduleKey) ? MODULE_ORDER_INDEX.get(moduleKey)! : Infinity;
}

// Publik — dipakai landing page buat tampilkan daftar harga (§ architecture-subscription.md)
// § architecture-api.md — return payload BARE (bukan {data,error} manual),
// Eden Treaty SENDIRI yang jadi wrapper {data,error} di sisi client
// berdasarkan HTTP status. Lihat catatan "double-wrap" di
// docs/decisions/adr-0010-response-format-eden.md.
export const plansRoute = new Elysia({ prefix: "/plans" }).get("/", async () => {
  const rows = await db.select().from(plans).where(eq(plans.isActive, true));
  return rows.sort((a, b) => moduleOrderIndex(a.modules[0]) - moduleOrderIndex(b.modules[0]));
});
