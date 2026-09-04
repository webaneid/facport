import { Elysia, t } from "elysia";
import { eq, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 14, ADR-0019 — `price` WAJIB lagi (supersede ADR-0015 "tanpa
// harga sementara"). `modules` WAJIB PERSIS 1 elemen, salah satu dari 5
// sub-modul yang dijual (§ accurate-scopes.ts `MODULE_ACCURATE_SCOPES`
// — daftar SAMA, sengaja tidak di-share langsung sebagai TypeBox schema
// karena beda representasi/tujuan, tapi WAJIB disinkronkan manual kalau
// salah satu berubah) — 1 plan = 1 SKU per sub-modul, bundling lintas-modul
// terjadi di cart (§ Fase 16), bukan di definisi plan.
// § `.map()` di atas array `as const` TIDAK boleh dipakai untuk bangun
// `t.Union` di sini — `.map()` selalu balikin `T[]` (array biasa), BUKAN
// tuple, dan `t.Union` butuh TUPLE literal supaya TypeBox bisa resolve
// tipe tiap elemen dengan benar. Ketemu 2026-09-04: versi `.map()` bikin
// Eden Treaty (apps/web) salah infer field `modules` jadi `File | File[]`
// (bukan union string literal) — tuple eksplisit di bawah ini WAJIB
// ditulis literal, JANGAN di-generate dari array lagi.
const planBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  price: t.Integer({ minimum: 0 }),
  durationDays: t.Integer({ minimum: 1 }),
  modules: t.Array(
    t.Union([
      t.Literal("sales_invoice"),
      t.Literal("purchase_invoice"),
      t.Literal("sales_receipt"),
      t.Literal("purchase_payment"),
      t.Literal("journal_voucher"),
    ]),
    { minItems: 1, maxItems: 1 },
  ),
  isActive: t.Optional(t.Boolean()),
});

export const adminPlansRoute = new Elysia({ prefix: "/admin/plans" })
  .use(permissionPlugin)
  .get(
    "/",
    async () => {
      const all = await db.select().from(plans).orderBy(desc(plans.createdAt));
      return { plans: all };
    },
    { permission: "plans.manage" },
  )
  .post(
    "/",
    async ({ body, user }) => {
      const [plan] = await db.insert(plans).values(body).returning();
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: plan!.id,
        action: "create",
        changes: body,
        actorId: user.id,
      });
      return plan;
    },
    { permission: "plans.manage", body: planBody },
  )
  .put(
    "/:id",
    async ({ params, body, user, set }) => {
      const [existing] = await db.select().from(plans).where(eq(plans.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      const [updated] = await db
        .update(plans)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(plans.id, params.id))
        .returning();
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: params.id,
        action: "update",
        changes: body,
        actorId: user.id,
      });
      return updated;
    },
    { permission: "plans.manage", params: t.Object({ id: t.String({ format: "uuid" }) }), body: planBody },
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(plans).where(eq(plans.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      // Soft — nonaktifkan, JANGAN hard delete (subscription lama masih
      // referensi planId ini, § architecture-database.md soft delete)
      await db.update(plans).set({ isActive: false, updatedAt: new Date() }).where(eq(plans.id, params.id));
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: params.id,
        action: "delete",
        changes: { isActive: { from: existing.isActive, to: false } },
        actorId: user.id,
      });
      return { id: params.id };
    },
    { permission: "plans.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
