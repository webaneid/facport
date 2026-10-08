import { Elysia, t } from "elysia";
import { desc, eq, or, ilike, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { invoices, orders, plans, user as userTable, dataUsaha } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { attachInvoiceItems, attachSubscriptionDates } from "../../lib/invoice-helpers";
import { createInvoiceAndOrder, inFlightModuleKeys } from "../../lib/invoice-order";
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
      // § Fase 118 — nama Data Usaha per invoice (§ ADR-0033, "supaya
      // admin tahu customer A beli untuk Data Usaha mana"). Batch query 1x
      // (bukan N+1), `dataUsahaId` nullable di `orders` (order lama pra-
      // Fase 108) — invoice tanpa Data Usaha diketahui cukup tampil null,
      // TIDAK error.
      const dataUsahaIds = [...new Set(orderRows.map((o) => o.dataUsahaId).filter((id): id is string => !!id))];
      const dataUsahaRows = dataUsahaIds.length ? await db.select().from(dataUsaha).where(inArray(dataUsaha.id, dataUsahaIds)) : [];
      const dataUsahaNameById = new Map(dataUsahaRows.map((d) => [d.id, d.name]));
      const withItems = await attachInvoiceItems(rows);
      // § Fase 131 — tanggal AKTUAL mulai/berakhir per item (live join,
      // dialog "Detail Invoice" render RAW per-item, § halaman FE — TIDAK
      // lewat `groupIdenticalInvoiceItems`, itu cuma dipakai PDF). Batch
      // 1 query lintas SEMUA invoice di list ini, bukan N+1 per invoice —
      // flatten dulu, decorate, lalu kelompokkan balik per invoiceId.
      const flatItemsWithDates = await attachSubscriptionDates(withItems.flatMap((inv) => inv.items));
      const itemsByInvoiceId = new Map<string, typeof flatItemsWithDates>();
      for (const item of flatItemsWithDates) {
        const list = itemsByInvoiceId.get(item.invoiceId) ?? [];
        list.push(item);
        itemsByInvoiceId.set(item.invoiceId, list);
      }
      const withItemDates = withItems.map((inv) => ({ ...inv, items: itemsByInvoiceId.get(inv.id) ?? [] }));
      return {
        invoices: withItemDates.map((inv) => {
          const order = orderByInvoiceId.get(inv.id);
          const dataUsahaId = order?.dataUsahaId ?? null;
          return {
            ...inv,
            orderId: order?.id ?? null,
            orderStatus: order?.status ?? null,
            origin: order?.origin ?? null, // Fase 181 — "checkout" | "admin" | "renewal" (lencana "Tagihan perpanjangan")
            hasProof: !!order?.proofUrl,
            dataUsahaId,
            dataUsahaName: dataUsahaId ? (dataUsahaNameById.get(dataUsahaId) ?? null) : null,
          };
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
      // § Fase 178 — sama seperti checkout customer & mode "Kirim invoice": fitur yang masih punya pesanan belum selesai tidak boleh dibuatkan invoice lagi
      // (batalkan dulu invoice lamanya) — cegah dobel/perpanjangan ganda.
      try {
        return await db.transaction(async (tx) => {
          const inFlight = await inFlightModuleKeys(tx, { userId: targetUser.id, dataUsahaId });
          const blocked = planRows.map((p) => p.modules[0]).find((m): m is string => !!m && inFlight.has(m));
          if (blocked) throw new Error(`MODULE_ORDER_IN_PROGRESS:${blocked}`);
          return createInvoiceAndOrder(tx, { userId: targetUser.id, billToName: targetUser.name, planRows, dataUsahaId, origin: "admin" });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.startsWith("MODULE_ORDER_IN_PROGRESS:")) {
          set.status = 400;
          return { code: "MODULE_ORDER_IN_PROGRESS", moduleKey: message.split(":")[1] };
        }
        throw err;
      }
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
