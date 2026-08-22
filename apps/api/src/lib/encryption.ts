import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "./env";

// AES-256-GCM — dipakai untuk enkripsi token Accurate at-rest
// (§ architecture-security.md §1, architecture-accurate-integration.md § 1).
// Key diturunkan dari ACCURATE_TOKEN_ENCRYPTION_KEY (string apa pun di env)
// lewat scrypt supaya selalu tepat 32 byte, apa pun panjang string aslinya.
const key = scryptSync(env.ACCURATE_TOKEN_ENCRYPTION_KEY, "facport-accurate-token", 32);

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // GCM standar: 96-bit IV
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Simpan iv + authTag + ciphertext jadi satu string base64, dipisah ":"
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, dataB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Format payload terenkripsi tidak valid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
