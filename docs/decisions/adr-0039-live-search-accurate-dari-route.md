# ADR-0039: Live-Search Accurate Sinkron dari HTTP Route (Bukan Job Worker)

**Status:** Accepted
**Tanggal:** 2026-09-29

## Context
Sejak Fase 159, filosofi SEMUA modul Facport (23 modul Excel-upload +
AutoProduksi form-based) adalah "TIDAK ADA panggilan Accurate langsung dari
HTTP route" — SEMUA panggilan `openAccurateSession()` terjadi dari DALAM job
worker (`workers/index.ts`), bukan sinkron dari request browser. Alasan
awal: hindari request HTTP blocking menunggu API eksternal yang lambat/tidak
stabil, konsisten pola "tugas berat lewat job queue" (§ CLAUDE.md root).

Evaluasi client (2026-09-29) atas modul AutoProduksi minta search-as-you-type
untuk memilih Barang Jadi/Bahan Baku (`item/list.do`) dan Akun Perantara
(`glaccount/list.do`) di form Formula, dengan autofill kode+satuan+nama
begitu dipilih — supaya user tidak perlu ketik kode Accurate secara manual
dan salah ketik.

Search-as-you-type SECARA SIFATNYA tidak bisa lewat job queue — user
menunggu hasil ketikannya SAAT ITU JUGA, tidak ada "hasil nanti lewat
notifikasi" yang masuk akal untuk interaksi UI semacam ini.

## Decision
Izinkan panggilan Accurate SINKRON dari HTTP route, TERBATAS untuk endpoint
READ-ONLY search/lookup (bukan operasi tulis apa pun), dengan mitigasi:
- **Rate limit** per endpoint (`rateLimitPlugin`, reuse yang sudah ada) —
  cegah 1 user spam request lewat search-as-you-type yang terlalu agresif
  atau abuse kuota API Accurate.
- **Timeout wajar** (`AbortSignal.timeout()`, § implementasi) — request
  yang menggantung ke Accurate tidak boleh menggantung request Facport
  tanpa batas.
- **Error Accurate/timeout → HTTP 502** (bukan 500 mentah) — beda jelas
  antara "server Facport error" vs "Accurate yang lambat/gagal".
- Endpoint SELALU READ-ONLY (`GET`, tidak pernah menulis apa pun ke
  Accurate) — kategori risiko jauh lebih rendah dari operasi transaksi
  (`item-adjustment/save.do` dkk yang TETAP lewat job worker, tidak
  berubah).
- Reuse `openAccurateSession()` (`lib/accurate-session.ts`) APA ADANYA —
  fungsi itu sendiri sudah generic (decrypt token + `openDatabase()`),
  TIDAK terikat worker secara teknis; pembatasannya selama ini murni pola
  desain, bukan batasan fungsi.

## Alternatif yang Dipertimbangkan
- **Tetap TANPA live-search, cache lokal daftar Item/Akun** (sync
  berkala via job) — ditolak: perlu job sync + tabel baru + strategi
  invalidasi cache, jauh lebih kompleks dari sekadar proxy read-only,
  dan data bisa basi (Item baru dibuat di Accurate tidak langsung
  kelihatan sampai job sync jalan).
- **Polling job + WebSocket/SSE untuk hasil search** — ditolak: over-
  engineering untuk kebutuhan search-as-you-type yang butuh respons
  dalam hitungan detik, bukan menit.

## Konsekuensi
- **Positif**: UX form Formula jauh lebih baik (autofill, cegah salah
  ketik kode), tanpa perlu infrastruktur cache/sync baru.
- **Trade-off diterima**: latency request Facport untuk endpoint ini
  bergantung pada responsivitas Accurate saat itu — dimitigasi timeout +
  rate limit, TIDAK dimitigasi retry/circuit-breaker (di luar scope,
  revisit kalau ternyata jadi masalah nyata di production).
- Pola ini TIDAK menggantikan filosofi "Accurate validasi saat SAVE" untuk
  operasi TULIS — `item-adjustment/save.do` dkk tetap 100% lewat job
  worker seperti sebelumnya, ADR ini CUMA untuk endpoint search read-only.
- Endpoint baru (`GET /accurate/items/search`, `GET /accurate/glaccounts/search`)
  dirancang GENERIC (bukan di-prefix `/autoproduksi/`) — modul form-based
  lain di masa depan yang butuh pola serupa reuse endpoint yang sama,
  bukan bikin ulang per modul.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-0039" di file baru itu.
