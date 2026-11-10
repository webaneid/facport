// § Fase 217, ADR-0054 — helper murni UI klaim trial (daftar klaim per database Accurate + modul, lepas klaim, daftar pengecualian). Aturan sebenarnya dipaksa server
// (`apps/api/src/routes/admin/trial-claims.route.ts`, `apps/api/src/lib/trial-claims.ts`).

export type TrialClaimStatusFilter = "active" | "released" | "all";

export const TRIAL_CLAIM_STATUS_LABEL: Record<TrialClaimStatusFilter, string> = { active: "Aktif", released: "Dilepas", all: "Semua" };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Teks pengecualian (dipisah koma/spasi/baris baru) → daftar id unik + yang tidak valid. Polanya sama dengan validasi server. */
export function parseExemptDbIds(text: string): { ids: string[]; invalid: string[] } {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (!ID_PATTERN.test(t)) {
      if (!invalid.includes(t)) invalid.push(t);
    } else if (!ids.includes(t)) {
      ids.push(t);
    }
  }
  return { ids, invalid };
}

export function formatExemptDbIds(value: unknown): string {
  return Array.isArray(value) ? value.filter((x) => typeof x === "string" || typeof x === "number").map(String).join("\n") : "";
}

const RELEASE_ERRORS: Record<string, string> = {
  CLAIM_NOT_FOUND: "Klaim tidak ditemukan.",
  CLAIM_ALREADY_RELEASED: "Klaim ini sudah dilepas.",
  REASON_REQUIRED: "Alasan wajib diisi (minimal 3 karakter).",
  TOO_MANY_REQUESTS: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
};

export function trialClaimReleaseError(code: string | undefined): string {
  return (code && RELEASE_ERRORS[code]) || "Gagal melepas klaim. Coba lagi.";
}
