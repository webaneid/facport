# ADR-0006: Integrasi API Accurate Online (OAuth & Bulk Import)

**Status:** Accepted
**Tanggal:** 2026-08-19

## Context
Fungsi inti Facport adalah menjembatani data transaksi dari file Excel ke
Accurate Online — ini bukan fitur tambahan, tapi seluruh alasan aplikasi ini
ada. Itu berarti **apps/api WAJIB terintegrasi ke API resmi Accurate Online**
(dokumentasi: https://account.accurate.id/developer/api-docs.do) untuk dua
hal:
1. **Verifikasi token/OAuth** — user (staf akuntansi/owner) menghubungkan
   akun Accurate Online mereka ke Facport.
2. **Bulk import data** — hasil parsing file Excel (Pesanan Penjualan,
   Faktur Pembelian, Jurnal Umum, dst — lihat daftar modul di
   `docs/PROGRESS.md`) dikirim ke Accurate lewat API mereka, per baris/batch.

Karena ini dependency eksternal yang seluruh proses bisnis Facport
bergantung padanya, pola integrasinya WAJIB didokumentasikan sebagai
keputusan arsitektur eksplisit — bukan diimplementasi ad-hoc per modul yang
akhirnya beda pola tiap developer/tiap sesi.

## Decision
- **Auth ke Accurate**: OAuth 2.0 sesuai spesifikasi resmi Accurate Online.
  Token (access token + refresh token) disimpan **terenkripsi** di tabel
  `accurate_connections`, di-refresh otomatis lewat job terjadwal (§
  `architecture-jobs.md`) sebelum expired — bukan menunggu request user gagal
  baru refresh reaktif.
- **Bulk import**: dieksekusi lewat **background job** (pg-boss, §
  `architecture-jobs.md`), TIDAK sinkron di request handler — import ribuan
  baris Excel bisa memakan waktu lama dan harus tahan terhadap
  partial-failure (baris ke-500 gagal tidak boleh bikin baris 1-499 yang
  sudah sukses ikut hilang/tidak tercatat).
- **Rate limit Accurate API**: WAJIB dihormati via throttling di sisi client
  (lihat detail teknis & mapping kolom Excel→field Accurate di
  `docs/architecture/architecture-accurate-integration.md`) — jangan asumsikan
  bisa fire semua request bersamaan.
- **Import mapping**: kolom Excel yang diupload user WAJIB dipetakan ke field
  yang dibutuhkan endpoint Accurate lewat lapisan mapping eksplisit
  (`import mapping`, lihat `docs/glossary.md`), bukan asumsi nama kolom
  Excel selalu sama persis dengan nama field Accurate.
- **Idempotency**: tiap baris import dicatat status-nya (`pending` |
  `success` | `failed`) supaya retry/resume batch yang gagal di tengah jalan
  tidak double-create transaksi di Accurate.

## Alternatif yang Dipertimbangkan
- **Sinkron di request handler** (proses import langsung saat user klik
  "Import") — ditolak, import ribuan baris bisa timeout request dan tidak
  ada cara resume kalau gagal di tengah.
- **Simpan token Accurate plaintext** — ditolak, ini kredensial akses penuh
  ke data keuangan user di Accurate Online, harus dienkripsi at-rest (lihat
  `architecture-security.md` §1).
- **Parsing Excel dan validasi mapping di frontend** — ditolak, validasi
  bisnis (format sesuai field Accurate, dsb) harus di backend supaya
  konsisten kalau nanti ada klien lain (bukan cuma web), sejalan dengan
  ADR-0001 (API sebagai satu-satunya source of truth).

## Konsekuensi
- Skema DB baru: `accurate_connections` (token OAuth per user/perusahaan),
  `import_batches` + `import_batch_rows` (status tiap baris impor) — detail
  di `docs/architecture/architecture-accurate-integration.md`.
- Fase 02 (Modul Pembelian — Purchase Invoice,
  `docs/phases/phase-02-modul-pembelian-purchase-invoice.md`) adalah fase
  pertama yang benar-benar mengimplementasi pola ini end-to-end — modul/
  sub-modul lain sengaja di-pending sampai fase ini solid (lihat
  `docs/PROGRESS.md`).
- Kredensial akun testing Accurate (untuk baca dokumentasi API/eksplorasi
  developer portal) TIDAK disimpan di kode atau file mana pun di repo ini —
  lihat `docs/architecture/architecture-security.md` §1.

## Referensi
- Detail teknis (OAuth flow, rate limit, skema mapping) →
  `docs/architecture/architecture-accurate-integration.md`
- Background job untuk proses import → `docs/architecture/architecture-jobs.md`
- Enkripsi token → `docs/architecture/architecture-security.md`
