# Fase 30 — Admin Bisa Lihat Detail User + Log Import (Read-Only)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
User minta: saat customer telepon minta bantuan soal import yang error,
admin (Super Admin/Admin) bisa langsung buka detail user itu di
`/admin/users`, lihat riwayat SEMUA batch import-nya (lintas modul), dan
buka log per baris — TAMPILANNYA PERSIS seperti yang dilihat user di
`app.` (bukan versi generik) — supaya admin bisa kasih advice yang benar
tanpa perlu screen-share/tebak-tebak.

## Scope
- [x] `apps/api/src/routes/admin/import-batches.route.ts` (baru) — 2
      endpoint generik, `permission: "users.view"` (read-only):
      - `GET /admin/users/:id/import-batches` — profil ringkas user +
        daftar SEMUA batch (lintas modul), paginated.
      - `GET /admin/import-batches/:batchId` — detail 1 batch (bentuk
        respons SAMA PERSIS dengan endpoint customer per-modul), TANPA
        cek ownership (admin boleh lihat batch siapa pun).
- [x] `apps/api/src/app.ts` — daftarkan route baru.
- [x] `apps/web/app/admin/(protected)/users/page.tsx` — tombol "Detail"
      (ikon mata) baru di kolom Aksi, link ke `/users/:id`.
- [x] `apps/web/app/admin/(protected)/users/[id]/page.tsx` (baru) —
      profil singkat + tabel riwayat batch (semua modul), link Detail
      per baris.
- [x] `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx`
      (baru) — 1 ROUTE, branch render 3 tampilan (PurchaseInvoiceView/
      SalesInvoiceView/VendorPayableAccountView) berdasarkan
      `batch.module` — REPLIKASI PERSIS 3 halaman customer (Nomor
      Faktur/PO Number extraction, status badge, dst), TANPA tombol
      Retry/Edit (read-only, disepakati user).
- [x] Test: `admin/import-batches.route.test.ts` (baru, 6 test —
      permission gate, isi respons termasuk `rawData`/`errorMessage`
      per baris, 404 batch/user tidak ditemukan).

## Referensi
- Endpoint customer yang jadi rujukan tampilan: `purchase-invoice-import.route.ts`,
  `sales-invoice-import.route.ts`, `vendor-payable-account-import.route.ts`
  (masing-masing `GET /:batchId`)
- Skema `import_batches`/`import_batch_rows` → `docs/architecture/architecture-accurate-integration.md`

## Keputusan Kecil Selama Eksekusi
- **1 route frontend untuk 3 modul** (bukan 3 dynamic route terpisah
  meniru struktur customer `/purchase-invoice/import/:id` dst) — admin
  tidak butuh URL per-modul yang cantik, cukup 1
  `/admin/import-batches/:batchId` yang branch render berdasarkan
  `batch.module` dari response. Lebih sedikit file, endpoint backend
  juga cuma 1 (generik, bukan 3 endpoint admin per-modul).
- Logic ekstraksi kolom (`findColumn`/`valueOf`/`sortByValue`, versi
  generalisasi dari `findBillNumberColumn`/`invoiceNumberOf` dst milik
  customer) SENGAJA DITULIS ULANG di file admin, BUKAN diekstrak jadi
  util shared lintas customer+admin — 2 halaman punya lifecycle beda
  (customer dipakai/dites user asli tiap hari, admin cuma dibuka pas ada
  telepon support), supaya perubahan di satu sisi tidak mengejutkan sisi
  lain.
- Response `GET /admin/users/:id/import-batches` SENGAJA menyertakan
  profil user (`{user, batches, total}`) alih-alih endpoint terpisah
  "GET /admin/users/:id" — halaman detail user cukup 1 fetch.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Security review dijalankan (inline — endpoint baru READ-ONLY,
      permission `users.view` konsisten dgn pola existing, tidak ada
      input tulis/mutasi sama sekali, low-risk. 0 temuan.)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan — 0)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada aksi Retry/Edit di sisi admin (disepakati user, read-only
  by design) — kalau baris gagal butuh diperbaiki, admin arahkan user
  melakukannya sendiri di `app.`.
- Verifikasi visual browser TIDAK dilakukan (Chrome extension tidak
  tersambung) — TAPI end-to-end sudah diverifikasi manual via curl
  (buat 1 batch nyata + 2 baris sukses/gagal, hit kedua endpoint baru
  lewat proxy dev dgn sesi admin asli, respons dicek cocok dengan
  kontrak yang dipakai halaman frontend) sebelum fase ditutup.

## Ringkasan Hasil

Admin sekarang bisa klik ikon mata di baris manapun pada halaman
"Pengguna" untuk buka detail user (profil singkat + riwayat SEMUA batch
import lintas modul), lalu klik Detail per batch untuk lihat log per
baris — tampilannya replikasi PERSIS halaman customer per modul (Nomor
Faktur/PO Number, status badge, ID transaksi/pesan error), TOTAL
read-only (tidak ada Retry/Edit). Backend cukup 2 endpoint generik
(`GET /admin/users/:id/import-batches`, `GET /admin/import-batches/:batchId`)
karena `import_batches`/`import_batch_rows` memang sudah 1 tabel shared
untuk semua modul — tidak perlu endpoint admin terpisah per modul.

Typecheck 0 error (api+web), lint 0 error, test suite 196 pass/0 fail
(naik dari 190, 6 test baru). Diverifikasi manual end-to-end via curl
(bikin 1 batch nyata dgn baris sukses+gagal, akses via sesi admin lewat
proxy dev) sebelum fase ditutup — respons cocok persis dengan yang
dibutuhkan halaman frontend. Data test dibersihkan lagi, sisa
`admin@facport.test` + `user@facport.com`.
