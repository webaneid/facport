import { Elysia, t } from "elysia";
import { eq, ilike, desc } from "drizzle-orm";
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
// § Fase 110, architecture-user-tambahan.md — `kind: "seat_addon"` (slot
// User Tambahan) TIDAK terikat modul import apa pun (`modules` WAJIB
// kosong) — beda dari `kind: "module"` (default, SKU sub-modul biasa,
// `modules` WAJIB PERSIS 1 elemen seperti sebelumnya). Divalidasi manual
// di handler (bukan TypeBox conditional — tidak ada cara elegan
// menyatakan "field X wajib tergantung nilai field Y" declaratively di
// schema Elysia), bukan diasumsikan client selalu kirim kombinasi benar.
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
      // § ADR-0026 — dulu bundel gratis ke purchase_invoice, sekarang SKU sendiri.
      t.Literal("vendor_payable_account"),
      // § Fase 96 (2026-09-10) — modul baru, SKU sendiri sejak awal.
      t.Literal("other_payment"),
    ]),
    { minItems: 0, maxItems: 1 },
  ),
  isActive: t.Optional(t.Boolean()),
  // § Fase 43 (koreksi) — admin WAJIB eksplisit menandai paket ini boleh
  // dicoba trial atau tidak, default false kalau tidak diisi (form admin
  // SELALU kirim field ini eksplisit, opsional di sini cuma jaga-jaga
  // konsumen API lain).
  trialEligible: t.Optional(t.Boolean()),
  kind: t.Optional(t.Union([t.Literal("module"), t.Literal("seat_addon")])),
});

// § Validasi silang modules<->kind — dipanggil dari POST & PUT (sama
// persis, JANGAN duplikasi logic-nya di 2 tempat kalau berubah nanti).
function validatePlanKindModules(body: { kind?: string; modules: string[] }): { code: string } | null {
  const kind = body.kind ?? "module";
  if (kind === "seat_addon") {
    if (body.modules.length > 0) return { code: "SEAT_ADDON_CANNOT_HAVE_MODULES" };
  } else if (body.modules.length !== 1) {
    return { code: "MODULE_PLAN_REQUIRES_EXACTLY_ONE_MODULE" };
  }
  return null;
}

export const adminPlansRoute = new Elysia({ prefix: "/admin/plans" })
  .use(permissionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const search = query.search?.trim();
      const all = await db
        .select()
        .from(plans)
        .where(search ? ilike(plans.name, `%${search}%`) : undefined)
        .orderBy(desc(plans.createdAt));
      return { plans: all };
    },
    { permission: "plans.manage", query: t.Object({ search: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      const validationError = validatePlanKindModules(body);
      if (validationError) {
        set.status = 400;
        return validationError;
      }
      // § seat_addon TIDAK PERNAH trial (§ subscriptions.route.ts guard
      // yang sama) — dipaksa di sini juga supaya data konsisten sejak
      // dibuat, bukan cuma ditolak belakangan saat customer coba trial.
      const values = body.kind === "seat_addon" ? { ...body, trialEligible: false } : body;
      const [plan] = await db.insert(plans).values(values).returning();
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
      const validationError = validatePlanKindModules(body);
      if (validationError) {
        set.status = 400;
        return validationError;
      }
      const values = body.kind === "seat_addon" ? { ...body, trialEligible: false } : body;
      const [updated] = await db
        .update(plans)
        .set({ ...values, updatedAt: new Date() })
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
