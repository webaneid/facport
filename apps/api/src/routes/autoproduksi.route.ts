import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries, autoproduksiIntermediaryAccounts } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { boss, JOBS, startQueue } from "../lib/queue";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Produk
// AutoProduksi. BEDA dari 23 modul Facport/Konverter lain (SEMUA
// Excel-upload): ini form-based langsung — user isi Formula/Bahan Baku
// lewat form web, BUKAN upload file. `itemNo`/`adjustmentAccountNo`/
// `branchName`/`warehouseName` disimpan APA ADANYA (TIDAK di-lookup ke
// Accurate saat simpan formula) — konsisten filosofi SEMUA modul lain
// ("Accurate validasi eksistensi saat SAVE beneran", bukan saat setup).
//
// Guard `moduleAccess: "autoproduksi_production"` PERSIS pola 23 modul
// lain — resolve `subscription` (sudah scoped ke Data Usaha yang benar
// lewat header X-Data-Usaha-Id, § subscription-gate.ts), dipakai buat
// filter SEMUA query (formula/entry cuma boleh diakses dalam subscription
// yang sama).
// § security review Fase 159 — maxLength SEMUA field string WAJIB cocok
// persis batas kolom `autoproduksi.schema.ts` (bukan cuma minLength) —
// input lebih panjang dari kolom `varchar` bakal jatuh ke error Postgres
// mentah ("value too long for type character varying(N)", 500 tak
// terduga) kalau tidak ditolak DULU di schema Elysia (§ architecture-
// security.md "validasi skema Elysia sebelum masuk service layer").
// § Fase 163, ADR-0039 — `*Name` (BARU, opsional) adalah snapshot nama
// hasil live-search Accurate saat user PILIH lewat Combobox (§
// autoproduksi.schema.ts komentar atas). `maxLength: 255` cocok kolom
// `varchar(255)` yang sama dipakai `name` (Nama Formula).
// § Fase 168 (diminta client) — Gudang Bahan Baku/Nomor Project/Departemen
// per-item DIHAPUS dari sini (pindah ke body
// `POST /autoproduksi/production-entries`, § di bawah — konteks per
// produksi, bukan bagian resep).
const formulaItemSchema = t.Object({
  itemNo: t.String({ minLength: 1, maxLength: 100 }),
  itemUnitName: t.String({ minLength: 1, maxLength: 50 }),
  itemName: t.Optional(t.String({ maxLength: 255 })),
  quantity: t.Number({ exclusiveMinimum: 0 }),
});

// § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Nomor Project/
// Departemen DIHAPUS dari Formula total (pindah ke Input Produksi, lihat
// komentar `formulaItemSchema` di atas). `isActive` BARU — toggle List
// Formula, default `true` kalau tidak dikirim (Formula baru selalu aktif).
const formulaBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  finishedGoodItemNo: t.String({ minLength: 1, maxLength: 100 }),
  finishedGoodItemUnitName: t.String({ minLength: 1, maxLength: 50 }),
  finishedGoodItemName: t.Optional(t.String({ maxLength: 255 })),
  standardCost: t.Optional(t.Number({ minimum: 0 })),
  adjustmentAccountNo: t.String({ minLength: 1, maxLength: 50 }),
  adjustmentAccountName: t.Optional(t.String({ maxLength: 255 })),
  isActive: t.Optional(t.Boolean()),
  items: t.Array(formulaItemSchema, { minItems: 1 }),
});

async function loadFormulaWithItems(formulaId: string, subscriptionId: string) {
  const [formula] = await db
    .select()
    .from(autoproduksiFormulas)
    .where(and(eq(autoproduksiFormulas.id, formulaId), eq(autoproduksiFormulas.subscriptionId, subscriptionId)));
  if (!formula) return null;
  const items = await db
    .select()
    .from(autoproduksiFormulaItems)
    .where(eq(autoproduksiFormulaItems.formulaId, formulaId))
    .orderBy(autoproduksiFormulaItems.sortOrder);
  return { formula, items };
}

