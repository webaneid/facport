# Fase 215 — Kecepatan import: cache pencarian data master + memori per baris

**Status:** In Progress — kode & unit test selesai, terukur ke Accurate asli (DB uji "facport") 2026-11-06; belum dirilis
**Mulai:** 2026-11-06
**Selesai:** -

## Tujuan
Keluhan pengguna: Facport baru terasa lebih lambat. Laboratorium kecepatan (`docs/architecture/architecture-import-speed-lab.md`) menemukan bahwa TIAP faktur mencari ulang pelanggan/vendor dan tiap kode barang di Accurate (k + 2 permintaan per faktur Sales Invoice, tanpa cache lintas faktur), padahal hasilnya sudah diketahui dari faktur sebelumnya dalam batch yang sama. Akibatnya (1) ±35% waktu per faktur habis untuk pencarian berulang, (2) paralelisme (`IMPORT_GROUP_PARALLELISM`) tidak berguna karena pembatas 8 req/dtk sudah penuh oleh pencarian.

## Scope
- [x] `lib/accurate-lookup-cache.ts`: cache HASIL POSITIF per objek sesi (`WeakMap`, hilang bersama job), kunci huruf kecil + tanpa spasi ujung (sama dengan `runExclusive`).
- [x] `findOrCreateItem`, `findOrCreateCustomer`, `findOrCreateVendor` memakai cache; update akun piutang/hutang pelanggan/vendor yang sudah ada tetap dikirim bila nilainya berbeda dari yang sudah diterapkan di sesi ini.
- [x] Sakelar `ACCURATE_LOOKUP_CACHE` (default aktif; `0`/`off`/`false` = perilaku lama) di `lib/env.ts` + `.env.production.example`.
- [x] 10 unit test (`accurate-lookup-cache.test.ts`).
- [x] Ukur ke Accurate asli: berurutan 1,17 → 1,75 faktur/dtk; paralel 8 1,59 → 6,94; permintaan/faktur 5,0 → ±1,1 (lab § 13).
- [x] Memori per baris: muat per halaman (50 baris), hanya kolom yang dipetakan, satu salinan, `finalRows` hanya id+status — puncak RSS 8 akun × 9.600 baris lebar 383 → 223 MB, kecepatan sama (lab § 16). Regresi Accurate asli 300/300 sukses.
- [x] Uji lintas modul via worker asli (lab § 17–20): PI 5,8×, SR 2,8–3,8×, PP 3,2–3,5×, SI 6,1×; semua 100% sukses; rekomendasi `IMPORT_GROUP_PARALLELISM=4`.
- [ ] Cache untuk pencarian berulang lain (klasifikasi data, PIC Work Order, dokumen sumber) — fase lanjutan.
- [x] Uji ujung-ke-ujung lewat worker asli (lab § 14): 100 faktur × 3 baris, 89 s → 60 s (cache) → 31,7 s (+paralel 2) → 16,9 s (+paralel 4) → 14,7 s (+paralel 6); semua sukses, tanpa Retry.
- [x] CPU/memori worker banyak akun serentak (lab § 15): CPU bukan penghambat; memori batas nyata (9.600 baris lebar serentak = 383–409 MB > mem_limit 384m); paralel per akun nyaris tidak menambah memori.
- [ ] Rilis; lalu aktifkan `IMPORT_GROUP_PARALLELISM` bertahap di produksi (keputusan terpisah, rencana di import-capacity § 11) dan ukur memori worker.

## Keputusan Kecil Selama Eksekusi
- Hanya hasil POSITIF yang dicache; "tidak ketemu" tidak pernah disimpan (tidak boleh salah mengira data tidak ada / melewatkan pembuatan).
- Lingkup = objek `ctx` sesi: tidak ada cache lintas job/pelanggan/database, tidak ada pertumbuhan memori tanpa batas.
- Bila data dihapus manual di Accurate di tengah job, `save.do` menolak dengan galat jelas → baris gagal → Retry memakai sesi/cache baru (risiko diterima, sangat jarang).
- Dokumen yang dikirim ke Accurate TIDAK berubah (aturan: hanya cara pengiriman yang boleh diadaptasi).

## Tinjauan keamanan (inline; tidak ada endpoint/skema/query baru)
Tidak ada route, input client, SQL, secret, atau penyimpanan persisten baru. Satu env opsional (boolean-ish). Cache hanya memuat id/nama master data milik sesi Accurate yang sama (tidak lintas pelanggan). Lolos.

## Referensi
- `docs/architecture/architecture-import-speed-lab.md` § 9, § 11, § 13
- `docs/architecture/architecture-import-capacity.md`
