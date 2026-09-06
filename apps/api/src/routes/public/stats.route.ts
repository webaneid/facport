import { Elysia } from "elysia";
import { eq, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { roles, userRoles, importBatchRows, settings } from "../../db/schema";
import { MANUAL_INPUT_SECONDS_SETTING_KEY, DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW } from "../../lib/manual-input-estimate";

// § Fase 47 — "funfact" landing page, TANPA auth (prefix `/public`,
// otomatis kena `rateLimitPlugin({pathPrefix:"/public"...})` yang sudah
// dipasang di app.ts). Cuma balikin AGREGAT (3 angka), TIDAK ada
// PII/data mentah — aman diekspos publik, pola sama `GET /settings/public`.
export const publicStatsRoute = new Elysia({ prefix: "/public/stats" }).get("/", async () => {
  // § "jumlah user" landing page WAJIB scoped ke role "customer" — jujur
  // representasikan "berapa BISNIS yang pakai Facport", BUKAN ikut
  // hitung staf internal (admin/staff), beda dari `admin/stats.route.ts`
  // `userCount` yang hitung SEMUA row tabel user.
  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  const [customerCountRows, successfulRowsRows, manualInputSetting] = await Promise.all([
    customerRole
      ? db.select({ customerCount: count() }).from(userRoles).where(eq(userRoles.roleId, customerRole.id))
      : Promise.resolve([{ customerCount: 0 }]),
    db.select({ successfulRowCount: count() }).from(importBatchRows).where(eq(importBatchRows.status, "success")),
    db.select().from(settings).where(eq(settings.key, MANUAL_INPUT_SECONDS_SETTING_KEY)),
  ]);

  const customerCount = customerCountRows[0]?.customerCount ?? 0;
  const successfulRowCount = successfulRowsRows[0]?.successfulRowCount ?? 0;
  const manualInputSecondsPerRow = Number(manualInputSetting[0]?.value ?? DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW);

  return {
    customerCount,
    successfulRowCount,
    estimatedTimeSavedSeconds: successfulRowCount * manualInputSecondsPerRow,
  };
});
