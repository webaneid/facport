import { Client } from "minio";
import { env } from "./env";

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: Number(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === "true",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const MEDIA_BUCKET = "facport-media";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(MEDIA_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(MEDIA_BUCKET);
}
