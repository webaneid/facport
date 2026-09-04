import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { settings } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { IMPORT_RETENTION_SETTING_KEY, MAX_IMPORT_RETENTION_DAYS } from "../lib/import-retention";

// § Fase 12, ADR-0017 — allowlist EKSPLISIT untuk `GET /settings/public`
// (endpoint TANPA auth sama sekali, dipakai landing page & tag favicon).
// WAJIB tambah key baru ke sini secara sadar — JANGAN pernah ganti endpoint
// ini jadi "return semua row" (persis Critical finding Fase 00: `GET
// /settings` pernah bocor semua row tanpa guard).
const PUBLIC_SETTINGS_KEYS = ["company.name", "company.logo", "company.favicon"] as const;

// § Fase 12, Medium finding security review — `company.logo`/`company.favicon`
// HARUS selalu berupa URL bucket public hasil `branding.route.ts` (file
// di-magic-bytes-check + di-re-encode ulang lewat sharp sebelum disimpan).
// `PUT /settings` generik terima `value: t.Unknown()` untuk key APA PUN —
// tanpa blokir ini, pemegang permission `settings.update` bisa menimpa
// kedua key ini dengan value bebas (bukan URL, bentuk object salah, dst)
// lewat jalur ini, bypass validasi/re-encode di endpoint upload, padahal
// value-nya di-echo APA ADANYA oleh `GET /settings/public` (tanpa auth) ke
// `<img src>`/favicon metadata di semua surface.
const BRANDING_ONLY_KEYS = ["company.logo", "company.favicon"] as const;

export const settingsRoute = new Elysia({ prefix: "/settings" })
  .use(permissionPlugin)
  // § Fase 12 — publik BETULAN (dipakai landing page tanpa login, dan tag
  // favicon di SEMUA halaman termasuk yang belum login), TANPA `auth`/
  // `permission` macro sama sekali. Path statis "/public" tidak konflik
  // dengan "/" di bawah (bukan wildcard/param route).
  .get("/public", async () => {
    const rows = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, [...PUBLIC_SETTINGS_KEYS]));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  })
  .get(
    "/",
    async ({ query }) => {
      const rows = query.group
        ? await db.select().from(settings).where(eq(settings.group, query.group))
        : await db.select().from(settings);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    {
      // Cek 401-only (§ Critical finding security review Fase 00 — GET ini
      // sebelumnya TANPA guard sama sekali, bocorin semua row settings ke
      // siapa pun). BELUM ada pemisahan public/admin settings — kalau nanti
      // butuh field yang memang publik (mis. company.name buat landing
      // page), buat endpoint terpisah `GET /settings/public`, jangan
      // longgarin endpoint ini.
      auth: true,
      query: t.Object({ group: t.Optional(t.String()) }),
    },
  )
  .put(
    "/",
    async ({ body, user, set }) => {
      // § Fase 10, architecture-subscription.md § "Retensi Data Import" —
      // key ini SATU-SATUNYA pengecualian di sistem settings yang
      // fleksibel/tanpa-skema ini: nilainya langsung dipakai job
      // penghapusan data OTOMATIS (`PURGE_OLD_IMPORTS`), jadi WAJIB
      // divalidasi server-side (bukan cuma form frontend) — batas 7 hari
      // adalah aturan bisnis TETAP (data client sensitif), bukan saran.
      const retentionItem = body.find((b) => b.key === IMPORT_RETENTION_SETTING_KEY);
      if (retentionItem) {
        const days = Number(retentionItem.value);
        if (!Number.isInteger(days) || days < 1 || days > MAX_IMPORT_RETENTION_DAYS) {
          set.status = 400;
          return { code: "INVALID_RETENTION_DAYS", maxDays: MAX_IMPORT_RETENTION_DAYS };
        }
      }

      if (body.some((b) => (BRANDING_ONLY_KEYS as readonly string[]).includes(b.key))) {
        set.status = 400;
        return { code: "USE_BRANDING_UPLOAD_ENDPOINT" };
      }

      for (const { key, value, group } of body) {
        await db
          .insert(settings)
          .values({ key, value, group, updatedBy: user.id })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value, updatedBy: user.id, updatedAt: new Date() },
          });
      }
      return { updated: body.length };
    },
    {
      permission: "settings.update",
      body: t.Array(
        t.Object({
          key: t.String({ maxLength: 100 }),
          // `t.Unknown()` (BUKAN t.Any()) SENGAJA — settings pakai skema
          // key-value fleksibel (§ architecture-settings.md), tiap key bisa
          // beda tipe (string/uuid/timezone/dst). Unknown tetap WAJIB
          // di-narrow sebelum dipakai sebagai nilai spesifik di service
          // layer lain, beda dari `any` yang bypass typecheck sama sekali.
          value: t.Unknown(),
          group: t.String({ maxLength: 50 }),
        }),
      ),
    },
  );
