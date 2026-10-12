import { Elysia, t } from "elysia";
import { permissionPlugin } from "../../lib/permission";
import { db } from "../../lib/db";
import { ERASE_CONFIRM_WORDS } from "../../lib/account-erasure";
import { anonymizeImpact, applyErasure, evaluateErasure } from "../../lib/account-erasure-db";
import { logger } from "../../lib/logger";

// § Fase 189H, ADR-0045 — hapus permanen (hanya akun TANPA jejak bisnis) dan anonimisasi (akun berjejak bisnis) MASSAL, hanya Super Admin (`users.manage`). Dua langkah: `/erase/preview`
// (kelayakan per akun, tanpa mengubah) lalu `/erase` dengan konfirmasi ketik kata (HAPUS / ANONIMKAN) + alasan wajib. Kelayakan dihitung ULANG di server di dalam transaksi; akun yang tidak lolos
// dilewati dengan alasannya. Audit tidak menyimpan email (hanya digest SHA-256). Logika: `lib/account-erasure.ts` (murni) dan `lib/account-erasure-db.ts`.
const kindSchema = t.Union([t.Literal("delete"), t.Literal("anonymize")]);
const idsSchema = t.Array(t.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 100 });

export const adminUserErasureRoute = new Elysia({ prefix: "/admin/users/erase" })
  .use(permissionPlugin)
  .post(
    "/preview",
    async ({ body, user }) => {
      const plan = await evaluateErasure(db, body.kind, body.userIds, user.id);
      const eligible = plan.targets.filter((x) => x.reasons.length === 0);
      return {
        kind: body.kind,
        requested: plan.requested,
        eligible: eligible.length,
        missing: plan.missing.length,
        blocked: plan.targets.filter((x) => x.reasons.length > 0).map((x) => ({ id: x.id, name: x.name, email: x.email, reasons: x.reasons })),
        confirmWord: ERASE_CONFIRM_WORDS[body.kind],
        // anonimisasi tidak dapat dipulihkan dan memutus koneksi Accurate akun: tampilkan dampaknya di pratinjau
        impact: body.kind === "anonymize" ? await anonymizeImpact(db, eligible.map((x) => x.id)) : null,
      };
    },
    { permission: "users.manage", body: t.Object({ kind: kindSchema, userIds: idsSchema }) },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (body.confirm.trim() !== ERASE_CONFIRM_WORDS[body.kind]) {
        set.status = 400;
        return { code: "CONFIRM_MISMATCH" };
      }
      const reason = body.reason.trim();
      if (reason.length < 3) {
        set.status = 422;
        return { code: "REASON_REQUIRED" };
      }
      const result = await applyErasure(body.kind, body.userIds, user.id, reason);
      logger.info({ kind: body.kind, requested: result.requested, done: result.victims.length, actorId: user.id }, "Aksi hapus/anonimisasi akun dijalankan"); // tanpa PII
      return {
        kind: body.kind,
        requested: result.requested,
        done: result.victims.length,
        skipped: result.targets.filter((x) => x.reasons.length > 0).map((x) => ({ id: x.id, reasons: x.reasons })),
        missing: result.missing.length,
      };
    },
    { permission: "users.manage", body: t.Object({ kind: kindSchema, userIds: idsSchema, confirm: t.String({ maxLength: 20 }), reason: t.String({ minLength: 1, maxLength: 500 }) }) },
  );
