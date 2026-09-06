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
// § Fase 12, ADR-0017 — bucket TERPISAH, public-read, KHUSUS aset branding
// (logo/favicon company). Jangan pakai bucket ini untuk media lain — semua
// isinya bisa diakses TANPA auth oleh siapa pun yang tahu URL-nya.
export const PUBLIC_MEDIA_BUCKET = "facport-public";
// § Fase 16, ADR-0022 — bucket TERPISAH, PRIVAT (TANPA public-read
// policy, beda dari PUBLIC_MEDIA_BUCKET), khusus foto bukti transfer/
// QRIS pembayaran. Dokumen finansial customer — TIDAK BOLEH bisa diakses
// lewat URL langsung, disajikan ke admin lewat presigned URL expiry
// pendek saja (§ architecture-payment.md § "Bucket Bukti Pembayaran").
export const PAYMENT_PROOF_BUCKET = "facport-payment-proofs";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(MEDIA_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(MEDIA_BUCKET);
}

// § Fase 12, ADR-0017 — policy public-read cuma berlaku untuk bucket INI
// (principal "*", action s3:GetObject, resource dibatasi ke nama bucket
// ini saja) — TIDAK pernah diterapkan ke MEDIA_BUCKET yang privat.
export async function ensurePublicBucket() {
  const exists = await minioClient.bucketExists(PUBLIC_MEDIA_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(PUBLIC_MEDIA_BUCKET);

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${PUBLIC_MEDIA_BUCKET}/*`],
      },
    ],
  };
  await minioClient.setBucketPolicy(PUBLIC_MEDIA_BUCKET, JSON.stringify(policy));
}

// § Fase 16 — TANPA setBucketPolicy public (beda dari ensurePublicBucket
// di atas) — default MinIO adalah privat, sengaja dibiarkan begitu.
export async function ensurePaymentProofBucket() {
  const exists = await minioClient.bucketExists(PAYMENT_PROOF_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(PAYMENT_PROOF_BUCKET);
}
