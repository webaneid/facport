import { Elysia, t } from "elysia";
import { eq, desc, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { importBatches, importBatchRows, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § diminta user 2026-09-05 — admin (Super Admin/Admin) bisa lihat
// riwayat & detail log import SEMUA user (bukan cuma milik sendiri),
// tujuannya: pas user telepon minta bantuan, admin bisa langsung lihat
// baris mana yang error & pesannya, tanpa perlu screen-share/tebak.
// READ-ONLY SENGAJA (tidak ada retry/edit di sini) — itu tetap aksi
// self-service milik user sendiri (§ `purchase-invoice-import.route.ts`
// dst), admin cuma boleh LIHAT, bukan bertindak atas nama user.
//
// SATU tabel `import_batches`/`import_batch_rows` dipakai SEMUA modul
// (dibedakan kolom `module`) — jadi 2 endpoint generik ini cukup untuk
// SEMUA modul (Faktur Pembelian/Faktur Penjualan/Akun Hutang Pemasok),
// TIDAK perlu endpoint terpisah per modul seperti versi customer (yang
// dipisah karena tiap modul customer punya endpoint retry/confirm
// sendiri — admin di sini TIDAK ADA aksi tulis sama sekali).
export const adminImportBatchesRoute = new Elysia({ prefix: "/admin" })
  .use(permissionPlugin)
  .get(
    "/users/:id/import-batches",
    async ({ params, query, set }) => {
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      const [targetUser] = await db.select().from(userTable).where(eq(userTable.id, params.id));
      if (!targetUser) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }

      // § disertakan di respons yang SAMA (bukan endpoint terpisah "GET
      // /admin/users/:id") — halaman detail user cukup 1 fetch.
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(importBatches)
          .where(eq(importBatches.userId, params.id))
          .orderBy(desc(importBatches.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(importBatches).where(eq(importBatches.userId, params.id)),
      ]);

      return {
        user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, disabled: targetUser.disabled, createdAt: targetUser.createdAt },
        batches: rows,
        total: totalRows[0]?.total ?? 0,
      };
    },
    {
      permission: "users.view",
      params: t.Object({ id: t.String() }),
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })), offset: t.Optional(t.Numeric({ minimum: 0 })) }),
    },
  )
  .get(
    "/import-batches/:batchId",
    async ({ params, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
      const summary = {
        pending: rows.filter((r) => r.status === "pending").length,
        success: rows.filter((r) => r.status === "success").length,
        failed: rows.filter((r) => r.status === "failed").length,
      };
      // § bentuk response SENGAJA SAMA PERSIS dengan `GET
      // /{modul}/import/:batchId` versi customer (§
      // `purchase-invoice-import.route.ts` dst) — 3 halaman admin (satu
      // per modul) reuse endpoint generik INI, cukup baca `batch.module`
      // buat tahu tampilan mana yang dirender, field lain identik.
      return { batch, summary, rows };
    },
    {
      // § TIDAK ada cek ownership/subscription (beda dari versi
      // customer) — admin boleh lihat batch MILIK USER MANA PUN, itu
      // memang tujuan fitur ini. `users.view` cukup (read-only).
      permission: "users.view",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  );
