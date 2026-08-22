import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { settings } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

export const settingsRoute = new Elysia({ prefix: "/settings" })
  .use(permissionPlugin)
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
    async ({ body, user }) => {
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
