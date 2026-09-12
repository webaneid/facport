import { Elysia, t } from "elysia";
import { desc, eq, or, ilike, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { invoices, orders, plans, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { attachInvoiceItems } from "../../lib/invoice-helpers";
import { createInvoiceAndOrder } from "../../lib/invoice-order";
import { getOrCreateDefaultDataUsaha, ownsDataUsaha } from "../../lib/data-usaha";

// § architecture-invoice.md § API — SEMUA invoice lintas user, admin-only
// (permission "invoices.view"). Dipisah dari `invoices.route.ts` (customer,
// filter userId sendiri) mengikuti konvensi 1-file-per-resource, prefix
// admin (§ apps/api/CLAUDE.md struktur folder).
export const adminInvoicesRoute = new Elysia({ prefix: "/admin/invoices" })
  .use(permissionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const search = query.search?.trim();
      // § Fase 105 (2026-09-11) — search nomor invoice ATAU nama
      // penagihan (`billToName`, snapshot — § architecture-invoice.md
      // "Kenapa Semua Field Snapshot"), bukan nama user LIVE (invoice
      // lama tetap match nama saat invoice dibuat, bukan nama user
      // sekarang kalau sudah ganti nama).
      const searchCondition = search ? or(ilike(invoices.invoiceNumber, `%${search}%`), ilike(invoices.billToName, `%${search}%`)) : undefined;
      const rows = await db.select().from(invoices).where(searchCondition).orderBy(desc(invoices.createdAt));
      const invoiceIds = rows.map((r) => r.id);
      // § Fase 27, ADR-0025 — `orderId` dipakai FE untuk tombol "Salin
      // Link" (link publik `{APP_URL}/pay/{orderId}`), pola JOIN yang
      // sama seperti `GET /me/invoices` (`invoices.route.ts`).
      // § Fase 94 (2026-09-10) — `orderStatus`/`hasProof` BARU ditambah:
      // `invoices.status` cuma "unpaid"/"paid"/"void"/"expired" (kasar),
      // TIDAK bedakan "belum ada order sama sekali" vs "sudah upload
      // bukti, menunggu verifikasi" vs "ditolak admin" — nuansa itu ada
      // di `orders.status`. Halaman admin (dialog "Detail Invoice") butuh
      // status SEGRANULAR yang dilihat customer di alur bayar mereka
      // sendiri (§ `order-pay-flow.tsx`), bukan cuma status invoice kasar.
      const orderRows = invoiceIds.length ? await db.select().from(orders).where(inArray(orders.invoiceId, invoiceIds)) : [];
      const orderByInvoiceId = new Map(orderRows.map((o) => [o.invoiceId, o]));
      const withItems = await attachInvoiceItems(rows);
      return {
        invoices: withItems.map((inv) => {
          const order = orderByInvoiceId.get(inv.id);
          return { ...inv, orderId: order?.id ?? null, orderStatus: order?.status ?? null, hasProof: !!order?.proofUrl };
        }),
      };
    },
    { permission: "invoices.view", query: t.Object({ search: t.Optional(t.String()) }) },
  )
  // § Fase 27, ADR-0025 — admin bikin invoice BARU untuk user EXISTING
  // (beda dari Fase 18 "Kirim Invoice" yang cuma terjadi BERSAMAAN
  // pembuatan user baru). Reuse `createInvoiceAndOrder()` (Fase 18) apa
  // adanya — sudah dukung multi-plan. Permission TERPISAH dari
  // "invoices.view" (baca) — ini operasi TULIS (bikin invoice+order
  // baru, konsekuensi finansial), konsisten pola
  // "orders.manage"/"subscriptions.manage" yang sudah ada.
  .post(
    "/",
    async ({ body, set }) => {
      const [targetUser] = await db.select().from(userTable).where(eq(userTable.id, body.userId));
      if (!targetUser) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }

      const planIds = [...new Set(body.planIds)];
      const planRows = await db.select().from(plans).where(inArray(plans.id, planIds));
      if (planRows.length !== planIds.length) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      if (planRows.some((p) => !p.isActive)) {
        set.status = 400;
        return { code: "PLAN_NOT_ACTIVE" };
      }

      // § diminta user 2026-09-12 — gap ditemukan saat re-audit alur
      // admin: endpoint ini SEBELUMNYA selalu `getOrCreateDefaultDataUsaha`
      // tanpa peduli `body.dataUsahaId` sama sekali (komentar lama bilang
      // "menyusul Fase 109/110" tapi tidak pernah benar-benar dikerjakan
      // sampai fase itu selesai) — customer dengan BANYAK Data Usaha
      // (kasus normal sejak Fase 107) selalu kena invoice nyasar ke "Data
      // Usaha Utama" walau admin sebenarnya mau bikin invoice utk Data
      // Usaha lain. Sekarang terima `dataUsahaId` OPSIONAL, WAJIB
      // divalidasi benar milik `targetUser` (pola SAMA
      // `admin/subscriptions.route.ts` — kalau tidak, admin bisa
      // (sengaja/keliru) tempel invoice user A ke data_usaha milik user
      // B), fallback ke default kalau tidak dikirim (backward compatible
      // utk caller lama).
      if (body.dataUsahaId && !(await ownsDataUsaha(targetUser.id, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const dataUsahaId = body.dataUsahaId ?? (await getOrCreateDefaultDataUsaha(targetUser.id));
      const result = await db.transaction((tx) =>
        createInvoiceAndOrder(tx, { userId: targetUser.id, billToName: targetUser.name, planRows, dataUsahaId }),
      );

      return result;
    },
    {
      permission: "invoices.manage",
      body: t.Object({
        userId: t.String({ minLength: 1 }),
        planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
        dataUsahaId: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  );
