# Fase 223 — Retry otomatis galat sementara HTTP 503 Accurate (jeda per koneksi)

**Status:** Done sisi kode (belum dirilis)
**Mulai:** 2026-11-17
**Selesai:** 2026-11-17 (kode); verifikasi produksi menunggu rilis

## Tujuan
Batch Sales Invoice besar pelanggan (`b509f504`, 5.997 baris, 2026-11-17) menghasilkan 376+ baris gagal karena Accurate membalas HTTP 503 bergelombang. 503 ini ditolak dalam 6–60 ms (dokumen tidak tersimpan) sehingga aman diulang, tetapi kode lama hanya me-retry galat 429. Fase ini membuat 503 dicoba ulang otomatis dengan jeda yang menahan seluruh koneksi, supaya pelanggan tidak perlu menekan Retry berkali-kali.

## Scope
- [x] `isAccurateUnavailableError` — hanya 503 polos (body kosong/non-JSON)
- [x] Jadwal jeda per koneksi 5/15/45/120×5 dtk + jitter; jeda berlaku untuk semua jalur paralel koneksi
- [x] Pemutus: setelah jadwal habis tanpa sukses, request berikutnya gagal cepat; sukses mereset
- [x] Log `accurate_unavailable_backoff` + header respons 503 (allowlist) di `accurate_request`
- [x] Tes (limiter + http), typecheck, lint, security review

## Referensi
- `docs/architecture/architecture-import-capacity.md` § 17
- Kode: `apps/api/src/lib/accurate-rate-limiter.ts`, `apps/api/src/lib/accurate-http.ts`

## Keputusan Kecil Selama Eksekusi
- Hanya 503 yang di-retry (bukan 502/504): 504/502 pada `save.do` bisa berarti Accurate sempat memproses → risiko dokumen ganda. Usulan awal menyebut 502/503/504; dipersempit karena bukti aman hanya ada untuk 503 (6–60 ms).
- 503 berpesan logis dari Accurate (`s:false` + detail) tidak dianggap sementara.
- Pemutus ditambahkan setelah security review (temuan desain): tanpa itu outage panjang membuat batch merayap puluhan jam dan melewati expire job 2 jam.
- `Retry-After` dicatat tetapi belum dipakai sebagai jeda (belum pernah teramati).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline, skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (tidak ada; 1 temuan desain Medium → pemutus, diperbaiki)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Efek di produksi belum terukur (perlu rilis + batch besar nyata).
- Jadwal ±11 menit adalah tebakan terukur dari satu kejadian; bisa ditala (`setUnavailableBackoffForTest` hanya untuk tes — belum ada env).
- 502/504 tidak di-retry (lihat atas).
- Batch yang SUDAH berjalan saat rilis tidak terbantu; baris gagal lama tetap perlu Retry manual (aman: nomor sudah ada diadopsi).
- Penyebab 503 di sisi Accurate belum diketahui; header yang kini dicatat diharapkan menjawabnya.

## Ringkasan Hasil
Limiter me-retry 503 polos dengan jeda adaptif per koneksi dan pemutus. Tes: limiter + http 33 lulus, 70 tes terkait lulus; typecheck 0 error; lint bersih. Suite penuh API belum dijalankan (DB dev bersama) — perubahan terbatas di 2 file lib.
