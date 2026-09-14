import { Elysia, t } from "elysia";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { promos, media, auditLogs } from "../../db/schema";
import { minioClient, PUBLIC_MEDIA_BUCKET, ensurePublicBucket } from "../../lib/minio";
import { permissionPlugin } from "../../lib/permission";
import { env } from "../../lib/env";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_SIZE_MB = 5;

function publicUrl(key: string) {
  return `${env.MINIO_PUBLIC_URL}/${PUBLIC_MEDIA_BUCKET}/${key}`;
}

// § Fase 116, architecture-promo.md — `title`/`description`/`buttonLabel`
// ALL-OR-NOTHING (ketiganya kosong = mode "gambar jadi link langsung",
// ketiganya terisi = mode "kartu + tombol"). Dipanggil dari POST & PATCH
// — pola sama `validatePlanKindModules` (admin/plans.route.ts), JANGAN
// duplikasi logic-nya di 2 tempat kalau berubah nanti.
function validatePromoTextFields(body: { title?: string | null; description?: string | null; buttonLabel?: string | null }): {
  code: string;
} | null {
  const filled = [body.title, body.description, body.buttonLabel].filter((v) => v !== undefined && v !== null && v !== "");
  if (filled.length > 0 && filled.length < 3) return { code: "TITLE_DESCRIPTION_BUTTON_LABEL_ALL_OR_NOTHING" };
  return null;
}

// § security review Fase 116 (Medium, DIPERBAIKI) — `t.String({minLength:1})`
// di body schema cuma cek "tidak kosong", TIDAK cek skema URL. Tanpa ini,
// akun mana pun yang punya `promos.manage` (role "staff" juga otomatis
// dapat, § seed.ts) bisa isi `url: "javascript:..."` — promo itu tampil
// ke SEMUA customer lewat `GET /promos` publik, dan link `javascript:`
// dieksekusi di konteks halaman saat diklik (target="_blank" TIDAK
// mencegah ini). WAJIB `http:`/`https:` — bukan cuma "ada isinya".
function validatePromoUrlScheme(url: string): { code: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { code: "URL_SCHEME_NOT_ALLOWED" };
  } catch {
    return { code: "URL_INVALID" };
  }
  return null;
}

