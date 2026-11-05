import { env } from "./env";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 215 (architecture-import-speed-lab.md § 9 & § 11) — tanpa cache, TIAP faktur mencari ulang pelanggan/vendor dan TIAP kode barang di Accurate (±60–95 ms per
// pencarian; faktur dengan k barang berbeda = k + 2 permintaan, pencarian ±35% waktu per faktur) walau barang yang sama sudah ditemukan di faktur sebelumnya dalam
// batch yang sama. Cache ini menyimpan HASIL POSITIF "barang/pelanggan/vendor SUDAH ADA (atau baru dibuat)" selama SATU sesi Accurate (= satu job impor).
//
// Aturan keamanan (jangan dilonggarkan tanpa uji):
//  - HANYA hasil positif yang disimpan. "Tidak ketemu" TIDAK disimpan (selalu dicari lagi / memicu pembuatan) → tidak pernah salah mengira data tidak ada.
//  - Lingkup = objek sesi (`ctx`): `WeakMap` → cache hilang bersama job, tidak bocor antar job/antar pelanggan/antar database, tidak ada pertumbuhan memori tanpa batas.
//  - Dokumen yang dikirim ke Accurate TIDAK berubah sama sekali (hanya melewatkan pencarian yang hasilnya sudah diketahui).
//  - Bila data dihapus manual di Accurate di tengah job, `save.do` menolak dengan galat jelas ("… tidak ditemukan atau sudah dihapus") → baris gagal, Retry memakai sesi/cache baru.
//  - Dapat dimatikan tanpa rilis kode: env `ACCURATE_LOOKUP_CACHE=0` (default AKTIF).

type LookupKind = "item" | "customer" | "vendor";

const caches = new WeakMap<AccurateSessionContext, Map<string, unknown>>();

/** `ACCURATE_LOOKUP_CACHE` → `false` hanya untuk "0"/"off"/"false" (tanpa membedakan huruf besar-kecil); kosong/lainnya → aktif. */
export function parseLookupCacheEnabled(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  return !/^(0|off|false)$/i.test(raw.trim());
}

export function lookupCacheEnabled(): boolean {
  return parseLookupCacheEnabled((env as unknown as Record<string, string | undefined>).ACCURATE_LOOKUP_CACHE);
}

const keyOf = (kind: LookupKind, no: string) => `${kind}|${String(no).trim().toLowerCase()}`; // sama dengan kunci `runExclusive` (huruf kecil, tanpa spasi ujung)

export function lookupCacheGet<T>(ctx: AccurateSessionContext, kind: LookupKind, no: string): T | undefined {
  if (!lookupCacheEnabled()) return undefined;
  return caches.get(ctx)?.get(keyOf(kind, no)) as T | undefined;
}

export function lookupCacheSet<T>(ctx: AccurateSessionContext, kind: LookupKind, no: string, value: T): void {
  if (!lookupCacheEnabled()) return;
  let map = caches.get(ctx);
  if (!map) {
    map = new Map();
    caches.set(ctx, map);
  }
  map.set(keyOf(kind, no), value);
}

/** Hanya untuk tes/diagnostik. */
export function lookupCacheSize(ctx: AccurateSessionContext): number {
  return caches.get(ctx)?.size ?? 0;
}
