# Fase 20 — Unifikasi Alur Status Invoice → Pembayaran → Konfirmasi

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Pain point utama user di inisiatif Design System Admin (4 fase, 19-22):
status invoice/order yang tersebar di beberapa mapping lokal berbeda-beda
(kadang tanpa Badge sama sekali untuk `order.status`), dan admin tidak
pernah bisa melihat order yang sudah `paid`/`rejected`/`cancelled`/
`expired` lewat UI (`admin/orders` hardcode `status ?? "submitted"`
sebagai satu-satunya jalur). Fase ini memakai `StatusBadge`/
`status-badges.tsx` yang dibangun Fase 19 untuk menyatukan tampilan
status di titik-titik paling kritikal alur invoice→bayar→konfirmasi,
DAN memperbaiki gap fungsional admin/orders itu.

Referensi: ADR-0023, `docs/phases/phase-19-admin-design-system-fondasi.md`.

## Scope
- [x] `apps/api/src/routes/admin/orders.route.ts` — `GET /admin/orders`:
      hapus hardcode `status ?? "submitted"` sebagai SATU-SATUNYA jalur,
      query `status` sekarang enum tervalidasi (`pending`/`submitted`/
      `paid`/`rejected`/`cancelled`/`expired`/`all`), default TETAP
      `"submitted"` kalau kosong (perilaku lama tidak berubah)
- [x] `apps/web/app/admin/(protected)/orders/page.tsx` — `Tabs` untuk
      switch antar queue status (Menunggu Verifikasi/Lunas/Ditolak/Semua),
      `StatusBadge domain="order"` (sebelumnya TIDAK ADA badge order sama
      sekali), migrasi ke `DataTable`+`PageHeader`+`Textarea` (Fase 19)
- [x] `apps/web/app/app/(protected)/billing/page.tsx` — `INVOICE_STATUS`
      lokal dihapus, pakai `StatusBadge domain="invoice"`,
      `currencyFormatter` dari `lib/utils.ts`
- [x] `apps/web/app/app/(protected)/billing/[orderId]/pay/page.tsx` —
      badge hardcoded per-cabang (termasuk "✓ Lunas" vs "Lunas") diganti
      `StatusBadge domain="order"`, TAMBAH penanganan status
      `cancelled`/`expired` yang sebelumnya tidak dirender sama sekali
      (blank di bawah kartu total)

## Referensi
- ADR: `docs/decisions/adr-0023-admin-design-system.md`
- Architecture doc: `docs/architecture/architecture-payment.md` (tidak
  ada perubahan skema — murni presentasi + 1 query filter baru)

## Keputusan Kecil Selama Eksekusi
- **Tabs cuma 4 pilihan** (Menunggu Verifikasi/Lunas/Ditolak/Semua),
  BUKAN 1 tab per status (`pending`/`cancelled`/`expired` tidak dapat
  tab sendiri) — status itu jarang terjadi di alur normal (order manual
  langsung `submitted` begitu bukti diupload); tab "Semua" tetap
  mencakupnya tanpa bikin UI terlalu ramai untuk skenario yang sangat
  jarang muncul. Bisa ditambah tab spesifik nanti kalau volume order
  bertambah dan admin butuh filter lebih presisi.
- **`admin/orders` default query TANPA `status` TETAP `"submitted"`**
  (bukan `"all"`) — perilaku lama sengaja dipertahankan biar tidak ada
  breaking change diam-diam untuk siapa pun yang sudah biasa buka
  halaman ini (queue tetap fokus ke yang butuh aksi), pindah ke tab lain
  adalah pilihan eksplisit sekarang, bukan default baru.
- **Order status invoice/order TIDAK digabung jadi 1 status buatan** —
  di halaman manapun kedua status muncul, masing-masing ditampilkan
  dengan `domain` yang benar (`invoice` vs `order`) dari registry yang
  SAMA, bukan status baru "gabungan" (sesuai ADR-0023 § Decision 2).
- **Order `cancelled`/`expired` ditambah penanganan di halaman bayar**
  (sebelumnya kosong sama sekali) — perpanjangan wajar dari "unifikasi
  status", bukan expansion scope: konsekuensi langsung memakai
  `StatusBadge` yang sekarang mencakup SEMUA status `order`, bukan
  cuma yang sudah ada cabang render-nya.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan (self-review — 1 endpoint backend
      diperluas, tetap permission `orders.manage`, query tervalidasi
      enum TypeBox, tidak ada ownership/info-disclosure baru: endpoint
      ini memang admin-only, semua order customer manapun boleh admin
      lihat)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Verifikasi visual browser sungguhan BELUM dilakukan fase ini** —
  sesuai rencana 4-fase, itu WAJIB di akhir Fase 21 (rollout penuh),
  bukan di sini. Kode+test sudah diverifikasi (4 test baru
  `admin/orders.route.test.ts`), tapi tampilan Tabs/DataTable/StatusBadge
  di browser belum pernah dilihat langsung.
- **Tab status tetap terbatas 4 pilihan** (lihat Keputusan Kecil) — kalau
  ke depan admin butuh lihat `pending`/`cancelled`/`expired` sebagai tab
  terpisah (bukan cuma lewat "Semua"), itu perubahan kecil menambah
  entry di `QUEUE_TABS`, bukan bagian fase ini.

## Ringkasan Hasil
Backend `GET /admin/orders` tidak lagi hardcode `status="submitted"`
sebagai satu-satunya jalur — query `status` sekarang enum tervalidasi
(termasuk `"all"`), default tetap `"submitted"` (perilaku lama utuh).
4 test baru mengkonfirmasi: default tidak ikut order `paid`, filter
`status=paid` mengembalikan order yang sudah dikonfirmasi (sebelumnya
TIDAK BISA dilihat lewat UI sama sekali), `status=all` mencampur
beberapa status sekaligus, dan status tak dikenal ditolak `422`.

Frontend: halaman `admin/orders` dirombak pakai primitif Fase 19 —
`Tabs` sebagai pemilih antrian (Menunggu Verifikasi/Lunas/Ditolak/Semua),
`DataTable` (sorting+pagination bawaan, pertama kalinya `@tanstack/
react-table` benar-benar dipakai di project ini), `StatusBadge
domain="order"` (sebelumnya order TIDAK PERNAH punya badge sama sekali
di halaman manapun). Halaman `billing/page.tsx` dan
`billing/[orderId]/pay/page.tsx` (customer-facing) migrasi dari
`INVOICE_STATUS` lokal dan badge hardcoded per-cabang ke `StatusBadge`
dari registry bersama — menghilangkan divergensi kosmetik "Lunas" vs
"✓ Lunas" untuk konsep yang sama, sekaligus menambah penanganan status
`cancelled`/`expired` yang sebelumnya tidak dirender apa pun (gap kecil
yang ketahuan justru karena registry sekarang eksplisit mencakup SEMUA
status `order`, bukan cuma yang sudah ada cabang manualnya).

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite API
155 pass/2 skip/0 fail (4 baru), security review self-review 0 temuan.
Invoice dan order TETAP 2 domain terpisah secara sengaja (bukan digabung
jadi status buatan) — yang disatukan adalah SUMBER label/warna, sesuai
keputusan ADR-0023.

Verifikasi visual browser (Tabs, DataTable, StatusBadge di halaman
sungguhan) masih tertunda sampai Fase 21 selesai — 2 fase lagi
(21: rollout ke semua halaman admin, 22: account self-service) sebelum
inisiatif ini genap 4 fase.
