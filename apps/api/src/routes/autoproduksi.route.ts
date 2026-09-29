import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";
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
const formulaItemSchema = t.Object({
  itemNo: t.String({ minLength: 1, maxLength: 100 }),
  itemUnitName: t.String({ minLength: 1, maxLength: 50 }),
  quantity: t.Number({ exclusiveMinimum: 0 }),
  warehouseName: t.Optional(t.String({ maxLength: 100 })),
});

const formulaBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  finishedGoodItemNo: t.String({ minLength: 1, maxLength: 100 }),
  finishedGoodItemUnitName: t.String({ minLength: 1, maxLength: 50 }),
  standardCost: t.Optional(t.Number({ minimum: 0 })),
  adjustmentAccountNo: t.String({ minLength: 1, maxLength: 50 }),
  branchName: t.String({ minLength: 1, maxLength: 100 }),
  warehouseName: t.Optional(t.String({ maxLength: 100 })),
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
            standardCost: body.standardCost !== undefined ? String(body.standardCost) : null,
            adjustmentAccountNo: body.adjustmentAccountNo,
            branchName: body.branchName,
            warehouseName: body.warehouseName ?? null,
          })
          .returning();
        await tx.insert(autoproduksiFormulaItems).values(
          body.items.map((item, index) => ({
            formulaId: inserted!.id,
            itemNo: item.itemNo,
            itemUnitName: item.itemUnitName,
            quantity: String(item.quantity),
            warehouseName: item.warehouseName ?? null,
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
            standardCost: body.standardCost !== undefined ? String(body.standardCost) : null,
            adjustmentAccountNo: body.adjustmentAccountNo,
            branchName: body.branchName,
            warehouseName: body.warehouseName ?? null,
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
            quantity: String(item.quantity),
            warehouseName: item.warehouseName ?? null,
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
      const formula = await loadFormulaWithItems(body.formulaId, subscription.id);
      if (!formula) {
        set.status = 404;
        return { code: "FORMULA_NOT_FOUND" };
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
      }),
    },
  );
