# ADR-0029: Notifikasi In-App — Fan-Out per Penerima (Bukan Shared + Read-Receipt)

**Status:** Accepted
**Tanggal:** 2026-09-06

## Context
User minta lonceng notifikasi (`Topbar`, sengaja `disabled` sejak
ADR-0024) diaktifkan jadi sistem sungguhan — mencakup notifikasi event
sistem (checkout, bukti transfer, verifikasi pembayaran, trial) DAN
pengumuman/broadcast custom dari admin ke customer. Broadcast berarti 1
notifikasi bisa ditujukan ke BANYAK penerima sekaligus (semua customer,
atau customer dengan modul tertentu aktif) — perlu keputusan model data:
simpan 1 baris per PENERIMA (duplikasi konten per user), atau 1 baris
untuk KONTEN broadcast + tabel terpisah untuk status baca per user.

## Decision
**Fan-out — 1 row `notifications` per penerima**, baik untuk notifikasi
event sistem (1 penerima) maupun broadcast (N penerima, masing-masing
dapat baris sendiri dengan `sourceAnnouncementId` menunjuk ke 1 baris
`announcements` yang menyimpan konten aslinya untuk keperluan admin
melihat riwayat/reach). Query "notifikasi saya" jadi 1 SELECT sederhana:
`WHERE userId = me ORDER BY createdAt DESC` — sama persis untuk kedua
sumber (event sistem maupun broadcast), tanpa UNION/JOIN silang tabel.

## Alternatif yang Dipertimbangkan
- **Shared `announcements` + tabel `announcement_reads` (read-receipt
  per user)** — ditolak: bikin query "notifikasi saya" HARUS UNION 2
  sumber berbeda (notifikasi personal biasa + broadcast yang relevan
  buat user ini, di-JOIN LEFT ke read-receipt buat tahu status baca) —
  jauh lebih kompleks di kedua sisi (query backend maupun tipe response
  frontend), padahal skala project ini (bisnis SME, bukan platform
  dengan jutaan user) tidak butuh efisiensi storage itu.
- **Tabel notifikasi terpisah per tipe** (mis. `order_notifications`,
  `trial_notifications`) — ditolak: bell dropdown/arsip HARUS gabung
  SEMUA tipe dalam 1 timeline terurut waktu: 1 tabel generik dengan
  kolom `type` (pola sama `import_batches.module`/`orders.status` — 1
  tabel, dibedakan varchar+comment, BUKAN tabel per-jenis) lebih
  konsisten dengan gaya schema project ini.

## Konsekuensi
- Broadcast ke N customer = N INSERT (dilakukan via 1 bulk-insert
  Drizzle, bukan N query terpisah) — cukup cepat untuk skala project
  ini (ratusan/ribuan baris per broadcast, bukan jutaan), TAPI kalau
  basis customer nanti membesar jauh (jutaan), pola ini perlu direvisit
  lewat ADR baru (sama seperti keputusan pg-boss-vs-BullMQ yang eksplisit
  "revisit lewat ADR baru kalau skala menuntut").
- Admin melihat "berapa yang sudah baca pengumuman ini" tinggal
  `COUNT(*) FROM notifications WHERE sourceAnnouncementId=X AND isRead=true`
  — tidak perlu join tambahan.
- Update konten broadcast SETELAH terkirim (mis. admin sadar salah
  ketik) TIDAK otomatis ter-propagate ke baris yang sudah di-fan-out
  (masing-masing row punya salinan title/body sendiri) — dianggap
  BUKAN kebutuhan nyata sekarang (broadcast bersifat "kirim lalu
  selesai", bukan dokumen yang di-edit berulang); kalau nanti dibutuhkan,
  solusinya CUKUP simpan `title`/`body` di `notifications` sebagai
  SALINAN saat fan-out (sudah didesain begitu) — tidak perlu perubahan
  skema.

## Referensi
- Detail lengkap fitur → `docs/phases/phase-45-sistem-notifikasi.md`
- Skema & katalog tipe → `docs/architecture/architecture-notifications.md`
