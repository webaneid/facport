import { Elysia } from "elysia";
import { eq, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { user, plans, subscriptions, importBatchRows } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 10 — angka ringkasan dashboard `/admin`. Cuma hitungan (bukan
// data mentah), tidak ada risiko bocor data sensitif — tetap digerbang
// permission (bukan `auth:true` generik) supaya cuma admin yang bisa akses.
export const adminStatsRoute = new Elysia({ prefix: "/admin/stats" }).use(permissionPlugin).get(
  "/",
  async () => {
    // § diminta user 2026-09-06 — total baris Excel yang BERHASIL di-import
    // ke Accurate, GABUNGAN lintas SEMUA user & SEMUA 6 modul (`import_batch_rows`
    // generik, tidak filter `module` — § architecture-accurate-integration.md § 2).
    // Cuma `status = "success"` (BUKAN termasuk "cancelled" — baris yang sudah
    // dibatalkan/Batal Import TIDAK lagi dianggap "berhasil", § Fase 09 ADR-0013).
    const [userRows, planRows, subRows, successfulRowsRows] = await Promise.all([
      db.select({ userCount: count() }).from(user),
      db.select({ planCount: count() }).from(plans).where(eq(plans.isActive, true)),
      db.select({ activeSubscriptionCount: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
      db.select({ successfulRowCount: count() }).from(importBatchRows).where(eq(importBatchRows.status, "success")),
    ]);
    return {
      userCount: userRows[0]?.userCount ?? 0,
      planCount: planRows[0]?.planCount ?? 0,
      activeSubscriptionCount: subRows[0]?.activeSubscriptionCount ?? 0,
      successfulRowCount: successfulRowsRows[0]?.successfulRowCount ?? 0,
    };
  },
  { permission: "users.manage" },
);
