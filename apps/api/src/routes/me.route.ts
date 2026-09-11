import { Elysia, t } from "elysia";
import { eq, and, count, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { roles, userRoles, importBatches, importBatchRows, settings } from "../db/schema";
import { getUserPermissionKeys, permissionPlugin } from "../lib/permission";
import { MANUAL_INPUT_SECONDS_SETTING_KEY, DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW } from "../lib/manual-input-estimate";
import { getOrCreateDefaultDataUsaha } from "../lib/data-usaha";

// § Medium finding security review Fase 01 — proxy.ts (apps/web) cuma cek
// keberadaan session cookie (existence-only, sesuai rekomendasi Better Auth
// buat proxy/middleware), BUKAN role. Endpoint ini yang dipanggil dari
// Server Component (`app/admin/layout.tsx`) untuk cek role SEBENARNYA
// sebelum render konten admin — lapisan kedua, bukan proxy.
export const meRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me",
    async ({ user }) => {
      const [userRoleRows, permissionKeys] = await Promise.all([
        db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(eq(userRoles.userId, user.id)),
        getUserPermissionKeys(user.id),
      ]);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: userRoleRows.map((r) => r.name),
        permissions: permissionKeys,
      };
    },
    { auth: true },
  )
  // § Fase 108, architecture-user-tambahan.md § Fase B1 — JEMBATAN
  // SEMENTARA sebelum UI "Pilih Data Usaha" (Fase 109) dibangun.
  // `subscriptions/checkout` & `/trial` SEKARANG WAJIB `dataUsahaId` di
  // body (kolom DB sudah NOT NULL sejak migrasi 0020) — frontend
  // `/subscribe` butuh SATU id untuk dikirim SEBELUM picker UI ada.
  // Reuse/buat "Data Usaha Utama" default milik user (pola sama
  // `admin/users.route.ts`/`admin/invoices.route.ts`) — user existing
  // (backfill) maupun baru SELALU cuma punya 1 Data Usaha implisit di
  // tahap ini, jadi aman dipakai langsung tanpa pilihan. Endpoint ini
  // TIDAK akan dibutuhkan lagi begitu Fase 109 (picker UI) kelar —
  // frontend akan kirim `dataUsahaId` hasil pilihan user, bukan default.
  .get(
    "/me/data-usaha/default",
    async ({ user }) => {
      const dataUsahaId = await getOrCreateDefaultDataUsaha(user.id);
      return { dataUsahaId };
    },
    { auth: true },
  )
  // § diminta user 2026-09-06 — "efisiensi waktu kerja" di dashboard
  // customer: total baris SUKSES milik user ini sendiri (GABUNGAN semua
  // modul yang pernah dia import, `import_batches.userId`, TIDAK dibatasi
  // subscription/module tertentu) dikali estimasi admin
  // (`data.manualInputSecondsPerRow`, § lib/manual-input-estimate.ts).
  // Baris `cancelled` (Batal Import) TIDAK dihitung — sama prinsipnya
  // dengan `admin/stats.route.ts`. Perhitungan waktu dilakukan DI SINI
  // (server), frontend cuma format tampilan — 1 sumber kebenaran logic.
  .get(
    "/me/stats",
    async ({ user }) => {
      const [rowCountRows, manualInputSetting] = await Promise.all([
        db
          .select({ successfulRowCount: count() })
          .from(importBatchRows)
          .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
          .where(and(eq(importBatches.userId, user.id), eq(importBatchRows.status, "success"))),
        db.select().from(settings).where(eq(settings.key, MANUAL_INPUT_SECONDS_SETTING_KEY)),
      ]);

      const successfulRowCount = rowCountRows[0]?.successfulRowCount ?? 0;
      const manualInputSecondsPerRow = Number(manualInputSetting[0]?.value ?? DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW);

      return {
        successfulRowCount,
        estimatedTimeSavedSeconds: successfulRowCount * manualInputSecondsPerRow,
      };
    },
    { auth: true },
  )
  // § diminta user 2026-09-06 — "Arsip Import" gabungan: SEMUA batch
  // import milik user ini, LINTAS SEMUA modul (`import_batches.userId`,
  // TIDAK filter `module` sama sekali) — dipakai card "Import Terakhir"
  // (dashboard, limit kecil) DAN halaman arsip penuh (paginated). TIDAK
  // dibatasi subscription AKTIF SEKARANG — riwayat batch lama dari modul
  // yang mungkin sudah tidak disubscribe lagi TETAP muncul (ini archive
  // milik user, bukan filter akses modul).
  .get(
    "/me/import-batches",
    async ({ user, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = eq(importBatches.userId, user.id);
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  );