export const autoproduksiRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/autoproduksi/formulas",
    async ({ subscription }) => {
      const formulas = await db
        .select()
        .from(autoproduksiFormulas)
        .where(eq(autoproduksiFormulas.subscriptionId, subscription.id))
        .orderBy(desc(autoproduksiFormulas.createdAt));
      return { formulas };
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production" },
  )
  .get(
    "/autoproduksi/formulas/:id",
    async ({ params, subscription, set }) => {
      const result = await loadFormulaWithItems(params.id, subscription.id);
      if (!result) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
      }
      return result;
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/autoproduksi/formulas",
    async ({ body, user, subscription }) => {
      const formula = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(autoproduksiFormulas)
          .values({
            userId: user.id,
            dataUsahaId: subscription.dataUsahaId,
            subscriptionId: subscription.id,
            name: body.name,
            finishedGoodItemNo: body.finishedGoodItemNo,
            finishedGoodItemUnitName: body.finishedGoodItemUnitName,
            finishedGoodItemName: body.finishedGoodItemName ?? null,
            standardCost: body.standardCost !== undefined ? String(body.standardCost) : null,
            adjustmentAccountNo: body.adjustmentAccountNo,
            adjustmentAccountName: body.adjustmentAccountName ?? null,
            isActive: body.isActive ?? true,
          })
          .returning();
        await tx.insert(autoproduksiFormulaItems).values(
          body.items.map((item, index) => ({
            formulaId: inserted!.id,
            itemNo: item.itemNo,
            itemUnitName: item.itemUnitName,
            itemName: item.itemName ?? null,
            quantity: String(item.quantity),
            sortOrder: index,
          })),
        );
        return inserted!;
      });
      return { formula };
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production", body: formulaBodySchema },
  )
  .put(
    "/autoproduksi/formulas/:id",
    async ({ params, body, subscription, set }) => {
      const existing = await loadFormulaWithItems(params.id, subscription.id);
      if (!existing) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
      }
      await db.transaction(async (tx) => {
        await tx
          .update(autoproduksiFormulas)
          .set({
            name: body.name,
            finishedGoodItemNo: body.finishedGoodItemNo,
            finishedGoodItemUnitName: body.finishedGoodItemUnitName,
            finishedGoodItemName: body.finishedGoodItemName ?? null,
            standardCost: body.standardCost !== undefined ? String(body.standardCost) : null,
            adjustmentAccountNo: body.adjustmentAccountNo,
            adjustmentAccountName: body.adjustmentAccountName ?? null,
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            updatedAt: new Date(),
          })
          .where(eq(autoproduksiFormulas.id, params.id));
        // § Ganti-total item per update (bukan diff) — jumlah baris kecil
        // (bahan baku per resep), lebih sederhana & aman dari edge-case
        // reorder dibanding diff manual.
        await tx.delete(autoproduksiFormulaItems).where(eq(autoproduksiFormulaItems.formulaId, params.id));
        await tx.insert(autoproduksiFormulaItems).values(
          body.items.map((item, index) => ({
            formulaId: params.id,
            itemNo: item.itemNo,
            itemUnitName: item.itemUnitName,
            itemName: item.itemName ?? null,
            quantity: String(item.quantity),
            sortOrder: index,
          })),
        );
      });
      return { ok: true };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: formulaBodySchema,
    },
  )
  // § Fase 168 (diminta client) — toggle Aktif/Non-aktif List Formula.
  // Endpoint TERPISAH dari PUT (yang butuh body penuh Formula+items) —
  // ubah 1 kolom tanpa perlu kirim ulang seluruh resep.
  .patch(
    "/autoproduksi/formulas/:id/active",
    async ({ params, body, subscription, set }) => {
      const existing = await loadFormulaWithItems(params.id, subscription.id);
      if (!existing) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
      }
      const [formula] = await db
        .update(autoproduksiFormulas)
        .set({ isActive: body.isActive, updatedAt: new Date() })
        .where(eq(autoproduksiFormulas.id, params.id))
        .returning();
      return { formula };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ isActive: t.Boolean() }),
    },
  )
  .delete(
    "/autoproduksi/formulas/:id",
    async ({ params, subscription, set }) => {
      const existing = await loadFormulaWithItems(params.id, subscription.id);
      if (!existing) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
      }
      // § FK formulaId -> onDelete: "cascade" (§ autoproduksi.schema.ts) — item ikut terhapus otomatis.
      await db.delete(autoproduksiFormulas).where(eq(autoproduksiFormulas.id, params.id));
      return { ok: true };
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .get(
    "/autoproduksi/production-entries",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      const entries = await db
        .select({
          id: autoproduksiProductionEntries.id,
          formulaId: autoproduksiProductionEntries.formulaId,
          formulaName: autoproduksiFormulas.name,
          producedQty: autoproduksiProductionEntries.producedQty,
          transDate: autoproduksiProductionEntries.transDate,
          status: autoproduksiProductionEntries.status,
          accurateTransactionId: autoproduksiProductionEntries.accurateTransactionId,
          errorMessage: autoproduksiProductionEntries.errorMessage,
          createdAt: autoproduksiProductionEntries.createdAt,
        })
        .from(autoproduksiProductionEntries)
        .innerJoin(autoproduksiFormulas, eq(autoproduksiFormulas.id, autoproduksiProductionEntries.formulaId))
        .where(eq(autoproduksiProductionEntries.subscriptionId, subscription.id))
        .orderBy(desc(autoproduksiProductionEntries.createdAt))
        .limit(limit)
        .offset(offset);
      return { entries };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      query: t.Object({ limit: t.Optional(t.Numeric()), offset: t.Optional(t.Numeric()) }),
    },
  )
  .post(
    "/autoproduksi/production-entries",
    async ({ body, user, subscription, set }) => {
      const resolved = await loadFormulaWithItems(body.formulaId, subscription.id);
      if (!resolved) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
      }
      // § Fase 168 — defense-in-depth: Combobox frontend sudah menyaring
      // Formula non-aktif, API tidak boleh percaya itu saja (bisa dipanggil
      // langsung/state Combobox basi).
      if (!resolved.formula.isActive) {
        set.status = 409;
        return { code: "FORMULA_INACTIVE" };
      }
      const [entry] = await db
        .insert(autoproduksiProductionEntries)
        .values({
          userId: user.id,
          dataUsahaId: subscription.dataUsahaId,
          subscriptionId: subscription.id,
          formulaId: body.formulaId,
          producedQty: String(body.producedQty),
          transDate: body.transDate,
          branchName: body.branchName ?? null,
          warehouseName: body.warehouseName ?? null,
          rawMaterialWarehouseName: body.rawMaterialWarehouseName ?? null,
          projectNo: body.projectNo ?? null,
          departmentName: body.departmentName ?? null,
          status: "pending",
        })
        .returning();
      // § pola sama team.route.ts/me.route.ts — defensif untuk test (app.handle()
      // langsung, tanpa lewat boot index.ts yang panggil startQueue() sekali di awal
      // proses); idempotent di production (guard `started`, § lib/queue.ts).
      await startQueue();
      await boss.send(JOBS.PROCESS_AUTOPRODUKSI_ENTRY, { entryId: entry!.id });
      return { entry };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      body: t.Object({
        formulaId: t.String({ format: "uuid" }),
        producedQty: t.Number({ exclusiveMinimum: 0 }),
        transDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        // § Fase 168 (diminta client) — konteks per-produksi, semua
        // opsional. maxLength cocok kolom `autoproduksi_production_entries`.
        branchName: t.Optional(t.String({ maxLength: 100 })),
        warehouseName: t.Optional(t.String({ maxLength: 100 })),
        rawMaterialWarehouseName: t.Optional(t.String({ maxLength: 100 })),
        projectNo: t.Optional(t.String({ maxLength: 50 })),
        departmentName: t.Optional(t.String({ maxLength: 100 })),
      }),
    },
  )
  // § diminta client 2026-10-02 — Akun Perantara jadi MASTER DATA LOKAL
  // (bukan live-search Accurate lagi, § komentar `autoproduksi.schema.ts`
  // di atas `autoproduksiIntermediaryAccounts`). 100% CRUD lokal — TIDAK
  // ADA panggilan Accurate di 4 endpoint ini, TIDAK ADA scope baru.
  .get(
    "/autoproduksi/accounts",
    async ({ subscription }) => {
      const accounts = await db
        .select()
        .from(autoproduksiIntermediaryAccounts)
        .where(eq(autoproduksiIntermediaryAccounts.subscriptionId, subscription.id))
        .orderBy(autoproduksiIntermediaryAccounts.accountName);
      return { accounts };
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production" },
  )
  .post(
    "/autoproduksi/accounts",
    async ({ body, user, subscription, set }) => {
      const [existing] = await db
        .select({ id: autoproduksiIntermediaryAccounts.id })
        .from(autoproduksiIntermediaryAccounts)
        .where(and(eq(autoproduksiIntermediaryAccounts.subscriptionId, subscription.id), eq(autoproduksiIntermediaryAccounts.accountNo, body.accountNo)));
      if (existing) {
        set.status = 409;
        return { code: "ACCOUNT_NO_DUPLICATE" };
      }
      const [account] = await db
        .insert(autoproduksiIntermediaryAccounts)
        .values({
          userId: user.id,
          dataUsahaId: subscription.dataUsahaId,
          subscriptionId: subscription.id,
          accountNo: body.accountNo,
          accountName: body.accountName,
        })
        .returning();
      return { account };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      body: t.Object({
        accountNo: t.String({ minLength: 1, maxLength: 50 }),
        accountName: t.String({ minLength: 1, maxLength: 255 }),
      }),
    },
  )
  .put(
    "/autoproduksi/accounts/:id",
    async ({ params, body, subscription, set }) => {
      const [existing] = await db
        .select()
        .from(autoproduksiIntermediaryAccounts)
        .where(and(eq(autoproduksiIntermediaryAccounts.id, params.id), eq(autoproduksiIntermediaryAccounts.subscriptionId, subscription.id)));
      if (!existing) {
        set.status = 404;
        return { code: "ACCOUNT_NOT_FOUND" };
      }
      if (body.accountNo !== existing.accountNo) {
        const [duplicate] = await db
          .select({ id: autoproduksiIntermediaryAccounts.id })
          .from(autoproduksiIntermediaryAccounts)
          .where(and(eq(autoproduksiIntermediaryAccounts.subscriptionId, subscription.id), eq(autoproduksiIntermediaryAccounts.accountNo, body.accountNo)));
        if (duplicate) {
          set.status = 409;
          return { code: "ACCOUNT_NO_DUPLICATE" };
        }
      }
      const [account] = await db
        .update(autoproduksiIntermediaryAccounts)
        .set({ accountNo: body.accountNo, accountName: body.accountName, updatedAt: new Date() })
        .where(eq(autoproduksiIntermediaryAccounts.id, params.id))
        .returning();
      return { account };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        accountNo: t.String({ minLength: 1, maxLength: 50 }),
        accountName: t.String({ minLength: 1, maxLength: 255 }),
      }),
    },
  )
  .delete(
    "/autoproduksi/accounts/:id",
    async ({ params, subscription, set }) => {
      const [existing] = await db
        .select({ id: autoproduksiIntermediaryAccounts.id })
        .from(autoproduksiIntermediaryAccounts)
        .where(and(eq(autoproduksiIntermediaryAccounts.id, params.id), eq(autoproduksiIntermediaryAccounts.subscriptionId, subscription.id)));
      if (!existing) {
        set.status = 404;
        return { code: "ACCOUNT_NOT_FOUND" };
      }
      // § TIDAK ada FK dari autoproduksi_formulas ke tabel ini (snapshot
      // string independen, § komentar schema) — hapus di sini TIDAK PERNAH
      // menyentuh Formula yang sudah pernah pakai akun ini.
      await db.delete(autoproduksiIntermediaryAccounts).where(eq(autoproduksiIntermediaryAccounts.id, params.id));
      return { ok: true };
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
