# Fase 08 — Purchase Invoice: Update Faktur Existing (Retry Cerdas)

**Status:** Done
**Mulai:** 2026-08-28
**Selesai:** 2026-08-28

## Tujuan
Fase 06 (multi-item per faktur) menyelesaikan grouping untuk batch yang
diproses SETELAH fase itu deploy. Batch LAMA yang sudah kadung punya 1
baris `success` + baris `failed` lain (Bill No sama, ditolak Accurate
sebagai duplikat) tidak ikut diperbaiki — retry biasa tetap mencoba CREATE
baru dan tetap ditolak. Client menegaskan perbaikan HARUS lewat sistem
(Retry existing jadi pintar), bukan intervensi manual ke data production
— lihat ADR-0012 untuk riset+bukti empiris bahwa `save.do` mendukung mode
update/append.

## Scope
- [x] `lib/import-mapping/purchase-invoice.mapping.ts`: `billNumberColumnOf()`
      diexport; extract `buildDetailItemFromRow()` dari isi `.map()`
      `buildPurchaseInvoicePayload` (logic sama, dipakai ulang jalur
      create & update).
- [x] `lib/accurate-purchase-invoice.ts`: fungsi baru `getPurchaseInvoiceDetail()`
      — `GET detail.do`, pakai `parseAccurateEnvelope` (bukan
      `parseAccurateSaveEnvelope`).
- [x] `workers/index.ts`: fungsi baru `findExistingAccurateInvoiceId()`
      (query lintas-batch, parameter binding) + `appendToExistingPurchaseInvoice()`
      (safety check vendor-match, duplicate-guard per item, idempotent
      kalau semua item sudah ada). Branch di loop grup `purchase_invoice`:
      cek existing dulu sebelum CREATE.
- [x] Test regresi `purchase-invoice.mapping.test.ts` untuk `buildDetailItemFromRow`.
- [x] Verifikasi NYATA: retry baris 2/4/6 batch `8b622538` (akun
      `user1@fasport.com`) via UI/API sungguhan setelah deploy.

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Update Faktur Existing / Retry Cerdas (Fase 08)"
- ADR: `docs/decisions/adr-0012-purchase-invoice-update-existing.md`
- Fase sebelumnya: `docs/phases/phase-06-purchase-invoice-multi-item.md` (ADR-0011)
- Insiden nyata pemicu: batch `8b622538`, akun `user1@fasport.com`, Data
  Usaha "PT Frozen Food", faktur Accurate `#150`

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web, 0 error
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
      (isolasi subscriptionId lewat `batch.subscriptionId` dikonfirmasi
      aman, sudah dijaga ownership check di endpoint retry existing yang
      tidak disentuh fase ini; `sql` tag terkonfirmasi parameter binding,
      bukan concat)
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [x] **Divalidasi ke akun Accurate Online NYATA** — retry baris 2/4/6
      batch `8b622538` (akun `user1@fasport.com`, Data Usaha "PT Frozen
      Food") lewat tombol Retry sungguhan di `app.ane.web.id`. Hasil: 6/6
      baris `success`, 0 gagal. Dikonfirmasi ULANG via `detail.do` fresh
      langsung ke Accurate (bukan cuma percaya status DB lokal): faktur
      #200 dan #250 masing-masing SEKARANG punya 2 `detailItem` nyata
      (item lama `100009` tetap ada + item baru `100002` bertambah).

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Tidak ada UI eksplisit yang membedakan "faktur baru dibuat" vs "faktur
  existing di-update" — user cuma lihat hasil `success` dengan
  `accurateTransactionId` yang sama seperti baris lain di grup. Bisa jadi
  polish UI terpisah kalau dibutuhkan.
- Safety check vendor-match menolak retry kalau vendor faktur existing
  sudah diubah manual di Accurate (di luar Facport) — fail-safe by
  design, bukan bug (lihat ADR-0012 § Konsekuensi).

## Ringkasan Hasil
Retry pada batch `8b622538` (3 baris gagal sejak SEBELUM Fase 06 ada,
`8b622538`/`user1@fasport.com`/"PT Frozen Food") sekarang berhasil PENUH —
6/6 baris `success`, 0 gagal. Baris yang dulu ditolak Accurate sebagai
duplikat nomor faktur ("Sudah ada data lain dengan No Form...") sekarang
otomatis di-append sebagai item baru ke faktur existing yang sudah ada,
tanpa intervensi manual ke data production — sesuai instruksi eksplisit
client.

**Bug ditemukan & diperbaiki SAAT verifikasi nyata** (bukan cuma di unit
test): field vendor di response `detail.do` Accurate yang sebenarnya
adalah `vendor.vendorNo`, BUKAN `vendor.no` seperti draf awal
`getPurchaseInvoiceDetail()` — safety check vendor-match jadi selalu
gagal (vendor terbaca `""` kosong) sampai field ini dikoreksi. Ditemukan
lewat inspeksi raw JSON `detail.do` NYATA (bukan asumsi/dokumentasi),
langsung dari faktur #150 di server presentasi.

**Diverifikasi PENUH lewat 2 lapis**: (1) status `import_batch_rows` di
DB Facport — semua `success`; (2) fetch ULANG `detail.do` langsung ke
Accurate untuk faktur #200 dan #250 — masing-masing `detailItem.length`
NAIK dari 1 jadi 2 (item lama `100009` dipertahankan, item baru `100002`
bertambah, cocok persis dengan desain ADR-0012). Ini standar verifikasi
yang sama dipakai Fase 02/05/06 — tidak cukup percaya status "success" di
DB lokal saja.

**Gap operasional ketemu di proses ini** (di luar scope kode fase ini,
dicatat di `docs/lessons-learned.md`): CI auto-deploy (`deploy.yml`)
TERNYATA tidak pernah benar-benar jalan sejak awal — secret
`SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` di GitHub Actions tidak
pernah diisi, jadi step `deploy-to-server` selalu gagal diam-diam
(`error: missing server host`) walau `build-and-push` selalu sukses.
Semua deploy nyata sejauh ini (termasuk fase ini) dilakukan MANUAL lewat
SSH langsung. Deploy manual fase ini juga sempat bikin outage singkat
(502) karena `docker compose up -d` pertama dijalankan tanpa
`-f docker-compose.override.yml`, membuat container naik TANPA port
mapping — diperbaiki dalam hitungan menit dengan menambahkan flag file
override yang hilang.

Detail teknis lengkap → ADR-0012 dan § Scope di atas. Hasil test: 4 test
baru (regresi refactor + billNumberColumnOf), full suite 61/61, typecheck
0 error, security review 0 temuan.
