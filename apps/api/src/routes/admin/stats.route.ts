import { Elysia } from "elysia";
import { eq, and, count, sum, gte, lt, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../lib/db";
import { user, plans, subscriptions, importBatches, importBatchRows, dataUsaha, roles, userRoles, settings } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { MANUAL_INPUT_SECONDS_SETTING_KEY, DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW } from "../../lib/manual-input-estimate";
import { last12Months, aggregateMonthlyGrowth, aggregateModulePopularity, computeGrowthPercent, computeEfficiency } from "../../lib/admin-stats";

// § Fase 59 — subquery role "customer" (siapa yang dianggap pengguna,
// BUKAN admin/staff), sama semangat `admin/users.route.ts`. JOIN langsung
// ke `roles` (bukan fetch role id dulu) — kalau role "customer" belum
// ke-seed, subquery ini otomatis 0 baris (JOIN kosong, valid buat `IN
// (subquery)`), TANPA perlu cek eksistensi manual/fallback id palsu.
function getCustomerIdsSubquery() {
  return db.select({ id: userRoles.userId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(roles.name, "customer"));
}

export const adminStatsRoute = new Elysia({ prefix: "/admin/stats" })
  .use(permissionPlugin)
  .get(
    "/",
    async () => {
      const customerIds = getCustomerIdsSubquery();
      // § diminta user 2026-09-06 — total baris Excel yang BERHASIL di-import
      // ke Accurate, GABUNGAN lintas SEMUA user & SEMUA modul. Cuma
      // `status = "success"` (BUKAN termasuk "cancelled" — baris yang sudah
      // dibatalkan/Batal Import TIDAK lagi dianggap "berhasil", § Fase 09 ADR-0013).
      //
      // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 — dulu `COUNT(import_batch_rows
      // WHERE status='success')` LIVE, ikut turun tiap job `PURGE_OLD_IMPORTS`
      // menghapus baris lewat masa retensi (default 2 hari). Sekarang SUM dari
      // `data_usaha.cumulativeSuccessfulRowCount` (counter PERMANEN, § komentar
      // kolom itu & `admin/stats.route.ts` endpoint `/efficiency` untuk detail
      // lengkap) — sama seperti `/efficiency`, TIDAK ikut terhapus purge.
      const [userRows, planRows, subRows, cumulativeRows] = await Promise.all([
        // § bug ditemukan 2026-09-08 (Fase 59) — SEBELUMNYA `count()` dari
        // `user` TANPA filter role, ikut hitung admin/staff. Sekarang HANYA
        // role "customer", sama subquery `admin/users.route.ts`.
        db.select({ userCount: count() }).from(user).where(inArray(user.id, customerIds)),
        db.select({ planCount: count() }).from(plans).where(eq(plans.isActive, true)),
        db.select({ activeSubscriptionCount: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
        db.select({ total: sum(dataUsaha.cumulativeSuccessfulRowCount) }).from(dataUsaha),
      ]);
      return {
        userCount: userRows[0]?.userCount ?? 0,
        planCount: planRows[0]?.planCount ?? 0,
        activeSubscriptionCount: subRows[0]?.activeSubscriptionCount ?? 0,
        successfulRowCount: Number(cumulativeRows[0]?.total ?? 0),
      };
    },
    { permission: "users.manage" },
  )
  // § Fase 59 — data chart "pertumbuhan user" (bar bulanan + area kumulatif,
  // dashboard admin). Formula agregasi murni ada di `lib/admin-stats.ts`
  // (`aggregateMonthlyGrowth`, unit-tested terpisah dari DB).
  .get(
    "/monthly",
    async () => {
      const now = new Date();
      const months = last12Months(now);
      const windowStart = months[0]!.start;

      const customerIds = getCustomerIdsSubquery();
      const [baselineUserRows, windowUserRows, windowSubRows] = await Promise.all([
        db
          .select({ baselineCount: count() })
          .from(user)
          .where(and(inArray(user.id, customerIds), lt(user.createdAt, windowStart))),
        db
          .select({ createdAt: user.createdAt })
          .from(user)
          .where(and(inArray(user.id, customerIds), gte(user.createdAt, windowStart))),
        db.select({ createdAt: subscriptions.createdAt, userId: subscriptions.userId }).from(subscriptions).where(gte(subscriptions.createdAt, windowStart)),
      ]);

      return aggregateMonthlyGrowth(
        months,
        baselineUserRows[0]?.baselineCount ?? 0,
        windowUserRows.map((r) => r.createdAt),
        windowSubRows,
      );
    },
    { permission: "users.manage" },
  )
  // § Fase 59 — popularitas per sub-modul (chart batang horizontal), biar
  // admin tahu modul mana yang paling laku. Snapshot SEKARANG (bukan time
  // series) — cuma subscription `active`. Label modul di-resolve FRONTEND
  // (`lib/module-options.ts`).
  .get(
    "/module-popularity",
    async () => {
      const rows = await db
        .select({ modules: plans.modules })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.status, "active"));
      return aggregateModulePopularity(rows);
    },
    { permission: "users.manage" },
  )
  // § Fase 59 — kartu efisiensi kerja: pertumbuhan baris bulan-ke-bulan,
  // persentase efisiensi waktu (dibanding estimasi input manual), dan total
  // detik dihemat ALL-TIME (poin 7.3 eksplisit "dari SELURUH row").
  //
  // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 — `totalEfficiencySeconds`
  // SEBELUM ini dihitung dari `COUNT(import_batch_rows WHERE
  // status='success')` TANPA batas tanggal ("ALL-TIME" cuma niatnya, bukan
  // hasilnya) — padahal job `PURGE_OLD_IMPORTS` menghapus baris itu lewat
  // masa retensi (default 2 hari, § lib/import-retention.ts), jadi angka
  // "all-time" SEBENARNYA cuma "sisa 2 hari terakhir". Sekarang dijumlah
  // dari `data_usaha.cumulativeSuccessfulRowCount` (counter PERMANEN, §
  // komentar kolom itu) — SUM lintas SEMUA Data Usaha, tidak pernah ikut
  // terhapus purge.
  // ⚠️ `rowsThisMonth`/`rowsLastMonth`/`rowGrowthPercent` (perbandingan
  // bulan-ke-bulan) dan `efficiencyPercent` (dari durasi batch asli) BELUM
  // dibenahi di sini — keduanya BUTUH data historis bertanggal (bukan cuma
  // 1 angka total), jadi TETAP rusak/tidak bermakna kalau retensi lebih
  // pendek dari 1 bulan (default 2 hari). Perbaikannya beda pendekatan
  // (snapshot periodik, bukan counter tunggal) — SENGAJA di luar scope
  // fase ini (keputusan user 2026-09-27), dicatat sebagai technical debt
  // terpisah di `docs/lessons-learned.md`.
  .get(
    "/efficiency",
    async () => {
      const now = new Date();
      const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

      const [manualSettingRows, thisMonthRows, lastMonthRows, cumulativeRows, finishedBatchRows] = await Promise.all([
        db.select().from(settings).where(eq(settings.key, MANUAL_INPUT_SECONDS_SETTING_KEY)),
        db
          .select({ rowCount: count() })
          .from(importBatchRows)
          .innerJoin(importBatches, eq(importBatches.id, importBatchRows.batchId))
          .where(and(eq(importBatchRows.status, "success"), gte(importBatches.createdAt, thisMonthStart))),
        db
          .select({ rowCount: count() })
          .from(importBatchRows)
          .innerJoin(importBatches, eq(importBatches.id, importBatchRows.batchId))
          .where(and(eq(importBatchRows.status, "success"), gte(importBatches.createdAt, lastMonthStart), lt(importBatches.createdAt, thisMonthStart))),
        db.select({ total: sum(dataUsaha.cumulativeSuccessfulRowCount) }).from(dataUsaha),
        // § batch gagal-dini (Fase 56) SENGAJA dikecualikan — durasinya ~0
        // detik (gagal SEBELUM loop per-baris), akan mendistorsi efisiensi
        // jadi keliatan sempurna padahal tidak ada baris yang diproses.
        db
          .select({ createdAt: importBatches.createdAt, completedAt: importBatches.completedAt, totalRows: importBatches.totalRows })
          .from(importBatches)
          .where(and(inArray(importBatches.status, ["completed", "completed_with_errors"]), isNotNull(importBatches.completedAt))),
      ]);

      const manualInputSecondsPerRow = Number(manualSettingRows[0]?.value ?? DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW);
      const rowsThisMonth = thisMonthRows[0]?.rowCount ?? 0;
      const rowsLastMonth = lastMonthRows[0]?.rowCount ?? 0;
      const totalSuccessfulRows = Number(cumulativeRows[0]?.total ?? 0);

      const { efficiencyPercent } = computeEfficiency(
        finishedBatchRows.filter((b): b is typeof b & { completedAt: Date } => b.completedAt !== null),
        manualInputSecondsPerRow,
      );

      return {
        rowsThisMonth,
        rowsLastMonth,
        rowGrowthPercent: computeGrowthPercent(rowsThisMonth, rowsLastMonth),
        efficiencyPercent,
        totalEfficiencySeconds: totalSuccessfulRows * manualInputSecondsPerRow,
      };
    },
    { permission: "users.manage" },
  );
