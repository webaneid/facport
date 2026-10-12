import { createHash } from "crypto";

// § Fase 189H, ADR-0045 — bagian MURNI penghapusan permanen & anonimisasi akun (tanpa DB; diuji terpisah). Orkestrasi DB: `lib/account-erasure-db.ts`.

export const ERASE_CONFIRM_WORDS = { delete: "HAPUS", anonymize: "ANONIMKAN" } as const;
export const ANON_EMAIL_DOMAIN = "anonymized.invalid";

export const anonymizedEmail = (userId: string) => `anon-${userId}@${ANON_EMAIL_DOMAIN}`;
export const anonymizedName = (userId: string) => `Akun Anonim ${userId.slice(0, 8)}`;
export const isAnonymizedEmail = (email: string) => /^anon-[^@\s]+@anonymized\.invalid$/i.test(email);

/** Jejak email di audit TANPA menyimpan email: SHA-256 dari email huruf kecil (cukup untuk membuktikan "akun mana" bila email asli diketahui). */
export const emailDigest = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Ganti PII (email, telepon, …) di seluruh nilai string JSON — tak peka huruf besar/kecil, aman terhadap karakter regex pada nilai. Struktur objek/array tidak berubah.
 * Dipakai men-scrub `audit_logs.changes` yang memuat kontak akun yang dihapus/dianonimkan.
 */
export function scrubJson<T>(value: T, replacements: readonly { from: string; to: string }[]): T {
  const usable = replacements.filter((r) => r.from.trim() !== "");
  if (usable.length === 0) return value;
  const patterns = usable.map((r) => ({ re: new RegExp(escapeRegex(r.from), "gi"), to: r.to }));
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return patterns.reduce((acc, p) => acc.replace(p.re, () => p.to), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

export type FkInfo = { table: string; column: string; deleteType: string };
/** FK yang boleh di-NULL-kan saat hapus permanen (jejak "siapa pelaku", bukan catatan bisnis). Daftar SENGAJA sempit: kolom lain apa pun yang berisi baris memblokir (fail-closed). */
const NULLABLE_FKS = new Set(["audit_logs.actor_id"]);

export function classifyFk(fk: FkInfo): "cascade" | "nullable" | "blocking" {
  if (fk.deleteType === "c") return "cascade";
  if (NULLABLE_FKS.has(`${fk.table}.${fk.column}`)) return "nullable";
  return "blocking";
}
