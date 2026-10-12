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

// Batas "kata": email tidak boleh menempel pada karakter email lain (mis. `abob@x.id`, `bob@x.id.au`); nomor tidak boleh menempel pada digit lain.
function boundedPattern(value: string): RegExp {
  const body = escapeRegex(value);
  return value.includes("@") ? new RegExp(`(?<![\\w.+-])${body}(?![\\w-]|\\.\\w)`, "gi") : new RegExp(`(?<!\\d)${body}(?!\\d)`, "gi");
}

/**
 * Ganti PII (email, telepon, …) di seluruh nilai string JSON — tak peka huruf besar/kecil, aman terhadap karakter regex pada nilai, dan hanya pada batas kata (tidak merusak email/nomor
 * ORANG LAIN yang kebetulan memuat nilai ini sebagai substring). Struktur objek/array tidak berubah.
 */
export function scrubJson<T>(value: T, replacements: readonly { from: string; to: string }[]): T {
  const usable = replacements.filter((r) => r.from.trim() !== "");
  if (usable.length === 0) return value;
  const patterns = usable.map((r) => ({ re: boundedPattern(r.from.trim()), to: r.to }));
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return patterns.reduce((acc, p) => acc.replace(p.re, () => p.to), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

const PII_KEYS = new Set(["email", "name", "phone", "whatsapp", "companyName", "contact"]);
/** Buang kunci identitas/kontak di KEDALAMAN BERAPA PUN (mis. `contact.from/to` bersarang) dari JSON audit tentang akun itu. */
export function dropPiiKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropPiiKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !PII_KEYS.has(k)).map(([k, x]) => [k, dropPiiKeys(x)]));
  return value;
}

export type FkInfo = { table: string; column: string; deleteType: string; schema?: string };
/** Cascade yang BOLEH untuk FK ke "user": hanya tabel sesi/identitas ini. FK cascade lain (mis. tabel baru berisi catatan bisnis) MEMBLOKIR — jangan sampai ikut terhapus diam-diam. */
const SAFE_CASCADE_USER = new Set(["session.user_id", "account.user_id", "user_roles.user_id", "notifications.user_id"]);
/** FK yang boleh di-NULL-kan saat hapus permanen (jejak "siapa pelaku", bukan catatan bisnis). Daftar SENGAJA sempit: kolom lain apa pun yang berisi baris memblokir (fail-closed). */
const NULLABLE_FKS = new Set(["audit_logs.actor_id"]);

/** `parent` = tabel yang dirujuk. Untuk "data_usaha" SEMUA FK (termasuk cascade) memblokir: Data Usaha berisi tidak boleh dianggap kosong. */
export function classifyFk(fk: FkInfo, parent: "user" | "data_usaha" = "user"): "cascade" | "nullable" | "blocking" {
  const key = `${fk.table}.${fk.column}`;
  if (parent === "user" && fk.deleteType === "c" && SAFE_CASCADE_USER.has(key)) return "cascade";
  if (parent === "user" && NULLABLE_FKS.has(key)) return "nullable";
  return "blocking";
}
