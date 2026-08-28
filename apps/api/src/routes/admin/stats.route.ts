import { Elysia } from "elysia";
import { eq, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { user, plans, subscriptions } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 10 — angka ringkasan dashboard `/admin`. Cuma hitungan (bukan
// data mentah), tidak ada risiko bocor data sensitif — tetap digerbang
// permission (bukan `auth:true` generik) supaya cuma admin yang bisa akses.
export const adminStatsRoute = new Elysia({ prefix: "/admin/stats" }).use(permissionPlugin).get(
  "/",
  async () => {
    const [userRows, planRows, subRows] = await Promise.all([
      db.select({ userCount: count() }).from(user),
      db.select({ planCount: count() }).from(plans).where(eq(plans.isActive, true)),
      db.select({ activeSubscriptionCount: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
    ]);
    return {
      userCount: userRows[0]?.userCount ?? 0,
      planCount: planRows[0]?.planCount ?? 0,
      activeSubscriptionCount: subRows[0]?.activeSubscriptionCount ?? 0,
    };
  },
  { permission: "users.manage" },
);
