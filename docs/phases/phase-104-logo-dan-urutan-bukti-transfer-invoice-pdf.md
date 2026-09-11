# Fase 104 — Logo Perusahaan & Urutan Bukti Transfer di PDF Invoice

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Lanjutan Fase 103 (logo perusahaan di header dashboard) — sekarang giliran
PDF invoice (`GET /invoices/:id/pdf`, `@react-pdf/renderer`, ADR-0021).
Client minta 2 perubahan:
1. Header PDF sekarang tulisan nama perusahaan (`company.name`) DIGANTI
   logo perusahaan (`company.logo`), alamat tetap di bawahnya seperti
   sekarang.
2. Urutan section diubah jadi: Status Pembayaran → Detail Invoice (tabel
   item + total) → Bukti Transfer (sebelumnya Bukti Transfer nempel
   dengan Status Pembayaran, DI ATAS tabel — bukan di bawahnya).

## Scope
- [x] `apps/api/src/lib/invoice-pdf.tsx` — header: logo gantikan nama teks
      (fallback ke nama kalau logo tidak ada/gagal decode); pindah blok
      Bukti Transfer ke bawah tabel+total (sebelum footer instruksi
      pembayaran).
- [x] `apps/api/src/routes/invoices.route.ts` — fungsi baru
      `getCompanyLogoAsPng()` (lihat § Keputusan Kecil — bug ditemukan
      di tengah eksekusi, bukan scope awal).
- [x] Typecheck + test + security review.
- [x] Verifikasi visual (generate PDF asli lewat dev server yang sudah
      jalan, baca isi PDF-nya).
- [x] Update `docs/architecture/architecture-invoice.md`.
- [x] Update `docs/PROGRESS.md`.

## Referensi
- `docs/architecture/architecture-invoice.md` § "PDF Generator"
- `docs/phases/phase-94-invoice-detail-status-bukti-transfer.md` — fase
  yang PERTAMA KALI nambah status pembayaran + bukti transfer ke PDF
  (urutan lama: status+proof menyatu, DI ATAS tabel)
- `docs/phases/phase-103-logo-header-footer-copyright.md` — fase
  sebelumnya, nambah logo ke header DASHBOARD (bukan PDF)

## Keputusan Kecil Selama Eksekusi
- **Bug ditemukan saat verifikasi visual, di luar scope awal (2 poin
  di atas), tapi WAJIB diperbaiki sebelum fase ini bisa ditutup**:
  `settings.company.logo` SELALU disimpan `.webp` (§
  `admin/branding.route.ts`, re-encode paksa via sharp — konsisten sejak
  Fase 12), tapi `@react-pdf/image` **tidak bisa decode webp** (masalah
  yang SAMA PERSIS sudah pernah ditangani untuk bukti transfer di Fase 94,
  `getProofImageAsPng`). Karena perubahan poin 1 di atas membuat nama
  teks disembunyikan SETIAP kali `logoUrl` ada (bukan lagi tampil
  berdampingan), logo yang gagal di-decode react-pdf membuat header
  jadi **kosong total** (bukan cuma tampilan lama tanpa logo) — regresi
  yang lebih buruk dari sebelum perubahan.
  - **Fix**: fungsi baru `getCompanyLogoAsPng()` (`invoices.route.ts`,
    pola SAMA PERSIS `getProofImageAsPng`) — `fetch()` URL publik logo,
    convert ke PNG via `sharp`, hasil `Buffer` diteruskan ke
    `generateInvoicePdf()` sebagai field baru `logoImage` (top-level,
    sejajar `proofImage` — BUKAN lagi `company.logoUrl` string di
    `InvoicePdfData`, field itu dihapus dari tipe karena sudah tidak
    dipakai untuk render). Kegagalan fetch/decode logo di-`try/catch`,
    TIDAK menggagalkan generate PDF (fallback ke nama teks) — pola
    sama persis penanganan bukti transfer yang sudah ada.
  - **Beda dari `getProofImageAsPng`**: proof dibaca LANGSUNG dari MinIO
    (`minioClient.getObject`, object key privat), sedangkan logo di-`fetch()`
    lewat URL publiknya (bucket `facport-public` sudah public-read,
    tidak ada object key privat yang perlu di-resolve) — lebih sederhana,
    tidak perlu import `minioClient`/bucket constant baru di
    `invoices.route.ts`.
- Posisi Bukti Transfer final: SETELAH blok Totals, SEBELUM footer
  instruksi pembayaran (bukan di antara tabel dan totals) — dianggap
  "detail invoice" mencakup tabel+totals sebagai satu kesatuan visual.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`, 2x — sebelum
      & sesudah fix bug logo webp)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — nol
      temuan di kedua review
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — tidak ada yang ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada test otomatis yang memverifikasi ISI VISUAL PDF (logo
  benar-benar tampil, urutan section benar) — `invoices.route.test.ts`
  cuma cek status/content-type/magic bytes `%PDF-` (pola lama, PDF
  binary tidak praktis di-diff pixel-by-pixel di test, § komentar
  di file itu). Diverifikasi MANUAL dengan generate PDF asli dari dev
  server (invoice ber-proof sungguhan di dev DB) dan membaca isi
  teks+gambarnya langsung.
- Kalau admin belum pernah upload logo, header tetap fallback ke nama
  teks (`company.name`) — sesuai desain awal Fase 15 (bukan regresi).

## Ringkasan Hasil
- Header PDF invoice sekarang tampilkan logo perusahaan (`company.logo`)
  menggantikan tulisan nama, alamat tetap di bawahnya — diverifikasi
  render benar (logo "fac institute" muncul, sebelumnya blank karena
  bug webp yang ditemukan & diperbaiki di fase ini).
- Urutan PDF sekarang: Header (logo+invoice info) → Ditagihkan Kepada →
  Status Pembayaran → Detail Invoice (tabel+total) → Bukti Transfer →
  Footer (instruksi pembayaran, kalau ada) — diverifikasi lewat PDF
  asli invoice `INV/2026/09/0108` (status Lunas + bukti transfer BI
  Fast asli di dev DB).
- Fix tambahan (di luar 2 poin scope awal, ditemukan & diperbaiki di
  fase ini): logo perusahaan (selalu `.webp`) di-convert ke PNG
  server-side sebelum di-embed ke PDF, sama seperti bukti transfer sejak
  Fase 94 — `@react-pdf/image` tidak bisa decode webp sama sekali.
- Typecheck 0 error, test suite penuh API 654 pass/0 fail (termasuk
  9 test `invoices.route.test.ts` yang menyentuh generate PDF), security
  review nol temuan (2x).
- **BELUM di-release** sesuai standing rule (2026-09-11) — commit+push
  ke `develop` saja.
