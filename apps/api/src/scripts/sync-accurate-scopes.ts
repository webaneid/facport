// § architecture-accurate-scope-engine.md — sinkron snapshot scope dari OpenAPI spec
// publik Accurate (TIDAK login-gated). Jalankan MANUAL saat menambah modul/endpoint baru
// yang belum ada di snapshot: `bun run scopes:sync`. Hasil di-commit supaya build & tes
// tidak bergantung jaringan.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SPEC_URL = "https://account.accurate.id/open-api/json.do";
const OUT = join(import.meta.dir, "../lib/accurate-scope-snapshot.json");

type Operation = { security?: Array<Record<string, string[]>> };
type Spec = { paths: Record<string, Record<string, Operation>> };

const res = await fetch(SPEC_URL);
if (!res.ok) throw new Error(`Gagal ambil spec Accurate: HTTP ${res.status}`);
const spec = (await res.json()) as Spec;

// Kunci: "METHOD resource/action.do" (tanpa awalan "/api/"), nilai: scope[] terurut.
const snapshot: Record<string, string[]> = {};
for (const [path, methods] of Object.entries(spec.paths)) {
  if (!path.startsWith("/api/")) continue;
  for (const [method, op] of Object.entries(methods)) {
    const scopes = [...new Set((op.security ?? []).flatMap((s) => Object.values(s).flat()))].sort();
    if (scopes.length === 0) continue;
    snapshot[`${method.toUpperCase()} ${path.slice("/api/".length)}`] = scopes;
  }
}

const sorted = Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`Snapshot ditulis: ${Object.keys(sorted).length} operasi → ${OUT}`);