export const adminPromosRoute = new Elysia({ prefix: "/admin/promos" })
  .use(permissionPlugin)
  .get(
    "/",
    async () => {
      // § list SEMUA (termasuk nonaktif) — beda dari `GET /promos` publik
      // (customer) yang cuma balikin `isActive:true` + LIMIT 5.
      const rows = await db.select().from(promos).orderBy(promos.sortOrder, desc(promos.createdAt));
      return { promos: rows };
    },
    { permission: "promos.manage" },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      const validationError = validatePromoTextFields(body);
      if (validationError) {
        set.status = 400;
        return validationError;
      }
      const urlError = validatePromoUrlScheme(body.url);
      if (urlError) {
        set.status = 400;
        return urlError;
      }
      // § promo baru default ke urutan TERAKHIR (MAX(sortOrder)+1) kalau
      // `sortOrder` tidak dikirim eksplisit — admin baru buat 1 promo,
      // dia otomatis nongol paling belakang di slider, bukan menimpa
      // urutan promo lain yang sudah diatur.
      let sortOrder = body.sortOrder;
      if (sortOrder === undefined) {
        const [row] = await db.select({ max: sql<number | null>`max(${promos.sortOrder})` }).from(promos);
        sortOrder = (row?.max ?? -1) + 1;
      }
      const [promo] = await db
        .insert(promos)
        .values({
          title: body.title || null,
          description: body.description || null,
          buttonLabel: body.buttonLabel || null,
          url: body.url,
          imageUrl: body.imageUrl,
          isActive: body.isActive ?? true,
          sortOrder,
          createdBy: user.id,
        })
        .returning();

      await db.insert(auditLogs).values({
        entityType: "promo",
        entityId: promo!.id,
        action: "create",
        changes: { title: body.title, url: body.url, isActive: promo!.isActive },
        actorId: user.id,
      });

      return promo;
    },
    {
      permission: "promos.manage",
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 200 })),
        description: t.Optional(t.String()),
        buttonLabel: t.Optional(t.String({ maxLength: 50 })),
        url: t.String({ minLength: 1 }),
        imageUrl: t.String({ minLength: 1 }),
        isActive: t.Optional(t.Boolean()),
        sortOrder: t.Optional(t.Integer()),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      const [existing] = await db.select().from(promos).where(eq(promos.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PROMO_NOT_FOUND" };
      }
      // § validasi all-or-nothing terhadap NILAI AKHIR (existing + body),
      // bukan cuma field yang dikirim — cegah PATCH parsial bikin state
      // ambigu (mis. cuma kirim `{title: ""}` padahal description/buttonLabel
      // lama masih terisi).
      const merged = {
        title: body.title !== undefined ? body.title : existing.title,
        description: body.description !== undefined ? body.description : existing.description,
        buttonLabel: body.buttonLabel !== undefined ? body.buttonLabel : existing.buttonLabel,
      };
      const validationError = validatePromoTextFields(merged);
      if (validationError) {
        set.status = 400;
        return validationError;
      }
      if (body.url !== undefined) {
        const urlError = validatePromoUrlScheme(body.url);
        if (urlError) {
          set.status = 400;
          return urlError;
        }
      }

      const [updated] = await db
        .update(promos)
        .set({
          ...(body.title !== undefined ? { title: body.title || null } : {}),
          ...(body.description !== undefined ? { description: body.description || null } : {}),
          ...(body.buttonLabel !== undefined ? { buttonLabel: body.buttonLabel || null } : {}),
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(promos.id, params.id))
        .returning();

      await db.insert(auditLogs).values({
        entityType: "promo",
        entityId: params.id,
        action: "update",
        changes: body,
        actorId: user.id,
      });

      return updated;
    },
    {
      permission: "promos.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 200 })),
        description: t.Optional(t.String()),
        buttonLabel: t.Optional(t.String({ maxLength: 50 })),
        url: t.Optional(t.String({ minLength: 1 })),
        imageUrl: t.Optional(t.String({ minLength: 1 })),
        isActive: t.Optional(t.Boolean()),
        sortOrder: t.Optional(t.Integer()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(promos).where(eq(promos.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PROMO_NOT_FOUND" };
      }
      // § hard delete — konsisten konvensi project ("soft delete TIDAK
      // dipakai"), aman karena TIDAK ADA tabel lain yang FK ke `promos`.
      await db.delete(promos).where(eq(promos.id, params.id));

      await db.insert(auditLogs).values({
        entityType: "promo",
        entityId: params.id,
        action: "delete",
        changes: { title: existing.title, url: existing.url },
        actorId: user.id,
      });

      return { ok: true };
    },
    { permission: "promos.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  // § Fase 116 — upload gambar promo ke bucket PUBLIK (`facport-public`),
  // pola PERSIS `admin/branding.route.ts` `POST /admin/branding/qris-image`
  // (upload publik, balikin `{url}` doang, TIDAK langsung tulis ke tabel
  // manapun — admin yang isi `imageUrl` ke form Promo). SENGAJA BUKAN
  // `POST /media/upload` (Media Library generik, bucket PRIVAT) — pola itu
  // cuma balikin `storageKey` internal, BUKAN URL siap pakai `<img>` (gap
  // terdokumentasi belum selesai, § architecture-storage.md & architecture-promo.md).
  .post(
    "/image",
    async ({ body, user, set }) => {
      const buffer = Buffer.from(await body.file.arrayBuffer());

      let metadata: sharp.Metadata;
      try {
        metadata = await sharp(buffer).metadata();
      } catch {
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await ensurePublicBucket();

      const id = randomUUID();
      const key = `promos/${id}.webp`;
      const webpBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();
      await minioClient.putObject(PUBLIC_MEDIA_BUCKET, key, webpBuffer);
      const url = publicUrl(key);

      await db.insert(media).values({
        id,
        filename: body.file.name,
        storageKey: key,
        mimeType: "image/webp",
        sizeBytes: webpBuffer.length,
        width: metadata.width,
        height: metadata.height,
        uploadedBy: user.id,
      });

      return { url };
    },
    {
      permission: "promos.manage",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  );
