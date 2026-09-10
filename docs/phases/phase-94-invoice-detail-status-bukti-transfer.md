# Fase 94 — Invoice: Icon Detail/Bukti Transfer + Status Pembayaran di View Detail & PDF

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
User laporan halaman `/admin/invoices` tidak punya cara melihat detail
invoice (item yang dibeli) maupun bukti transfer sama sekali — beda dari
`/admin/orders` yang sudah punya "Lihat Bukti". Permintaan user (2 bagian):
1. Invoice butuh icon mata (lihat detail) — biar admin bisa lihat "user ini
   beli apa"; icon bukti transfer pakai icon kartu/uang (BUKAN mata lagi,
   supaya tidak tertukar makna dengan icon detail).
2. Status pembayaran harus muncul di invoice view detail DAN saat invoice
   di-convert jadi PDF — dan bukti transfer harus "terhubung" (bisa
   dilihat) di kedua tempat itu juga.

Klarifikasi (AskUserQuestion sebelum eksekusi): "view detail invoice" yang
dimaksud adalah halaman admin Invoice yang **sudah ada** (`/admin/invoices`),
BUKAN dialog baru di `/admin/orders` atau halaman customer.

## Scope
- [x] `GET /admin/invoices` (`admin/invoices.route.ts`) — tambah field
      `orderStatus` (granular, dari `orders.status`) dan `hasProof`
      (boolean dari `!!order?.proofUrl`) ke response, lewat JOIN ke `orders`.
- [x] `apps/web/.../admin/invoices/page.tsx` — komponen baru
      `InvoiceDetailDialog`: icon mata ("Lihat Detail") di kolom Aksi, buka
      dialog berisi nama penagih, daftar item+harga ("Yang Dibeli"), badge
      status pembayaran (`orderStatus` kalau ada, fallback `invoice.status`),
      dan (kalau `hasProof`) tombol icon Banknote "Lihat Bukti Transfer"
      yang fetch `GET /admin/orders/:id/proof-url` (endpoint existing,
      reuse, sudah permission-gated `orders.manage`) lalu render gambar.
- [x] `GET /invoices/:id/pdf` (`invoices.route.ts`) — JOIN ke `orders`,
      kalau ada `proofUrl` fetch objeknya dari MinIO (`minioClient`
      internal, server-to-server) + convert webp→png (`sharp`, via fungsi
      baru `getProofImageAsPng` di `lib/order-payment.ts` — react-pdf/image
      TIDAK bisa decode webp), lalu embed ke PDF. Gagal fetch/convert
      TIDAK menggagalkan generate PDF (graceful fallback, cuma di-log).
- [x] `lib/invoice-pdf.tsx` — `InvoicePdfData` diperluas
      (`invoiceStatus`, `orderStatus`, `proofImage`), render section
      "Status Pembayaran" (badge berwarna, label Indonesia) + "Bukti
      Transfer" (gambar) di PDF, tepat di bawah "Ditagihkan kepada".
- [x] Test baru: 1 di `admin/invoices.route.test.ts` (orderStatus/hasProof
      null/false vs terisi), 2 di `invoices.route.test.ts` (PDF tetap 200
      dengan bukti transfer ASLI yang di-upload ke MinIO test, dan PDF
      tetap 200 — bukan 500 — kalau `proofUrl` ada tapi objek hilang).
- [x] Security review inline (skill `security-review`) — tidak ada temuan
      blocking, 1 catatan non-blocking didokumentasikan di bawah.

## Referensi
- Architecture doc: `docs/architecture/architecture-invoice.md`,
  `docs/architecture/architecture-payment.md`
- Fase sebelumnya yang relevan: Fase 93 (`minioPublicClient` vs
  `minioClient` — fase ini PERSIS pakai `minioClient` INTERNAL karena ini
  server-to-server read, bukan URL untuk browser).

## Keputusan Kecil Selama Eksekusi
- Icon "Lihat Bukti Transfer" (Banknote) ditaruh **di dalam** dialog Detail
  Invoice, bukan sebagai icon terpisah langsung di kolom Aksi tabel —
  supaya konteks "user beli apa" + "status pembayaran" + "bukti transfer"
  selalu dilihat BERSAMAAN (satu dialog), bukan 2 dialog lepas yang harus
  dibuka bergantian. Icon mata di kolom Aksi tetap SATU-SATUNYA entry
  point, konsisten dengan permintaan user ("icon mata untuk lihat detail").
- Status pembayaran PDF pakai mapping label/warna duplikat dari
  `apps/web/lib/status-badges.tsx` (domain "order"/"invoice") — TIDAK
  bisa di-import langsung (apps/api tidak boleh depend ke apps/web).
  Dicatat lewat komentar eksplisit di `invoice-pdf.tsx` supaya kalau label
  sumbernya berubah, developer tahu harus update juga di sini.
- Proof image dikonversi ke PNG (bukan dipertahankan webp) karena
  `@react-pdf/image` cuma decode PNG/JPEG. Konversi pakai `sharp` (sudah
  jadi dependency project, dipakai juga di `processProofImage`).
- Kegagalan fetch/convert bukti transfer untuk PDF TIDAK menggagalkan
  seluruh response PDF — invoice harus tetap bisa diunduh meski ada
  masalah MinIO sesaat; cuma di-log via `logger.error`, diverifikasi test.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, apps/api + apps/web)
- [x] Security review dijalankan (skill `security-review`)
- [x] Tidak ada temuan Critical/High/Medium yang blocking
- [x] 1 catatan non-blocking (lihat Known Limitations) — tidak perlu
      masuk `lessons-learned.md`, cukup dicatat di sini karena spesifik
      konfigurasi role, bukan bug kode
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tombol "Lihat Bukti Transfer" di dalam dialog Detail Invoice memanggil
  `GET /admin/orders/:id/proof-url`, yang digate permission
  **`orders.manage`** — BUKAN `invoices.view` (izin yang menggate halaman
  `/admin/invoices` itu sendiri). Kalau ada role custom yang punya
  `invoices.view` TANPA `orders.manage`, admin itu akan lihat tombolnya
  tapi dapat toast error saat diklik (sudah ditangani graceful, bukan
  crash/kebocoran data — cuma UX kurang mulus). Tidak diperbaiki di fase
  ini karena belum jelas apakah kombinasi role ini benar-benar dipakai di
  project ini — kalau iya, tambahkan guard UI (disable/sembunyikan tombol)
  di fase terpisah.
- Tidak ada test frontend baru untuk `InvoiceDetailDialog` — project ini
  belum punya pola test komponen React untuk halaman admin (dicek, tidak
  ada contoh existing untuk ditiru), jadi verifikasi UI dilakukan lewat
  review kode + typecheck, BUKAN automated test. Backend (sumber data +
  endpoint yang di-reuse) sudah di-test penuh.

## Ringkasan Hasil
Halaman `/admin/invoices` sekarang punya icon mata (detail invoice: item
yang dibeli + status pembayaran granular + bukti transfer kalau ada) dan
bukti transfer dipindah ke icon uang (Banknote) di dalam dialog tersebut,
menggantikan kondisi sebelumnya yang tidak punya akses ke informasi ini
sama sekali dari halaman ini. PDF invoice (`/invoices/:id/pdf`, dipakai
baik oleh admin maupun customer) sekarang menampilkan status pembayaran
granular dan bukti transfer yang di-embed langsung sebagai gambar (bukan
cuma link). `bun run typecheck` 0 error (api+web), `apps/api` 597 pass/0
fail (3 test baru), `apps/web` 50 pass/0 fail (tidak ada regresi). Security
review tidak menemukan temuan blocking.
