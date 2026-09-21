# Fase 140 — Konteks Data Usaha Aktif di Gerbang Modul (Fix Upload Salah Perusahaan)

**Status:** Done
**Mulai:** 2026-09-21
**Selesai:** 2026-09-21

## Tujuan
Perbaiki bug: user dengan modul yang sama di >1 Data Usaha selalu
mendapat subscription TERBARU (bukan Data Usaha yang dipilih di sidebar)
pada semua endpoint import, sehingga upload bisa mendarat di Data Usaha
(dan koneksi Accurate) perusahaan yang salah. Detail diagnosis & keputusan
→ `docs/decisions/adr-0035-konteks-data-usaha-aktif-di-server.md`.

## Bukti Diagnosis (production, 2026-09-21, read-only)
- Batch `9642b936-…` (purchase_invoice) gagal "open-db.do … HTTP 401" pada
  koneksi Malaysia `a2a9e084-…` (status `expired`, `expires_at` masih 3 Okt
  → ditandai worker setelah 401, bukan kedaluwarsa waktu).
- User punya 15 koneksi Accurate untuk 2 perusahaan; 5 koneksi Malaysia
  dibuat dalam 32 detik (18 Sep) — 1 OAuth baru per modul.
- Subscription purchase_invoice: Malaysia dibuat 18 Sep 09:32, Maginet
  17 Sep 12:12 → `.find()` `createdAt DESC` selalu memilih Malaysia.
- 3 batch hari itu semua masuk Malaysia; koneksi Maginet baru
  dihubungkan ulang 21 detik sebelum batch ke-3.

## Scope
- [x] `apps/web/lib/api-client.ts`: `treaty()` opsi `headers` → kirim
      `X-Data-Usaha-Id` dari cookie `active_data_usaha_id` (browser saja)
- [x] `apps/api/src/lib/subscription-gate.ts`: `moduleAccess` — validasi
      header (milik/seat), saring per Data Usaha, fail-closed
      `409 DATA_USAHA_REQUIRED` kalau ambigu tanpa header, `403
      DATA_USAHA_FORBIDDEN` untuk Data Usaha bukan hak user
- [x] Frontend: tangani kode error baru dengan pesan jelas (arahkan ke
      "Ganti Data Usaha"), tanpa loop
- [x] Test regresi: 2 Data Usaha modul sama (header memilih benar;
      tanpa header → 409; header Data Usaha orang lain → 403; 1 Data
      Usaha tanpa header tetap jalan; member seat hanya Data Usaha
      tempat dia numpang)
- [x] Typecheck 0 error, test penuh pass, cleanup data test dev DB
- [x] Security review (subagent `security-auditor` — ini perubahan
      gerbang otorisasi)
- [x] Update `docs/lessons-learned.md` (koreksi kesimpulan insiden
      2026-09-17) dan `docs/PROGRESS.md`

## Referensi
- ADR: `docs/decisions/adr-0035-konteks-data-usaha-aktif-di-server.md`
- Arsitektur: `docs/architecture/architecture-user-tambahan.md` (Data Usaha/seat)

## Known Limitations (rencana)
- Batch lama yang salah-Data-Usaha tidak dimigrasi otomatis; butuh audit
  read-only (user-run) untuk customer lain dengan modul sama di >1 Data
  Usaha.
- Duplikasi koneksi Accurate (1 OAuth baru per modul untuk perusahaan yang
  sama, 15 koneksi/2 perusahaan) BELUM ditangani fase ini — fase terpisah
  (auto-reuse koneksi aktif untuk `accurateDbId` yang sama).
- Hipotesis "otorisasi baru membatalkan token lama di Accurate" belum
  terbukti; jangan dijadikan dasar keputusan sebelum diuji.

## Ringkasan Hasil
Gerbang `moduleAccess` sekarang menyaring subscription per Data Usaha lewat
header `X-Data-Usaha-Id` (divalidasi kepemilikan/seat via
`hasAccessToDataUsaha`, UUID dinormalisasi lowercase), fail-closed
`409 DATA_USAHA_REQUIRED` kalau modul ada di >1 Data Usaha tanpa header,
`403 DATA_USAHA_FORBIDDEN` untuk Data Usaha bukan hak user. Web mengirim
header dari cookie (divalidasi UUID, try/catch), toast global untuk 2 kode
baru (dedupe), reload otomatis kalau Data Usaha diganti dari tab lain.

Verifikasi: typecheck 0 error, lint bersih, API 1327 pass/0 fail (+14 test
baru), web 57 pass. Mutation check: 6 dari 8 test regresi inti GAGAL pada
kode gerbang lama (termasuk kasus insiden), lolos setelah perbaikan.

Security review (`security-auditor`): 0 Critical/High, 1 Medium, 6 Low —
tidak ada jalur akses lintas-tenant lewat header. Diperbaiki langsung:
Medium multi-tab (reload guard), Low unduh template kena 409 (pengecualian
GET template, ADR-0035 #4), decodeURIComponent tanpa try/catch, UUID
huruf besar, logika akses duplikat (pakai `hasAccessToDataUsaha`), toast
menumpuk. Tidak diubah: `allowedHeaders` CORS eksplisit (hardening
opsional; reflect aman karena origin di-whitelist, dan mengetatkan berisiko
memutus header lain yang dipakai web) — dicatat sebagai saran.

**Belum di-deploy ke production.** Setelah deploy, customer WAJIB hard-refresh
(bundle JS lama tidak membawa header; user multi-Data-Usaha di bundle lama
akan kena 409).
