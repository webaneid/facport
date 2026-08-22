import { Elysia, t } from "elysia";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { db } from "../lib/db";
import { media } from "../db/schema";
import { minioClient, MEDIA_BUCKET, ensureBucket } from "../lib/minio";
import { generateVariants } from "../services/image-processing.service";
import { permissionPlugin } from "../lib/permission";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_SIZE_MB = 5;

export const mediaRoute = new Elysia({ prefix: "/media" })
  .use(permissionPlugin)
  .post(
    "/upload",
    async ({ body, user, set }) => {
      const file = body.file;

      // MIME + size SUDAH ditolak di layer schema (t.File({type,maxSize})
      // di bawah) SEBELUM handler ini jalan — request oversized/tipe salah
      // tidak sempat di-buffer penuh dulu (§ Medium finding security review
      // Fase 00: cegah resource-exhaustion dari body yang keburu di-parse).
      // sharp.metadata() di bawah tetap validasi "sungguhan" via magic bytes
      // (declared MIME dari client masih bisa dipalsukan, § architecture-security.md §8).
      const buffer = Buffer.from(await file.arrayBuffer());

      let metadata: sharp.Metadata;
      try {
        metadata = await sharp(buffer).metadata();
      } catch {
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await ensureBucket();

      const id = randomUUID();
      const ext = "webp";
      const baseKey = `uploads/${id}`;

      await minioClient.putObject(MEDIA_BUCKET, `${baseKey}/original.${ext}`, buffer);

      const variants = await generateVariants(buffer);
      const variantKeys: Record<string, string> = {};
      for (const [name, variantBuffer] of Object.entries(variants)) {
        const key = `${baseKey}/${name}.${ext}`;
        await minioClient.putObject(MEDIA_BUCKET, key, variantBuffer);
        variantKeys[name] = key;
      }

      const [row] = await db
        .insert(media)
        .values({
          id,
          filename: file.name,
          storageKey: `${baseKey}/original.${ext}`,
          mimeType: file.type,
          sizeBytes: file.size,
          width: metadata.width,
          height: metadata.height,
          variants: variantKeys,
          uploadedBy: user.id,
        })
        .returning();

      return row;
    },
    {
      permission: "media.upload",
      body: t.Object({
        file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }),
      }),
    },
  );
