import { Elysia, t } from "elysia";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { db } from "../../lib/db";
import { media, settings, auditLogs } from "../../db/schema";
import { minioClient, PUBLIC_MEDIA_BUCKET, ensurePublicBucket } from "../../lib/minio";
import { generateFaviconSizes } from "../../services/image-processing.service";
import { permissionPlugin } from "../../lib/permission";
import { env } from "../../lib/env";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_SIZE_MB = 5;

function publicUrl(key: string) {
  return `${env.MINIO_PUBLIC_URL}/${PUBLIC_MEDIA_BUCKET}/${key}`;
}

// § Fase 12, ADR-0017 — upload logo/favicon company. TERPISAH dari
// `media.route.ts` (generic Media Library, bucket PRIVATE) karena aset ini
// masuk bucket PUBLIC (`facport-public`) dan hasilnya langsung ditulis ke
// `settings.company.logo`/`company.favicon` sebagai URL yang sudah
// di-resolve, bukan dikembalikan sebagai media ID mentah untuk dipilih
// manual seperti alur Media Library umum.
export const brandingRoute = new Elysia({ prefix: "/admin/branding" })
  .use(permissionPlugin)
  .post(
    "/logo",
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
      const key = `branding/logo-${id}.webp`;
      const webpBuffer = await sharp(buffer).webp({ quality: 82 }).toBuffer();
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

      await db
        .insert(settings)
        .values({ key: "company.logo", value: url, group: "general", updatedBy: user.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: url, updatedBy: user.id, updatedAt: new Date() },
        });

      await db.insert(auditLogs).values({
        entityType: "settings",
        entityId: "company.logo",
        action: "update",
        changes: { logo: url },
        actorId: user.id,
      });

      return { url };
    },
    {
      permission: "settings.update",
      body: t.Object({
        file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }),
      }),
    },
  )
  .post(
    "/favicon",
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
      const sizeBuffers = await generateFaviconSizes(buffer);
      const urls: Record<string, string> = {};
      const keys: Record<string, string> = {};
      for (const [size, sizeBuffer] of Object.entries(sizeBuffers)) {
        const key = `branding/favicon-${id}/${size}.png`;
        await minioClient.putObject(PUBLIC_MEDIA_BUCKET, key, sizeBuffer);
        keys[size] = key;
        urls[size] = publicUrl(key);
      }

      // § Media Library sudah punya kolom `variants` (jsonb) buat kasus
      // "1 upload, banyak turunan" — dipakai ulang di sini, storageKey
      // menunjuk ukuran terbesar (512) sebagai representasi utama.
      await db.insert(media).values({
        id,
        filename: body.file.name,
        storageKey: keys["512"]!,
        mimeType: "image/png",
        sizeBytes: sizeBuffers["512"]!.length,
        width: metadata.width,
        height: metadata.height,
        variants: keys,
        uploadedBy: user.id,
      });

      await db
        .insert(settings)
        .values({ key: "company.favicon", value: urls, group: "general", updatedBy: user.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: urls, updatedBy: user.id, updatedAt: new Date() },
        });

      await db.insert(auditLogs).values({
        entityType: "settings",
        entityId: "company.favicon",
        action: "update",
        changes: { favicon: urls },
        actorId: user.id,
      });

      return { urls };
    },
    {
      permission: "settings.update",
      body: t.Object({
        file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }),
      }),
    },
  );
