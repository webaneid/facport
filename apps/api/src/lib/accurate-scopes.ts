// § architecture-accurate-scope-engine.md, ADR-0036 #4 — scope OAuth per modul DITURUNKAN dari
// registri endpoint (`accurate-endpoint-registry.ts`) + snapshot spec resmi Accurate
// (`accurate-scope-snapshot.json`, dibuat `bun run scopes:sync` dari
// https://account.accurate.id/open-api/json.do — publik, tidak login-gated). BUKAN tulis tangan
// lagi: dua bug production (Fase 78 vendor_*, Fase 98 data_classification_*) terjadi karena
// scope ditulis tangan terpisah dari kode yang memanggil endpoint-nya.
//
// § Fase 14, ADR-0019 — key = SUB-MODUL (key `module-catalog.ts`, varian Produk "facport").
// API publik (`MODULE_ACCURATE_SCOPES`, `scopesForModules`) tidak berubah bentuk.
import snapshot from "./accurate-scope-snapshot.json";
import { ACCURATE_ENDPOINT_REGISTRY, BASELINE_ENDPOINTS } from "./accurate-endpoint-registry";

const SNAPSHOT = snapshot as Record<string, string[]>;

/** Scope yang dibutuhkan satu endpoint ("METHOD resource/aksi.do") menurut snapshot spec. */
export function scopesForEndpoint(endpoint: string): string[] {
  const scopes = SNAPSHOT[endpoint];
  if (!scopes) {
    throw new Error(
      `Endpoint Accurate "${endpoint}" tidak ada di accurate-scope-snapshot.json — cek ejaan/method, ` +
        `atau jalankan \`bun run scopes:sync\` kalau endpoint-nya memang baru.`,
    );
  }
  return scopes;
}

function deriveScopes(moduleKey: string): string[] {
  const entry = ACCURATE_ENDPOINT_REGISTRY[moduleKey];
  if (!entry) throw new Error(`Modul "${moduleKey}" tidak ada di accurate-endpoint-registry.ts`);
  const scopes = new Set<string>();
  for (const endpoint of entry.endpoints) for (const s of scopesForEndpoint(endpoint)) scopes.add(s);
  for (const extra of entry.extraScopes ?? []) scopes.add(extra.scope);
  return [...scopes];
}

// Scope tambahan per modul, TANPA baseline (baseline ditambahkan di scopesForModules, seperti dulu).
export const MODULE_ACCURATE_SCOPES: Record<string, string[]> = Object.fromEntries(
  Object.keys(ACCURATE_ENDPOINT_REGISTRY).map((key) => [key, deriveScopes(key)]),
);

export const BASELINE_SCOPES: string[] = [...new Set(BASELINE_ENDPOINTS.flatMap(scopesForEndpoint))];

export function scopesForModules(modules: string[]): string[] {
  const scopes = new Set<string>(BASELINE_SCOPES);
  for (const mod of modules) {
    for (const scope of MODULE_ACCURATE_SCOPES[mod] ?? []) scopes.add(scope);
  }
  return [...scopes];
}

/**
 * Gabungan SEMUA scope katalog (baseline + semua modul). Model 1-otorisasi (ADR-0036 #2):
 * otorisasi Accurate SELALU meminta ini, karena otorisasi baru mematikan token lama dan
 * mengganti seluruh scope (terbukti Fase 141 E2) — jadi tidak boleh ada otorisasi "sempit".
 */
export const ALL_ACCURATE_SCOPES: string[] = scopesForModules(Object.keys(MODULE_ACCURATE_SCOPES));
