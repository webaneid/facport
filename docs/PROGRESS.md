# Progress Tracker

> Index ringkas semua fase. Detail tiap fase ada di `docs/phases/phase-XX-*.md`.
> Update tabel ini tiap kali status fase berubah (lihat `docs/SOP.md`).
> **Fase 00 = fondasi** (settings, komponen reusable, i18n — lihat
> `docs/architecture/architecture-components.md`), dibuat otomatis oleh skill
> `project-init` dan WAJIB jalan sebelum Fase 01 fitur.

| Fase | Nama                     | Status      | Architecture Doc                                   | Phase Doc                              |
|------|---------------------------|-------------|-------------------------------------------------------|-------------------------------------------|
| 00   | Fondasi Teknis (settings, komponen, auth+RBAC, queue) | Done | `docs/architecture/architecture-components.md` | `docs/phases/phase-00-fondasi.md` |
| 01   | Fondasi Produk (routing 3-surface, langganan/plans, koneksi OAuth Accurate) | Done | `docs/architecture/architecture-domain-routing.md`, `docs/architecture/architecture-subscription.md`, `docs/architecture/architecture-accurate-integration.md` | `docs/phases/phase-01-fondasi-produk.md` |
| 02   | Modul Pembelian — **Purchase Invoice (Faktur Pembelian) saja** | Done | `docs/architecture/architecture-purchase-invoice.md` | `docs/phases/phase-02-modul-pembelian-purchase-invoice.md` |
| 03   | Dashboard Pelanggan (App Shell + halaman utama) | Done | `docs/architecture/architecture-app-dashboard.md` | `docs/phases/phase-03-dashboard-pelanggan.md` |
| 04   | Import Data Pemasok (update Akun Hutang) | Done | `docs/architecture/architecture-vendor-payable-account.md` | `docs/phases/phase-04-import-vendor.md` |
| 05   | Purchase Invoice — Auto-create Vendor & Item | Done | `docs/architecture/architecture-purchase-invoice.md` § "Fase 05" | `docs/phases/phase-05-purchase-invoice-auto-create.md` |
| 06   | Purchase Invoice — Multi-Item per Faktur | Done | `docs/architecture/architecture-purchase-invoice.md` § "Fase 06", ADR-0011 | `docs/phases/phase-06-purchase-invoice-multi-item.md` |
| 07   | Tampilkan Nomor Faktur di Detail Hasil Import | Done | (frontend-only, lihat phase doc) | `docs/phases/phase-07-riwayat-cari-nomor-faktur.md` |
| 08   | Purchase Invoice — Update Faktur Existing (Retry Cerdas) | Done | `docs/architecture/architecture-purchase-invoice.md` § "Fase 08", ADR-0012 | `docs/phases/phase-08-purchase-invoice-update-existing.md` |
| 09   | Batal Import (Hapus Faktur di Accurate) | Done | `docs/architecture/architecture-purchase-invoice.md` § "Fase 09", ADR-0013, ADR-0014 | `docs/phases/phase-09-batal-import.md` |
| 10   | Admin Dashboard (Settings, User, Paket, Retensi Data) | Done | `docs/architecture/architecture-subscription.md` § "Retensi Data Import", `docs/architecture/architecture-settings.md`, ADR-0015 | `docs/phases/phase-10-admin-dashboard.md` |
| 11   | Admin: Expired Manual per Subscription | Done | `docs/architecture/architecture-subscription.md`, ADR-0016 | `docs/phases/phase-11-admin-subscription-expired-manual.md` |
| 12   | Logo & Favicon Company (Aset Branding Publik) | Done | `docs/architecture/architecture-storage.md`, `docs/architecture/architecture-settings.md`, ADR-0017 | `docs/phases/phase-12-logo-favicon-branding.md` |
| 13   | Sales Invoice (Faktur Penjualan) | Done | `docs/architecture/architecture-sales-invoice.md`, ADR-0018 | `docs/phases/phase-13-sales-invoice.md` |
| 14   | Restrukturisasi Inti: Sub-Modul + Koneksi Accurate Reusable | Done | `docs/architecture/architecture-subscription.md`, `docs/architecture/architecture-accurate-integration.md`, ADR-0019, ADR-0020 | `docs/phases/phase-14-fondasi-langganan.md` |
| 15   | Invoice Profesional (Skema + PDF) | Done | `docs/architecture/architecture-invoice.md`, ADR-0021 | `docs/phases/phase-15-invoice-profesional.md` |
| 16   | Payment Manual (Transfer Bank + QRIS) | Done | `docs/architecture/architecture-payment.md`, ADR-0022 | `docs/phases/phase-16-payment-manual.md` |
| 17   | Self-Service Checkout UI (Cart Multi-Modul) | Done | `docs/architecture/architecture-payment.md`, ADR-0022 | `docs/phases/phase-17-checkout-ui.md` |
| 18   | Unifikasi Onboarding Admin | Done | `docs/architecture/architecture-subscription.md` | `docs/phases/phase-18-onboarding-admin.md` |
| 19   | Admin Design System — Fondasi (komponen & utilitas bersama) | Done | ADR-0023 | `docs/phases/phase-19-admin-design-system-fondasi.md` |
| 20   | Unifikasi Alur Status Invoice → Pembayaran → Konfirmasi | Done | `docs/architecture/architecture-payment.md`, ADR-0023 | `docs/phases/phase-20-unifikasi-status-invoice-pembayaran.md` |
| 21   | Rollout Konsistensi ke Semua Halaman Admin | Done | ADR-0023 | `docs/phases/phase-21-rollout-konsistensi-admin.md` |
| 22   | Account Self-Service (Profile Settings + Ganti Password) | Done | `docs/architecture/architecture-auth.md` | `docs/phases/phase-22-account-self-service.md` |
| 23   | Admin UI Kit v2 — Shell + Token Biru | Done | ADR-0024 | `docs/phases/phase-23-admin-shell-v2.md` |
| 24   | Admin UI Kit v2 — UI Primitives + Feedback | Done | ADR-0024 | `docs/phases/phase-24-ui-primitives-v2.md` |
| 25   | Admin UI Kit v2 — Data Table Kit + Form Controls | Done | ADR-0024 | `docs/phases/phase-25-data-table-form-controls-v2.md` |
| 26   | Admin UI Kit v2 — Permission Guard + Verifikasi Penuh | Done | ADR-0024 | `docs/phases/phase-26-permission-guard-v2.md` |
| 27   | Manajemen Invoice Admin + Link Pembayaran Publik | Done | `docs/architecture/architecture-invoice.md`, `docs/architecture/architecture-payment.md`, ADR-0025 | `docs/phases/phase-27-manajemen-invoice-admin.md` |
| 28   | "Import Akun Hutang Pemasok" Jadi Sub-Modul Berbayar Terpisah | Done | `docs/architecture/architecture-accurate-integration.md`, ADR-0026 | `docs/phases/phase-28-modul-akun-hutang-pemasok-terpisah.md` |
| 29   | Role "Admin" (Terbatas) vs "Super Admin" + Nonaktifkan User | Done | `docs/architecture/architecture-user-roles.md`, ADR-0027 | `docs/phases/phase-29-role-staff-dan-nonaktifkan-user.md` |
| 30   | Admin Bisa Lihat Detail User + Log Import (Read-Only) | Done | `docs/architecture/architecture-transaction-flow.md` | `docs/phases/phase-30-admin-lihat-log-import-user.md` |
| 31   | Fitur Lupa Password (Reset Mandiri) | Done | `docs/architecture/architecture-auth.md` | `docs/phases/phase-31-lupa-password.md` |
| 32   | Fondasi Test Frontend (Bun Test + React Testing Library) | Done | `docs/architecture/architecture-testing.md` | `docs/phases/phase-32-fondasi-test-frontend.md` |
| 33   | Modul Purchase Payment (Pembayaran Pembelian) | Done | `docs/architecture/architecture-purchase-payment.md` | `docs/phases/phase-33-modul-purchase-payment.md` |
| 34   | Modul Sales Receipt (Penerimaan Penjualan) | Done | `docs/architecture/architecture-sales-receipt.md` | `docs/phases/phase-34-modul-sales-receipt.md` |
| 35   | Modul Jurnal Umum (Journal Voucher) | Done | `docs/architecture/architecture-journal-voucher.md` | `docs/phases/phase-35-modul-jurnal-umum.md` |
| 36   | Paritas Riwayat/Edit Baris/Hapus — Vendor Payable Account | Done | (lihat phase doc, reuse pola Purchase Invoice) | `docs/phases/phase-36-riwayat-vendor-payable-account.md` |
| 37   | Paritas Riwayat/Edit Baris/Hapus — Purchase Payment | Done | (lihat phase doc, reuse pola Purchase Invoice) | `docs/phases/phase-37-riwayat-purchase-payment.md` |
| 38   | Paritas Riwayat/Edit Baris/Hapus — Sales Receipt | Done | (lihat phase doc, reuse pola Purchase Invoice) | `docs/phases/phase-38-riwayat-sales-receipt.md` |
| 39   | Paritas Riwayat/Edit Baris/Hapus — Jurnal Umum | Done | (lihat phase doc, reuse pola Purchase Invoice) | `docs/phases/phase-39-riwayat-journal-voucher.md` |
| 40   | Estimasi Efisiensi Waktu Kerja (Dashboard Customer) | Done | (lihat phase doc) | `docs/phases/phase-40-estimasi-efisiensi-waktu-kerja.md` |
| 41   | Arsip Import Gabungan Lintas Modul + Card "Import Terakhir" Unifikasi | Done | (lihat phase doc) | `docs/phases/phase-41-arsip-import-gabungan.md` |
| 42   | QRIS: Baca Payload EMV Otomatis dari Foto Barcode | Done | (lihat phase doc) | `docs/phases/phase-42-qris-auto-decode.md` |
| 43   | Paket — Durasi Fleksibel (Hari/Bulan/Tahun) + Sistem Trial | Done | `docs/architecture/architecture-subscription.md` (update) | `docs/phases/phase-43-paket-durasi-fleksibel-dan-trial.md` |
| 44   | Audit & Perbaikan Timezone Menyeluruh | Done | `docs/decisions/adr-0028-timezone-aware-date-handling.md`, `docs/architecture/architecture-settings.md` (update) | `docs/phases/phase-44-audit-timezone.md` |
| 45   | Sistem Notifikasi (In-App) + Pengumuman Admin | Done | `docs/architecture/architecture-notifications.md` (update), `docs/decisions/adr-0029-notifikasi-fanout-per-penerima.md` | `docs/phases/phase-45-sistem-notifikasi.md` |
| 46   | Customer Care (Profil CS + WhatsApp Rotator + Analitik) | Done | `docs/architecture/architecture-customer-care.md` (baru) | `docs/phases/phase-46-customer-care.md` |
| 47   | Landing Page Redesign (Nyontek Desain Referensi) | Done | (lihat phase doc) | `docs/phases/phase-47-landing-page-redesign.md` |
| 48   | Auto-Login Setelah Verifikasi Email + Bawa Pilihan Paket | Done | (lihat phase doc) | `docs/phases/phase-48-auto-login-verifikasi-email.md` |
| 49   | Perbaiki Grouping Multi-Baris (Sales Receipt & Sales Invoice) | Done | (lihat phase doc) | `docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md` |
| 50   | Grouping Multi-Baris (Purchase Payment & Journal Voucher) | Done | (lihat phase doc) | `docs/phases/phase-50-grouping-purchase-payment-dan-journal-voucher.md` |
| 51   | Grid Edit ala Excel untuk Baris Gagal Import | Done | (lihat phase doc) | `docs/phases/phase-51-grid-edit-baris-gagal.md` |
| 52   | Perbaikan Deploy Production Pertama (facinstitute.id) | Done | `docs/deployment-new-domain-onboarding.md` | `docs/phases/phase-52-perbaikan-deploy-production-pertama.md` |
| 53   | Multi-Tier Billing per Sub-Modul (Bulanan/Tahunan) | Done | `docs/architecture/architecture-subscription.md` | `docs/phases/phase-53-multi-tier-billing-per-modul.md` |
| 54   | Perbaikan Logika Upgrade Trial → Paket Asli | Done | `docs/architecture/architecture-subscription.md` | `docs/phases/phase-54-perbaikan-logika-upgrade-trial.md` |
| 55   | Atribut Tambahan (Data Classification) di Import Sales Invoice | Done | `docs/architecture/architecture-sales-invoice.md` | `docs/phases/phase-55-atribut-tambahan-sales-invoice.md` |
| 56   | Fix Error Message Batch Gagal Dini (Semua Modul) | Done | `docs/architecture/architecture-accurate-integration.md` | `docs/phases/phase-56-fix-error-message-batch-gagal-dini.md` |

**Status legend:** `Not Started` → `Planned` → `In Progress` → `Done`

## Modul/Sub-modul Lain — Sengaja Di-pending
**Update 2026-09-04**: client minta 5 sub-modul aktif — **Sales Invoice
(Fase 13, Done), Purchase Invoice (Done), Sales Receipt/"Customer
Receipt", Purchase Payment, Journal Voucher/"Jurnal Umum"**. Sebelum
lanjut bangun CR/PP/JU, user minta fondasi komersial diperkuat dulu
(Fase 14-18) — gating pindah dari grup top-level ke per-sub-modul, koneksi
Accurate reusable lintas subscription, invoice profesional, payment
manual (transfer bank + QRIS — **update 2026-09-04**: rencana AWAL
"Payment Gateway Ipaymu" DIGANTI setelah riset ke aplikasi sibling
production `jalajogja` menemukan gateway otomatis TIDAK PERNAH benar-benar
diimplementasikan di sana, sementara pola manual TERBUKTI jalan
bertahun-tahun — detail lengkap ADR-0022), cart multi-modul. **Fase 14,
15, 16 (Payment Manual), 17 (Checkout UI), DAN 18 (Onboarding Admin)
semuanya Done** (14-16: 2026-09-04, 17-18: 2026-09-05) — **rencana 5-fase
14-18 SELESAI SEMUA**. **CR/PP/JU BARU dikerjakan setelah Fase 14-18
selesai** —
supaya 3 modul itu langsung dibangun di atas struktur final (harga
per-SKU, gating per-sub-modul), bukan mirror struktur lama PI/SI yang
bakal langsung perlu dirombak lagi. Rencana detail 5 fase → ADR-0019,
ADR-0020, dan phase doc masing-masing fase (dibuat bertahap saat fase itu
dimulai).

**Fase 14 Done 2026-09-04** — ringkasan lengkap →
`docs/phases/phase-14-fondasi-langganan.md` § Ringkasan Hasil. Typecheck
0 error (apps/api & apps/web), 95/95 test pass, security review 0
Critical/High (1 Medium + 4 Low, semua diperbaiki langsung). Migrasi data
3-tahap diverifikasi manual pasca-migration (ketemu & dibersihkan 1 baris
plan test lama yang lolos backfill otomatis — detail di
`docs/lessons-learned.md`). **Verifikasi UI browser sungguhan BELUM
dilakukan** sesi ini (ekstensi Chrome tidak terhubung) — request/response
API sudah diverifikasi nyata lewat `curl` (termasuk skenario inti: 1 user
2 subscription beda modul, reuse 1 koneksi Accurate lintas modul tanpa
re-OAuth), tapi rendering komponen React (`/admin/plans`,
`/app/accurate`) belum pernah dilihat langsung — cek manual kalau
memungkinkan.

**Fase 15 Done 2026-09-04** — ringkasan lengkap →
`docs/phases/phase-15-invoice-profesional.md` § Ringkasan Hasil.
Typecheck 0 error, 105/105 test pass (10 baru), security review 0
Critical/High/Medium (3 Low, 1 diperbaiki langsung). PDF diverifikasi
ASLI (bukan cuma status code) — file didownload nyata via `curl`, `file`
command konfirmasi PDF valid, teks diekstrak konfirmasi SEMUA data
(company, bill-to, item, total, footer) benar. **Belum ada jalur normal
bikin invoice** (checkout = Fase 16-17) — data test dibuat manual/script,
bukan alur user nyata. **Fase 14 DAN Fase 15** di-commit+push+PR
(#26, ke `develop`) setelah Fase 15 ditutup.

**Fase 16 Done 2026-09-04** — ringkasan lengkap →
`docs/phases/phase-16-payment-manual.md` § Ringkasan Hasil. Rencana awal
"Payment Gateway Ipaymu" DIGANTI payment manual (transfer bank + QRIS
dinamis lokal) setelah riset ke aplikasi sibling production `jalajogja`
(detail ADR-0022). Typecheck 0 error, 144/146 test pass (26 baru, 2
di-skip — MinIO lokal env mismatch, bukan bug kode). Security review 0
Critical, 1 High (guard checkout concurrent — DIPERBAIKI, dibungkus
`db.transaction()` + row lock) + 3 Medium (DIPERBAIKI: QRIS Tag 53/54
fallback, validasi settings bankAccounts/qrisAccounts, info disclosure
`GET /orders/:id`) + 2 Low diterima sebagai debt. **Upload bukti transfer
via MinIO NYATA belum terverifikasi** (env lokal mismatch credential,
lihat Known Limitations phase doc) — WAJIB dicek manual di staging
sebelum dianggap jalan end-to-end penuh. Di-commit+push ke PR #26 yang
sama (branch `feat/subscription-foundation`), PR title/deskripsi
diupdate mencakup Fase 16.

**Fase 17 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-17-checkout-ui.md` § Ringkasan Hasil. Katalog publik
(landing) + halaman cart dashboard (`/subscribe`) menyambungkan pemilihan
sub-modul ke backend checkout Fase 16 — TIDAK ada backend baru, murni UI
penghubung (landing di-renovasi pakai komponen UI konsisten, cart bawa
pilihan lewat login `?redirect=`, checkbox modul aktif otomatis
nonaktif, banner reminder invoice belum dibayar di dashboard). Typecheck
0 error, lint 0 error, security review di sesi utama (bukan subagent —
pure UI konsumsi endpoint yang sudah diaudit Fase 16, tidak ada surface
baru) 0 temuan. **Alur checkout end-to-end (landing → login → subscribe
→ checkout → halaman bayar) BELUM diverifikasi manual via browser
sungguhan** — direkomendasikan sebelum dipakai customer sungguhan.

**Fase 18 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-18-onboarding-admin.md` § Ringkasan Hasil. Fase
TERAKHIR dari rencana 5-fase 14-18. `POST /admin/users` sekarang jadi
jalur onboarding tunggal, terima `planIds` opsional + 2 hasil akhir
mutually-exclusive: "Kirim Invoice" (invoice+order dibuat, customer
bayar sendiri via alur manual Fase 16) atau "Tandai Sudah Dibayar" (N
subscription langsung aktif, endAt otomatis per plan, tanpa invoice).
Logic invoice diekstrak ke `lib/invoice-order.ts` (dipakai ulang dari
checkout Fase 16), jalur bayar-langsung pakai helper batch baru
`lib/manual-subscription.ts` (BUKAN reuse `POST /admin/subscriptions`
lama — beda kebutuhan: N plan dengan durasi berbeda-beda vs 1 plan
endAt manual). Security review (subagent) menemukan 1 High — jalur
`markAsPaid` cuma dijaga `users.manage`, celah bagi role custom untuk
mengaktifkan subscription gratis tanpa `subscriptions.manage` — DIPERBAIKI
(cek permission di awal handler + regression test). 2 Medium juga
diperbaiki: HTML injection nama user/plan di email (`escapeHtml()`), dan
potensi temp password plaintext ikut ter-log di fallback dev
`lib/email.ts` (flag `sensitive` baru). `architecture-subscription.md` §
"Admin-Provisioned" dikoreksi dari deskripsi stale (password SELALU
digenerate di response sejak Fase 01, bukan alur "email undangan
set-password" yang tidak pernah ada). Typecheck 0 error, suite penuh
151 pass/2 skip/0 fail (7 test baru). **Verifikasi UI browser sungguhan
BELUM dilakukan**, email selamat datang belum dites kirim SUNGGUHAN
(RESEND_API_KEY kosong di dev). Fase 17 DAN 18 belum di-commit/push —
MENUNGGU arahan user berikutnya (rencana semula: commit sekaligus
setelah Fase 18 selesai).

**Update 2026-09-05 — Fase 19-22 baru: Admin Design System & Konsistensi
UI/UX** (di luar rencana 5-fase 14-18 yang sudah selesai — inisiatif
terpisah dipicu feedback user langsung setelah lihat admin dashboard
nyata via browser). Audit konkret (2 subagent riset) menemukan
`@tanstack/react-table` (dependency wajib per ADR-0004) 0 pemakaian
nyata, 6 mapping status→Badge terpisah/inkonsisten (`order.status` malah
tidak pernah ada Badge sama sekali), tidak ada `PageHeader`/`StatCard`/
`Pagination` reusable, `currencyFormatter` di-copy di 8 file. Rencana 4
fase: **Fase 19** (fondasi komponen+status registry, TANPA ubah halaman
manapun) → **Fase 20** (unifikasi status invoice/order/pembayaran, +
perbaiki gap fungsional admin/orders yang hardcode `status=submitted`
sehingga admin tidak pernah lihat order paid/rejected/cancelled) →
**Fase 21** (rollout komponen ke SEMUA halaman admin+beberapa halaman
app, verifikasi visual browser sungguhan) → **Fase 22** (Profile Settings
+ Ganti Password, fitur baru dipilih eksplisit user). Detail lengkap →
ADR-0023, `docs/phases/phase-19-admin-design-system-fondasi.md`.
Beberapa item dari wishlist awal user SENGAJA di-skip (ikon notifikasi/
search topbar — tidak ada backend, sidebar collapsible — nav cuma 5
item, Alamat/i18n/WA input — sudah keputusan project-init lama tidak
relevan project ini) — dikonfirmasi via `AskUserQuestion`, bukan
diam-diam dihilangkan.

**Fase 19 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-19-admin-design-system-fondasi.md` § Ringkasan Hasil.
11 komponen primitif baru (`Textarea`/`Select`/`Checkbox`/`Tabs`/
`Tooltip`/`Alert`/`Pagination`/`DataTable`/`PageHeader`/`StatCard`/
`PermissionGuard`) + status registry tunggal (`lib/status-badges.tsx`)
+ `currencyFormatter` tersentralisasi, TANPA mengubah tampilan halaman
manapun (sesuai rencana — nilai baru mulai terlihat Fase 20-21). Temuan
teknis penting: `@tanstack/react-table` yang terinstall ternyata v9
dengan API BEDA TOTAL dari v8 (`useTable`+`tableFeatures` eksplisit,
bukan `useReactTable` implisit) — dibangun native di atas v9, BUKAN
compat shim `useLegacyTable` yang sudah ditandai deprecated oleh
library-nya sendiri (detail lengkap di lessons-learned). Backend `GET
/me` extend balas `permissions: string[]` untuk `PermissionGuard`.
Typecheck 0 error, test suite tetap 151 pass/2 skip/0 fail, security
review self-review 0 temuan.

**Fase 20 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-20-unifikasi-status-invoice-pembayaran.md` § Ringkasan
Hasil. `GET /admin/orders` tidak lagi hardcode `status="submitted"`
sebagai satu-satunya jalur (default tetap sama, TAPI sekarang bisa
eksplisit filter status lain atau `"all"` — 4 test baru). Halaman
`admin/orders` dirombak pakai `Tabs`+`DataTable`+`StatusBadge` (Fase 19)
— pertama kalinya `@tanstack/react-table` benar-benar dipakai di
project ini, dan order akhirnya punya Badge status (sebelumnya tidak
ada sama sekali). Halaman billing customer (`billing/page.tsx`,
`billing/[orderId]/pay/page.tsx`) migrasi ke `StatusBadge` dari registry
bersama, menghilangkan divergensi "Lunas" vs "✓ Lunas", plus nambah
penanganan status `cancelled`/`expired` yang sebelumnya blank. Typecheck
0 error, test suite 155 pass/2 skip/0 fail (4 baru), security review
self-review 0 temuan. **Verifikasi visual browser masih tertunda**
sampai Fase 21 (rollout) selesai.

**Fase 21 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-21-rollout-konsistensi-admin.md` § Ringkasan Hasil.
Semua primitif Fase 19 + registry Fase 20 dipasang di 7 halaman
admin+app existing (dashboard admin, Paket, Pengguna, Pengaturan,
dashboard app, 2 halaman riwayat import) — inilah yang mewujudkan
permintaan eksplisit user soal konsistensi lebar card/title/table/
paginasi/form. `plan.isActive` jadi domain registry baru `"plan"`.
Ditemukan & diselesaikan: `DataTable` (client-pagination only) dipadukan
dengan `Pagination` terpisah untuk listing server-paginated
(`admin/users`) — pola didokumentasikan untuk referensi. Sapuan akhir
membereskan 2 duplikat `currencyFormatter` di luar scope asli. Security
review subagent `security-auditor` (9 file): 0 Critical/High/Medium/Low.
Typecheck 0 error, lint 0 error, test suite API tetap 155 pass/2 skip/0
fail (backend tidak disentuh fase ini). **Verifikasi visual browser
sungguhan TIDAK BISA dilakukan** (ekstensi Chrome tidak terhubung sesi
ini) — satu-satunya item belum tuntas, diserahkan ke user untuk cek
manual.

**Fase 22 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-22-account-self-service.md` § Ringkasan Hasil. FASE
TERAKHIR inisiatif 4-fase (19-22). User dropdown topbar dapat menu
"Profil & Ganti Password" (sebelumnya cuma Logout) — 1 komponen shared
`ProfileSettings` dibungkus 2 `page.tsx` tipis (admin & app, preseden
pertama halaman lintas-surface di project ini, konsekuensi mekanisme
`proxy.ts`). TIDAK ada endpoint backend baru — reuse
`change-password`/`update-user` bawaan Better Auth. Diverifikasi
FUNGSIONAL nyata via `curl` langsung (bukan cuma typecheck): password
salah ditolak, ganti password+nama berhasil, rate limiting endpoint
sensitif terkonfirmasi aktif. Typecheck 0 error, lint 0 error, security
review self-review 0 temuan. **Verifikasi visual browser masih
tertunda** (sama seperti Fase 21 — ekstensi Chrome tidak terhubung
sepanjang sesi ini).

**INISIATIF 4-FASE (19-22) DESIGN SYSTEM ADMIN — SELESAI SEMUA.**

## Update 2026-09-05 — Inisiatif BARU: Admin UI Kit v2 (redesign total, ADR-0024)
User minta admin di-redesign TOTAL lagi (bukan iterasi ADR-0023) — acuan
repo sibling `/Users/webane/sites/master-typescript` (ADR-0006 "Admin UI
Kit", dibuat hari yang sama) + screenshot referensi visual nyata. Beda
total dari Fase 19-22: sidebar gradient rail gelap collapsible+nested
group, breadcrumbs, filter panel dgn state URL, bulk row-selection,
`FormField` wrapper, `<Can>` permission-guard session-based. Palet
warna BIRU (3 anchor dari user: `#023e8a`/`#03045e`/`#ebf2fa`). ADR-0004
(bagian komponen) & ADR-0023 di-**supersede** (TIDAK dihapus, aturan
project ADR Accepted tidak boleh diedit) via **ADR-0024**. Rencana 4
fase baru (23-26): Shell+Token → Primitives+Feedback → Data Table
Kit+Form Controls → Permission Guard+Verifikasi Penuh. Detail lengkap →
ADR-0024, `docs/phases/phase-23-admin-shell-v2.md`.

**Fase 23 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-23-admin-shell-v2.md` § Ringkasan Hasil. Sidebar/
Topbar/AppShell ditulis ulang total: gradient rail biru gelap
collapsible (persist localStorage) dengan nav berkelompok (3 grup per
surface), breadcrumbs sungguhan (ganti label statis), search+notifikasi
UI-only jujur (`disabled`+tooltip, bukan pura-pura berfungsi), shell
jadi 2 panel rounded terpisah mengambang di kanvas gradient. Token
`--admin-*` biru ditambah BERDAMPINGAN token lama (sengaja, primitif
Button/Card/Badge/Table belum dimigrasi — itu Fase 24-25, jadi ADA
inkonsistensi visual sementara yang disengaja). Typecheck 0 error, lint
0 error (1 fix), test suite tidak berubah, security review self-review
0 temuan. **Verifikasi visual browser dicoba ulang, TETAP gagal**
(ekstensi Chrome belum tersambung) — direkomendasikan KUAT dicek manual
sebelum lanjut Fase 24 karena ini perubahan struktural paling berisiko
visual di seluruh inisiatif.

## Update 2026-09-05 — Fase 24-26 (Admin UI Kit v2) DITUNDA, interupsi Fase 27 (Invoice)
User puas dengan Fase 23, lalu minta pindah fokus ke fitur baru: menu
Invoice di admin (bisa buat invoice manual untuk user existing, >1 paket
per invoice, link publik terintegrasi konfirmasi pembayaran tanpa
login). Fase 24-26 (rollout primitif Admin UI Kit v2) tetap "Not
Started", DITUNDA bukan dibatalkan — lanjut lagi kalau user minta.
**ADR-0025** ditulis (perluasan sengaja dari ADR-0022 — bukan supersede):
admin bisa `POST /admin/invoices` untuk user existing (reuse
`createInvoiceAndOrder` Fase 18, sudah dukung multi-plan), SETIAP order
dapat link publik `{APP_URL}/pay/{orderId}` (UUID order langsung jadi
identifier, TANPA token terpisah — presedan `jalajogja` production),
endpoint baru prefix `/public/orders/*` TANPA auth (guard status+rate
limit, bucket bukti tetap PRIVAT beda dari jalajogja). Riset InvoicePlane
(homepage/README kurang detail) dialihkan ke `jalajogja` atas arahan
user (`app/(public)/[tenant]/invoice/[id]/page.tsx`,
`app/api/invoice/proof-upload/route.ts`, `invoice-create-form.tsx`).
Detail lengkap → ADR-0025, `docs/phases/phase-27-manajemen-invoice-admin.md`.

**Fase 27 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-27-manajemen-invoice-admin.md` § Ringkasan Hasil.
Menu Invoice baru di admin (list + "Buat Invoice" multi-paket untuk user
existing). Backend `lib/order-payment.ts` diekstrak supaya jalur login &
publik (`/public/orders/*`, TANPA auth) pakai logic IDENTIK — tidak ada
2 sumber kebenaran field-filtering yang bisa drift. Frontend
`OrderPayFlow` (shared component) dipakai kedua halaman bayar. Security
review (subagent, 2 putaran): **1 High ditemukan & diperbaiki** — rate
limiter `/public` bisa dilewati via header `X-Forwarded-For` yang bebas
diisi client (nginx cuma menambahkan, bukan menimpa) — fix pakai
`X-Real-IP`. Verifikasi FUNGSIONAL nyata end-to-end via curl: invoice
2-paket dibuat → link publik diakses TANPA cookie sama sekali → order
masuk antrian konfirmasi admin EXISTING tanpa perubahan → dikonfirmasi
→ 2 subscription aktif tercipta durasi benar. Typecheck 0 error, lint 0
error, test suite 170 pass/3 skip/0 fail (19 baru).

## Update 2026-09-05 — Fase 24-26 (Admin UI Kit v2) DILANJUTKAN setelah Fase 27
User minta lanjut Fase 24-26 (sempat ditunda demi Fase 27/Invoice).

**Fase 24 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-24-ui-primitives-v2.md` § Ringkasan Hasil. **PIVOT
BESAR saat eksekusi**: rencana awal (tulis ulang API Button/Card/Badge
+ migrasi puluhan file pemakai) dibatalkan, diganti reskin lewat 1 file
(`globals.css`) — skala `--color-primary-50..900` diganti turunan biru
(700=`#023e8a`, 900=`#03045e`, anchor persis nilai user), token netral
di-alias ke `--admin-*` Fase 23. Karena hampir semua komponen SUDAH
pakai token semantik (bukan hex hardcode), 1 perubahan ini me-reskin
OTOMATIS ~70 file tanpa satu pun diedit. Ditemukan+diperbaiki bonus: 3
file (`combobox.tsx`/`command.tsx`/`popover.tsx`) ternyata masih pakai
warna abu-abu hardcode dari sebelum sistem token ada. Nama API
(`variant`, `CardContent`) SENGAJA dipertahankan (rename murni kosmetik
tanpa manfaat). Typecheck 0 error, lint 0 error, test suite tidak
berubah, security review self-review 0 temuan (perubahan CSS murni).
**Verifikasi visual browser masih tertunda** (ekstensi Chrome belum
tersambung) — fase paling butuh verifikasi visual dari semua fase
redesign.

**Fase 25 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-25-data-table-form-controls-v2.md` § Ringkasan Hasil.
Dinilai ulang SEBELUM eksekusi: `FilterPanel`/`StatCards` array ditunda
total (tidak ada kebutuhan konkret sekarang), `SearchForm` (debounced
350ms) dibangun memperbaiki bug performa nyata (`admin/users` search
sebelumnya fetch tiap keystroke), `FormField` dipasang di 2 form
(`CreateInvoiceDialog`, `ProfileSettings`). Typecheck 0 error, lint 0
error, test suite tidak berubah, security review self-review 0 temuan.

**Fase 26 Done 2026-09-05** — ringkasan lengkap →
`docs/phases/phase-26-permission-guard-v2.md` § Ringkasan Hasil.
`PermissionsProvider`+`usePermissions()` (Context, fetch `/me` sekali) +
`<Can permission="...">` (ganti `permission-guard.tsx` Fase 19, 0
pemakai) dipasang di UI: checkbox "Tandai Sudah Dibayar", tombol "Kelola
Langganan", tombol "Buat Invoice" (semua `subscriptions.manage`/
`invoices.manage`, split dari permission halaman induknya), + filter
nav Sidebar per-item. Security review subagent `security-auditor`: 0
Critical/0 High, 2 Medium (gap UI-hint, LANGSUNG diperbaiki: guard
`ManageSubscriptionDialog` + pesan error eksplisit di pencarian user
`CreateInvoiceDialog`), 2 Low (diterima, dicatat lessons-learned).
Typecheck 0 error (api+web), lint 0 error, test 170 pass/0 fail/3 skip.
Data test yang regrow dari test run (322 user, dst) dibersihkan lagi,
sisa hanya `admin@facport.test`. Verifikasi visual browser gagal lagi
(Chrome extension tidak tersambung, konsisten Fase 23-25).

**→ Inisiatif Admin UI Kit v2 (Fase 23-26) SELESAI TOTAL.** Admin shell,
primitif UI, data table/form controls, dan permission guard semua sudah
di-redesign ke palet biru custom user, konsisten dengan referensi
struktural `master-typescript` ADR-0006 tapi dengan keputusan teknis
project sendiri (tetap `@tanstack/react-table` v9, Context
`usePermissions()` bukan plugin `customSession` Better Auth). **Belum
ada verifikasi visual browser sama sekali di seluruh 4 fase ini** —
Chrome extension tidak pernah berhasil tersambung sepanjang sesi ini;
user disarankan cek langsung di browser sungguhan sebelum menganggap
redesign ini final secara visual.

## Update 2026-09-05 — Bug nyata dari user: upload bukti transfer 500 — ternyata gap MinIO "Known Limitation" Fase 16/27 cuma salah `.env`
User cek langsung di browser (bukan Claude — ekstensi Chrome tetap tidak
tersambung) dan lapor `PATCH /public/orders/:id/proof` balas 500 saat
coba upload bukti transfer di halaman bayar publik (Fase 27). Root cause
`ECONNREFUSED` → MinIO. Dicek `ps eww` ke proses MinIO native homebrew
yang benar-benar jalan di mesin ini: `apps/api/.env` salah PORT (9002,
seharusnya 9000, sama dengan `.env.example`/`docker-compose.dev.yml`)
DAN salah SECRET KEY (`minioadmin`, seharusnya `minioadmin123`, nilai
asli ada di env var proses MinIO-nya sendiri). Ini gap yang SAMA yang
sejak Fase 16 (2026-09-04) dicatat sebagai "Known Limitation" & 3 test
di-`test.skip()` — ternyata BUKAN keterbatasan infra permanen, cuma
config lokal yang salah dan belum pernah dicek sampai ke level proses.
Fix: perbaiki `.env`, restart `bun run dev` (apps/api), un-skip 3 test.
Verifikasi manual curl end-to-end (200, order jadi `submitted`) sebelum
jalanin test otomatis. Suite: **173 pass, 0 skip, 0 fail** (naik dari
170 pass/3 skip). Detail lengkap → `docs/lessons-learned.md` 2026-09-05.
Order test user (`9fafa3b2-...`) dikembalikan ke status `pending` +
proof dikosongkan supaya user bisa upload bukti asli via browser tanpa
sisa data test dari verifikasi curl ini.

## Update 2026-09-05 — Bug pasca-Fase 21: tabel perlu scroll horizontal walau desktop lebar
Ditemukan user langsung setelah cek browser sungguhan (persis skenario
yang diperingatkan sebagai Known Limitation Fase 21 — verifikasi visual
tidak bisa dilakukan sesi itu). 9 halaman listing (`admin/plans`,
`admin/users`, `admin/orders`, `billing`, 2 riwayat import, 3 detail
batch) dibungkus `mx-auto max-w-4xl/5xl/3xl` sejak Fase 02-18 — sempit
untuk tabel 6-7 kolom yang sudah punya `overflow-x-auto` bawaan
(`components/ui/table.tsx`), jadi scrollbar horizontal MUNCUL TERUS
walau `<main>` sebenarnya lega. Fix: lepas `mx-auto max-w-Nxl`, samakan
pola dashboard (`flex flex-col gap-6` polos, lebar penuh) — HANYA untuk
halaman listing/tabel. Halaman form (Settings, Profile, upload Excel,
bayar, koneksi Accurate, subscribe) SENGAJA tidak diubah, lebar sempit
di sana memang benar. Detail lengkap → `docs/lessons-learned.md` entri
2026-09-05 "Bug produksi (ditemukan user pasca-Fase 21)...".

Modul/sub-modul LAIN di luar 5 ini (arahan awal 2026-08-19, masih berlaku
buat sisanya) TETAP di-pending, urutan belum diputuskan:
- Modul Pembelian — sub-modul lain (di luar PI & PP): Purchase Order,
  Received Item, Retur Pembelian
- Modul Penjualan — sub-modul lain (di luar SI & CR): Pesanan Penjualan,
  Delivery Order, Retur Penjualan
- Modul Persediaan (Inventory) — semua sub-modul
- Modul Manufaktur — semua sub-modul
- Modul Kas & Bank (di luar OP/OD yang mungkin ikut Jurnal Umum) — TBD

**"Batal Import" (hapus dari Accurate) — Done, lihat Fase 09** (dulu
sengaja ditunda sampai Fase 06 & 08 solid, feedback client 2026-08-27).
Tombol di halaman arsip Riwayat Import yang menghapus transaksi 1 batch
langsung DARI ACCURATE (bukan cuma riwayat lokal Facport) — TAPI cakupan
akhirnya lebih sempit dari rencana awal: cuma faktur yang 100% milik 1
batch yang bisa dihapus otomatis, faktur gabungan lintas-batch (Fase 08)
DIBLOKIR (Accurate tidak punya cara aman hapus sebagian item, ketemu
lewat verifikasi nyata — lihat ADR-0014). Detail lengkap →
`docs/phases/phase-09-batal-import.md`, ADR-0013, ADR-0014.

**Fase 04 (Import Data Pemasok — update Akun Hutang) Done 2026-08-20** —
modul BARU (data master, di luar 5 modul transaksi yang di-listing di §
"Modul/Sub-modul Lain — Sengaja Di-pending" di bawah), dipicu permintaan
client soal kolom "Akun Hutang" di Faktur Pembelian. Lewat riset panjang +
verifikasi empiris berulang (test call nyata ke Accurate, termasuk 3x
re-authorize OAuth buat nambah scope), field yang tepat dikonfirmasi:
`vendorPayableAccountListNo` (bukan saldo/`detailOpenBalance`) — dan
dibuktikan BENERAN dipakai Accurate saat posting Faktur Pembelian
berikutnya (bukan kosmetik). Endpoint + UI baru
`/vendor/payable-account/import/*`, pola identik Purchase Invoice. Detail
lengkap → `docs/phases/phase-04-import-vendor.md` § Ringkasan Hasil.
**Known limitation penting**: koneksi Accurate existing perlu
re-authorize manual untuk dapat scope baru ini.

**Fase 05 (Purchase Invoice — Auto-create Vendor & Item) Done 2026-08-20** —
perluasan modul Purchase Invoice (Fase 02): kalau Pemasok/Barang di Excel
belum ada di Accurate, otomatis dibuatkan (field opsional: kategori,
telepon, WhatsApp, email, alamat, negara, Akun Hutang untuk Pemasok baru),
baru Fakturnya dibuat. Diverifikasi PENUH lewat browser sungguhan sampai
sukses (vendor+item+faktur tercipta dalam 1 alur, semua field terkonfirmasi
tersimpan benar). Detail lengkap → `docs/phases/phase-05-purchase-invoice-auto-create.md`
§ Ringkasan Hasil. **Known limitation sama seperti Fase 04**: koneksi
Accurate existing perlu re-authorize manual untuk scope `item_save` baru.

## Fase Aktif Saat Ini
Fase 00, Fase 01, DAN Fase 02 (Modul Pembelian — Purchase Invoice) semuanya
**Done** (2026-08-19). Fase 02 tervalidasi end-to-end SUNGGUHAN — faktur
asli tercipta di Accurate Online (Data Usaha "Retail Demo") lewat panggilan
HTTP nyata (bukan mock), termasuk setelah security review (0 Critical, 1
High + 2 Medium + 4 Low, semua diperbaiki). Detail lengkap →
`docs/phases/phase-02-modul-pembelian-purchase-invoice.md` § Ringkasan
Hasil.

**Fase 03 (Dashboard Pelanggan) Done 2026-08-19** — App Shell (sidebar+topbar,
route group `(protected)`) + dashboard home profesional (Card Langganan,
Koneksi Accurate, Import Terakhir), pakai data ASLI dari Fase 01/02.
Diverifikasi lewat browser sungguhan (Playwright): login, navigasi, logout,
3 breakpoint responsive tanpa overflow. Fondasi UI ini dipakai ulang modul
berikutnya — BUKAN modul import baru (urutan modul/sub-modul setelah
Purchase Invoice masih BELUM diputuskan, lihat § "Modul/Sub-modul Lain —
Sengaja Di-pending" di atas). Detail → `docs/phases/phase-03-dashboard-pelanggan.md`
§ Ringkasan Hasil.

**Update 2026-08-19**: user memberi snapshot lokal dokumentasi resmi
Accurate (`docs/referencehtml/`, gitignored) — lihat
`docs/architecture/architecture-accurate-integration.md` § "Dokumentasi
Resmi" & § 3. Status 2 gap sebelumnya:
- ✅ **Scope Accurate untuk Purchase Invoice — TERVERIFIKASI**. Pola
  `{resource}_{aksi}` yang sudah ditebak di `accurate-scopes.ts` benar
  (`purchase_invoice_view`/`save`/`delete`). Field request `save.do`/
  `bulk-save.do` juga sudah didokumentasikan lengkap.
- ✅ **`ACCURATE_CLIENT_ID`/`SECRET` — SELESAI, DAN SUDAH DIUJI END-TO-END
  SUNGGUHAN 2026-08-19.** Aplikasi "facport" didaftarkan di Accurate,
  kredensial masuk `apps/api/.env`. Alur penuh dites pakai browser user
  asli: authorize URL → login Accurate → consent screen → callback →
  **token exchange BERHASIL, access+refresh token asli tersimpan
  terenkripsi di `accurate_connections`**. Satu bug ketemu & diperbaiki
  dalam prosesnya (redirect tujuan salah karena `??` vs `||` pada env
  string kosong) — detail → `docs/lessons-learned.md` entri
  "`env.APP_ORIGIN_PROD ?? fallback` gagal fallback...".
  **Gap baru ketemu dari test ini**: kolom `accurateDbId` di
  `accurate_connections` masih NULL — alur callback saat ini cuma simpan
  token, belum ada langkah pilih & simpan Data Usaha (`db-list.do` →
  `open-db.do`, § "Sesi Data Usaha" di `architecture-accurate-integration.md`).
  Ini WAJIB diselesaikan sebagai bagian awal Fase 02 (bukan reopen Fase 01
  — langkah ini baru relevan begitu ada endpoint data yang benar-benar
  dipakai, yaitu Purchase Invoice di Fase 02), sebelum bisa panggil
  endpoint `/api/purchase-invoice/*` mana pun.

**Update 2026-08-19 (sore)**: client user minta kolom "Akun Hutang" di
import Faktur Pembelian. Dicek langsung ke `open-api/json.do` (live, bukan
snapshot) — field itu TIDAK ADA di `purchase-invoice/save.do` (bukan
properti transaksi), tapi ADA di `vendor/save.do`
(`vendorPayableAccountListNo`). Kebutuhan sebenarnya = modul baru **Import
Data Vendor** (data master, bukan transaksi) — didraf sebagai **Fase 04**,
status `Planned`, **BELUM dieksekusi** karena user masih konfirmasi detail
kebutuhan ke client dulu. Detail lengkap → `docs/phases/phase-04-import-vendor.md`
dan `docs/architecture/architecture-accurate-integration.md` §
"Vendor (Data Master)".

**Terobosan besar 2026-08-19**: ditemukan `https://account.accurate.id/open-api/json.do`
— spec OpenAPI RESMI Accurate yang **publik, tidak login-gated**, bisa
diakses langsung oleh Claude kapan saja (via GitHub repo
`aol-integration/accurate-schema-mcp`). Ini artinya verifikasi scope/field
untuk modul-modul lain (Sales Invoice, Purchase Order, dst) di fase-fase
berikutnya TIDAK PERLU lagi minta snapshot manual dari user — tinggal
`curl`/fetch endpoint itu. Sudah dipakai untuk memperbaiki
`accurate-scopes.ts` (semua 222 scope resmi dicek, 4 entry yang tadinya
salah tebak sudah dikoreksi: `item_receipt_*`→`receive_item_*`,
`payment_*`→`other_payment_*`, `receipt_*`→`other_deposit_*`,
`journal_*`→`journal_voucher_*`) dan menemukan rate limit resmi (8
req/detik, 8 concurrent) + pola error Accurate (`{"s": false}` di HTTP 200,
bukan cuma HTTP error code). Detail lengkap →
`architecture-accurate-integration.md` § "Dokumentasi Resmi", § 4, § 5, § 6.
- ✅ **Gap baru ketemu, SEKARANG SEPENUHNYA TERSELESAIKAN**: alur OAuth
  ternyata butuh langkah TAMBAHAN di luar access_token — "Sesi Data Usaha"
  (`open-db.do` → host API dinamis + `X-Session-ID`, wajib dikirim di tiap
  panggilan endpoint data). Semua parameter DAN contoh response
  (`db-list.do`, `open-db.do`) sudah terverifikasi via kombinasi
  `api-docs.do` (parameter) + https://accurate.id/api-integration/api-example/
  (contoh response nyata, sumber publik). Detail lengkap →
  `architecture-accurate-integration.md` § "Sesi Data Usaha (Company
  Database)".

## Update 2026-08-28 — 3 Feedback Client Pasca-Presentasi
Presentasi 2026-08-27 (domain sementara `ane.web.id`) menghasilkan 3
masukan client, diprioritaskan bareng user:
1. **Fase 07** — tampilkan nomor faktur di tabel "Detail per Baris"
   halaman hasil import (`Planned`). **Klarifikasi 2026-08-28**: draf awal
   sempat disangka minta pencarian lintas-batch — SALAH, ternyata cukup
   nampilin nomor faktur (data sudah ada di response API,
   `rows[].rawData`) di halaman detail batch yang sudah ada. Scope jauh
   lebih kecil dari draf awal, frontend-only.
2. **Fase 06** — Faktur Pembelian multi-item, **PRIORITAS EKSEKUSI DULUAN**
   (`Planned`) — akar penyebab error nyata di demo ("Sudah ada data lain
   dengan No Form..."), lihat ADR-0011.
3. **"Batal Import" (hapus dari Accurate)** — DITUNDA sengaja, dikerjakan
   paling akhir karena destructive terhadap data akuntansi asli client.
   Rasional lengkap → § "Modul/Sub-modul Lain — Sengaja Di-pending" di atas.

Urutan eksekusi: Fase 06 dulu (dampak terbesar, benerin bug demo), baru
Fase 07, baru "Batal Import" (kalau/setelah di-scope resmi jadi fase).

**Fase 06 — sisi kode selesai 2026-08-28** (status TETAP `In Progress`,
BUKAN `Done` — menunggu verifikasi Accurate nyata setelah deploy, sesuai
standar project Fase 02/05). Baris Excel Bill No sama dikelompokkan jadi 1
faktur multi-item — akar penyebab error demo 2026-08-27 diperbaiki di
level desain. 9 unit test baru lolos, full suite 48/48, typecheck 0 error,
security review 0 temuan. Detail lengkap →
`docs/phases/phase-06-purchase-invoice-multi-item.md` § Ringkasan Hasil.

**Fase 06 Done 2026-08-28** — diverifikasi PENUH lewat HTTP API sungguhan
ke Data Usaha Accurate nyata: 2 baris Excel Bill No sama → 1 faktur
(`accurateTransactionId` sama di kedua baris). Gap infra tambahan ketemu
& diperbaiki: service `worker` (pg-boss) tidak pernah ada di
`docker-compose.prod.yml`/`.staging.yml` sejak awal project — job import
tidak pernah diproses sama sekali di server manapun sampai sekarang.
Detail lengkap → `docs/phases/phase-06-purchase-invoice-multi-item.md`
§ Ringkasan Hasil, `docs/lessons-learned.md` entri 2026-08-28.

## Update 2026-08-28 — Fase 08: Retry Cerdas (Update Faktur Existing)
Ditemukan pasca-verifikasi Fase 06: batch `8b622538` (akun
`user1@fasport.com`, diproses SEBELUM Fase 06 ada) punya baris `success`
+ baris `failed` lain dengan Bill No sama, ditolak Accurate sebagai
duplikat — retry biasa TIDAK memperbaiki (tetap coba CREATE, tetap
ditolak, dikonfirmasi via retry nyata). User eksplisit menolak perbaikan
manual ke data production ("tidak boleh kita yg bereskan, harus melalui
mesin yg kita bangun") dan meminta fitur baru dipicu dari tombol **Retry
existing** (bukan tombol baru).

Riset+test call NYATA ke faktur Accurate `#150` (Data Usaha "PT Frozen
Food") MENGKONFIRMASI `purchase-invoice/save.do` mendukung mode
UPDATE/append (kirim `id` faktur + `detailItem[]` berisi item lama via
`id` + item baru tanpa `id`) — mengoreksi klaim ADR-0011 yang bilang ini
tidak didukung. Detail lengkap → ADR-0012,
`docs/phases/phase-08-purchase-invoice-update-existing.md`.

**Fase 08 Done 2026-08-28** — diverifikasi PENUH: retry batch `8b622538`
(akun `user1@fasport.com`) via tombol Retry sungguhan → 6/6 baris
`success`, 0 gagal. Dikonfirmasi ULANG langsung ke Accurate (`detail.do`
fresh, bukan cuma status DB lokal): faktur #200 dan #250 masing-masing
`detailItem` NAIK dari 1 jadi 2. 1 bug ditemukan & diperbaiki SAAT
verifikasi (field `vendor.no` seharusnya `vendor.vendorNo` — dikonfirmasi
dari raw JSON nyata, bukan asumsi). Gap operasional besar juga ketemu di
proses ini: CI auto-deploy TIDAK PERNAH benar-benar jalan sejak awal
(secret SSH server tidak pernah diisi) — detail lengkap →
`docs/lessons-learned.md` entri 2026-08-28 "CI auto-deploy tidak pernah
jalan...".

## Update 2026-08-28 — Fase 09: Batal Import
Item ke-3 (terakhir) dari 3 feedback client, akhirnya digarap setelah
Fase 06 & 08 solid. **1 bug SERIUS ketemu & diperbaiki SAAT verifikasi
nyata** (bukan lolos ke production): desain awal ADR-0013 mau
"menyusutkan" faktur gabungan lintas-batch (hapus 1 item via `save.do`,
sisakan yang lain) — verifikasi nyata membuktikan ini TIDAK BEKERJA
(`save.do` bersifat upsert-only, item yang di-omit dari payload TETAP
ADA di Accurate walau job melaporkan sukses/`cancelled`). Dikoreksi via
ADR-0014: faktur gabungan sekarang DIBLOKIR total dari auto-cancel
(bukan disusutkan) — cakupan "Batal Import" jadi lebih sempit dari
rencana awal (cuma faktur yang 100% milik 1 batch yang bisa dihapus
otomatis), tapi AMAN (tidak ada silent no-op yang salah lapor sukses).
Diverifikasi PENUH lewat 3 skenario nyata ke Data Usaha Accurate asli
("PT Frozen Food"). Detail lengkap → ADR-0013, ADR-0014,
`docs/phases/phase-09-batal-import.md`.

**Fase 09 Done 2026-08-28** — deploy ulang (v1.6.1) setelah fix ADR-0014,
diverifikasi ULANG nyata: faktur murni 1 batch → hapus utuh sukses;
faktur gabungan lintas-batch → diblokir dengan benar, batch
`cancelled_partial`, faktur Accurate TIDAK berubah sama sekali (jujur,
tidak ada silent no-op). Ini fase terakhir dari 3 feedback client
pasca-presentasi 2026-08-27 — semua 3 item sekarang selesai (Fase 06,
07, 09).

## Update 2026-08-28 — Edit Baris Gagal (langsung di aplikasi, tanpa upload ulang)
Permintaan user setelah Fase 09: baris `failed` bisa diedit langsung di
UI (dialog per-baris, semua kolom yang ter-mapping, pesan error Accurate
ditampilkan, peringatan kalau baris ini satu grup faktur/Bill No dengan
baris lain — ADR-0011) lalu dipakai ulang tombol "Retry baris gagal" yang
sudah ada — TANPA perlu upload ulang file Excel. Feasible langsung karena
arsitektur existing sudah pas: `rawData` disimpan per-baris di DB, retry
sudah baca ulang `rawData` + `columnMapping` batch, jadi endpoint baru
(`PUT .../rows/:rowId`) cukup update `rawData` + reset status jadi
`pending` + hapus `errorMessage` lama — TIDAK ADA perubahan di worker.

**Cakupan disengaja tidak termasuk** (dibahas dulu, ditunda): tampilan
grid ala Excel (dipilih dialog per-baris — lebih ringan, cukup untuk
jumlah baris gagal yang biasanya sedikit); auto-validasi konsistensi
vendor antar baris satu grup di dalam dialog (baru divalidasi saat retry
sungguhan, sama seperti sebelumnya — dialog cuma kasih peringatan
informatif). Icon Edit (pencil) & Delete (tempat sampah, hapus LOKAL
saja tanpa sentuh Accurate — beda dari Batal Import) sempat dipasang
placeholder duluan sebelum fungsinya dibangun — Edit sekarang FUNGSIONAL
penuh, Delete masih placeholder (dibahas nanti).

**Diverifikasi PENUH lewat alur nyata**: baris sengaja dibuat gagal
(unit salah di Accurate) → diedit (data diperbaiki jadi unit benar) →
retry → SUKSES, faktur asli tercipta di Accurate dengan data yang benar
(dikonfirmasi `detail.do` fresh) → dibersihkan. Endpoint dikonfirmasi
butuh auth (401 tanpa sesi login). Typecheck 0 error, test suite 61/61,
security review dijalankan (ownership+validasi konsisten pola endpoint
lain, 0 temuan).

**Bug ditemukan pasca-deploy, lewat laporan user nyata, langsung
diperbaiki**: field tanggal di dialog Edit tampil sebagai angka serial
Excel mentah (mis. `46261`, bukan tanggal terbaca) — dan kalau baris
disimpan TANPA sentuh field itu, angka ikut ke-`String()`-kan jadi teks
yang tidak lagi dikenali `toAccurateDate()` di worker, tanggal rusak
diam-diam. Diperbaiki: dialog normalisasi tanggal ke DD/MM/YYYY saat
tampil (replika persis algoritma backend), selalu simpan balik dalam
format itu. Detail lengkap → `docs/lessons-learned.md` entri 2026-08-28
"Dialog Edit baris: tanggal (serial Excel) ke-`String()` mentah...".

## Update 2026-08-28 — Delete (hapus riwayat lokal, tidak sentuh Accurate)
Icon Delete diaktifkan (dashboard + halaman arsip). Endpoint baru
`DELETE /purchase-invoice/import/:batchId` — hapus batch+baris (cascade
FK) dari Facport SAJA, TIDAK PERNAH memanggil Accurate — beda total dari
"Batal Import" (Fase 09). **Keputusan eksplisit user (dikonfirmasi lewat
tanya-jawab kritis)**: boleh dipakai untuk batch APA PUN termasuk yang
sudah punya baris sukses ke Accurate — jejak lokal ke transaksi itu
hilang permanen (risiko yang disadari & diterima, bukan dibatasi di
endpoint). Diblokir cuma untuk batch yang sedang diproses job lain
(`processing`/`cancelling`). Audit log ditulis SEBELUM delete (termasuk
flag `hadAccurateSuccess`) supaya tetap ada jejak minimal walau record
batch-nya sendiri hilang. Konfirmasi UI klik biasa (bukan type-to-confirm
seperti Batal Import — risiko lebih rendah, tidak menyentuh data
akuntansi asli pihak ketiga).

**Diverifikasi PENUH lewat alur nyata**: batch dengan baris SUKSES ke
Accurate (invoice asli tercipta) → delete lokal → batch+baris lokal
BENAR hilang, audit log tercatat — TAPI faktur di Accurate dikonfirmasi
`detail.do` fresh MASIH ADA UTUH (Delete benar-benar tidak pernah
menyentuh Accurate). Endpoint dikonfirmasi butuh auth (401 tanpa sesi).
Typecheck 0 error, test suite 61/61, security review 0 temuan.

## Update 2026-08-28 — Fase 10: Admin Dashboard
Admin dashboard (dulu placeholder) sekarang punya: pengaturan umum +
retensi data import (default 2 hari, batas keras 7 hari — data client
sensitif, tidak boleh disimpan lama, § "Retensi Data Import" di
`architecture-subscription.md`), kelola paket per-modul TANPA harga
(ADR-0015 — Facport
sementara supporting app, bukan produk mandiri), kelola user + assign
langganan manual. Backend admin (Fase 00/01) sebelumnya cuma
create/update/delete TANPA endpoint list sama sekali — dilengkapi fase
ini. `AppShell` direfactor dipakai ulang admin+customer (dulu hardcode
customer-only).

Diverifikasi PENUH lewat 4 skenario nyata job retensi (default/muda/
override/processing, semua sesuai ekspektasi, audit log tercatat) +
replika query admin ke data production nyata. Verifikasi END-TO-END
lewat browser sungguhan (login admin → buat user → assign paket → cek
gating) TIDAK dilakukan sesi ini (percobaan fabrikasi sesi Better Auth
gagal) — gating modul sendiri BUKAN kode baru fase ini, sudah terbukti
jalan lewat pemakaian nyata sepanjang sesi. Detail lengkap → ADR-0015,
`docs/phases/phase-10-admin-dashboard.md`.

**Bug produksi ditemukan pasca-deploy Fase 10 (lewat laporan user), 500
total di app.ane.web.id DAN admin.ane.web.id sekaligus**: refactor
`AppShell` (dipakai ulang admin+customer) sempat oper `navItems` (berisi
komponen icon `lucide-react`) sebagai prop dari Server Component ke
Client Component — dilarang React Server Components (`Uncaught Error:
Minified React error #441` / "Functions cannot be passed directly to
Client Components"). Diperbaiki: Server Component cuma oper string
`surface`, komponen client lookup nav-nya sendiri. Detail lengkap →
`docs/lessons-learned.md` entri 2026-08-28 "Next.js RSC: referensi
komponen icon di prop Server→Client Component...".

## Update 2026-09-01/02 — 2 bug produksi + 1 UX improvement seputar Edit Baris Gagal/Retry
Dipicu laporan user pasca-pakai fitur "Edit Baris Gagal" (2026-08-28) di
production nyata (`app.ane.web.id`):

1. **Bug: tombol "Retry baris gagal" hilang setelah semua baris gagal
   diedit** (status jadi `pending`, kondisi tombol cuma cek
   `summary.failed > 0`). Fix di `[batchId]/page.tsx` + guard tambahan
   `batch.columnMapping` (cegah tombol salah muncul di batch yang belum
   dikonfirmasi mapping-nya). Deploy `v1.10.5`. Detail →
   `docs/lessons-learned.md` entri 2026-09-01.
2. **Investigasi error Accurate "Sudah ada data lain dengan No Form..."**
   — dikonfirmasi BUKAN bug Facport, tapi typo user di kolom Excel "Bill
   No" (beda 1 karakter dari faktur sebelumnya) sementara kolom "Trans
   No" tetap sama dengan faktur existing — kombinasi ini bikin "Retry
   Cerdas" (Fase 08) gagal mengenali faktur yang sama, CREATE ulang
   ditolak Accurate. Investigasi pakai query read-only langsung ke
   Postgres production (dijalankan USER via SSH, akses langsung
   Claude Code ke DB production di-block otomatis oleh permission
   classifier). Ide perbaikan mekanisme (pre-flight check Trans No
   sebelum CREATE) dicatat sebagai technical debt, BELUM dieksekusi —
   user cuma minta perbaikan UX form, bukan fix mekanisme. Detail →
   `docs/lessons-learned.md` entri 2026-09-02.
3. **UX improvement dialog Edit Baris** (respons ke temuan #2 —
   `edit-row-dialog.tsx`): kolom wajib ditandai `*` + border beda,
   kolom yang kosong di-highlight merah individual + teks "Wajib
   diisi." (bukan cuma disebut di teks gabungan atas), validasi wajib
   dicek di client dulu sebelum panggil API, placeholder contoh isian
   untuk field yang formatnya gampang salah tebak (BUKAN "default
   Accurate" — itu bervariasi per company, sengaja tidak diklaim
   statis), dan dialog auto-scroll ke atas begitu ada error supaya
   notifikasi pasti kelihatan (sebelumnya kalau user scroll ke bawah
   form panjang lalu Simpan gagal, notifikasi error di atas tidak
   kelihatan sama sekali). Deploy `v1.11.0`. Typecheck 0 error, test
   suite 61/61 (tidak berubah, murni frontend), security review 0
   temuan.

Kedua deploy diverifikasi container `healthy` (`docker ps`) oleh user
langsung di server; verifikasi END-TO-END via browser sungguhan untuk
item #3 (cek tanda `*`, highlight merah, auto-scroll) BELUM dikonfirmasi
user di sesi ini — cek dulu sebelum anggap fitur ini "selesai diverifikasi
production" kalau ditanya lagi nanti.

## Update 2026-09-05 — Label sidebar "Import Data" (dashboard `app.`) ikut nama paket, bukan nama fitur generik
Permintaan user: link di grup "Import Data" sidebar customer supaya
menunjukkan nama PAKET yang admin buat (mis. "Purchase Invoice"), bukan
teks fitur generik ("Import Faktur Pembelian") — biar user langsung
sadar itu bagian paket apa yang dia beli. Disepakati lewat 2 putaran
klarifikasi (AskUserQuestion, mockup teks): **cuma teks tampilan yang
berubah**, href/ikon/urutan/filter modul semua PERSIS sama seperti
sekarang — TIDAK ada perubahan arsitektur/ADR/harga/OAuth (beda dari
opsi awal yang sempat dibahas: menjadikan "Import Akun Hutang Pemasok"
modul terpisah berbayar — user batalkan opsi itu, minta hanya label).

Untuk modul `purchase_invoice` yang menaungi 2 link ("Import Faktur
Pembelian" & "Import Akun Hutang Pemasok") — user pilih EKSPLISIT:
kedua link SAMA-SAMA tertulis nama paket ("Purchase Invoice"), user
paham konsekuensinya (tidak bisa dibedakan dari teks, cuma dari posisi
link), bukan disamarkan salah satu tetap generik.

**Implementasi**: prop baru `modulePlanNames?: Record<moduleKey, planName>`
dialirkan `app/(protected)/layout.tsx` → `AppShell` → `Sidebar` → `NavRow`
(`displayLabel` override, fallback ke `item.label` kalau tidak ada map).
`navGroupsFor()`/`navItemsFor()`/`breadcrumbs.tsx`/`NAV_GROUPS_BY_SURFACE`
statis TIDAK disentuh sama sekali — filter modul & breadcrumb tetap pakai
label generik seperti sebelumnya (di luar scope yang diminta). Admin
surface tidak terpengaruh (prop baru opsional, tidak dioper di sana).
Typecheck 0 error, lint 0 error, test suite 173 pass/0 fail (tidak
berubah, murni UI). Verifikasi visual browser BELUM dilakukan (ekstensi
Chrome tetap tidak tersambung) — user disarankan cek langsung di
`app.localhost:6209` (akun `user@facport.com`, subscribe paket
"Purchase Invoice") untuk konfirmasi tampilannya sesuai.

## Update 2026-09-05 — Fase 28 Done: "Import Akun Hutang Pemasok" jadi sub-modul berbayar terpisah (ADR-0026)
Lanjutan langsung dari diskusi label sidebar di atas — setelah 2 putaran
klarifikasi (user sempat bilang "cuma label", lalu tegas balik ke "jadi
modul berbayar terpisah"), user KONFIRMASI FINAL: pisahkan fitur ini
dari Purchase Invoice, bukan cuma ganti teks. Ini keputusan arsitektur
(model bisnis + scope OAuth berubah), jadi ditulis ADR-0026 dulu
(supersede bagian ADR-0019 & keputusan Fase 04 yang membundelnya) +
phase doc `docs/phases/phase-28-modul-akun-hutang-pemasok-terpisah.md`
sebelum eksekusi, sesuai SOP.

Ringkasan teknis: 6 file diubah (scope OAuth dipindah ke sub-modul baru
`vendor_payable_account`, union modul admin plans, 6 endpoint
`moduleAccess`, 1 test helper, katalog modul frontend, moduleKey nav
sidebar) — SEMUA mekanis/terlokalisasi, 0 endpoint baru. Typecheck 0
error, lint 0 error, test 173 pass/0 fail, security review inline 0
temuan. Juga diperbaiki: status stale di
`architecture-accurate-integration.md` § "Vendor (Data Master)" yang
masih tertulis "BELUM DIEKSEKUSI" padahal sudah live sejak Fase 04
(luput diupdate saat itu, ketahuan pas riset ADR ini).

**Konsekuensi nyata yang perlu ditindaklanjuti user**: (1) belum ada
plan `vendor_payable_account` di database — admin harus bikin sendiri
di `/admin/plans` sebelum fitur ini bisa dijual; (2) akun test
`user@facport.com` kehilangan akses gratis ke Akun Hutang Pemasok
(sekarang cuma subscribe Purchase Invoice) — perlu subscribe plan baru
itu juga kalau mau tes; (3) koneksi Accurate existing perlu "Hubungkan
Ulang" untuk scope yang sudah dipisah. Detail lengkap & rasional →
`docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`.

## Update 2026-09-05 — Fase 29 Done: role "Admin" (terbatas) vs "Super Admin" + nonaktifkan user (ADR-0027)
User minta pemisahan customer vs "user untuk admin". Audit dulu (§
`docs/architecture/architecture-user-roles.md`, dokumen baru) sebelum
eksekusi — ketemu cuma 1 role admin (izin penuh) selama ini, halaman
"Pengguna" campur semua akun tanpa filter, dan TIDAK ADA fitur hapus/
nonaktifkan user sama sekali. 3 putaran klarifikasi sampai user
tegaskan: 2 role tetap (Super Admin = penuh, Admin = sama tapi TIDAK
bisa tambah/nonaktifkan user), plus bangun kapabilitas nonaktifkan
(reversibel, bukan hapus permanen — § ADR-0027).

**Security review (subagent, WAJIB karena fase ini ubah alur login
langsung) menemukan 1 Critical + 1 High** — KEDUANYA diperbaiki &
diverifikasi ulang manual (curl), bukan cuma lolos code review:
1. **Critical** — intercept login custom (perlu ditulis manual karena
   Better Auth 1.7.1 yang terpasang TIDAK punya `hooks`/`databaseHooks`
   di top-level options, diverifikasi langsung ke `.d.mts`) rentan
   bypass total via email huruf besar/kecil beda — Better Auth sendiri
   normalisasi lowercase, intercept kita tidak. Akun `disabled` BISA
   login lagi cuma dengan uppercase-kan 1 huruf di email.
2. **High** — `permissionPlugin` (dipakai HAMPIR SEMUA endpoint di
   seluruh app) tidak pernah cek kolom `disabled` — kalau akun
   dinonaktifkan lewat jalur SELAIN endpoint resmi (SQL manual dll),
   sesi lama tetap valid selamanya, tidak ada lapis lain yang menangkap.

Juga 1 Medium (race condition TOCTOU di guard "jangan nonaktifkan Super
Admin aktif terakhir", fix pakai `db.transaction()`+row lock) — semua
fixed. Detail lengkap tiap temuan → `docs/decisions/adr-0027-role-staff-dan-nonaktifkan-user.md`.

Ringkasan teknis: role baru `staff` (DB, label UI "Admin"), permission
split `users.view`/`users.manage`, endpoint baru (`PATCH .../disable`,
`.../enable`, `POST /admin/staff`), UI (label role, badge Nonaktif,
tombol toggle, form Tambah Staff). Typecheck 0 error, lint 0 error, test
186 pass/0 fail (naik dari 173). Data test dibersihkan lagi, sisa
`admin@facport.test` + `user@facport.com`. Verifikasi visual browser
tidak dilakukan (Chrome extension tidak tersambung).

## Update 2026-09-05 — Menu "Tim Internal" terpisah dari "Pengguna" (lanjutan Fase 29)
User cek halaman `/admin/users`, klarifikasi ulang: bukan soal istilah
role, tapi butuh MENU KHUSUS tambah/nonaktifkan staff, terpisah dari
Pengguna (customer). Ini baru benar-benar menuntaskan permintaan ASLI
di awal thread ini ("pisahin customer dan user untuk admin") — Fase 29
sebelumnya baru selesai di level ROLE, belum di level TAMPILAN.

Perubahan murni aditif (reuse endpoint, TIDAK ada ADR baru): `GET
/admin/users` sekarang difilter cuma customer; endpoint baru `GET
/admin/staff` (list admin+staff); halaman baru "Tim Internal"
(`/admin/staff`) + nav item baru di sidebar; halaman "Pengguna" kolom
Role dihapus (sudah pasti selalu "Pelanggan"), diganti kolom Status.
Detail lengkap → `docs/phases/phase-29-role-staff-dan-nonaktifkan-user.md`
§ Update 2026-09-05.

Typecheck 0 error, lint 0 error, test 190 pass/0 fail (naik dari 186).
Data test dibersihkan lagi.

## Update 2026-09-05 — Fase 30 Done: admin bisa lihat detail user + log import (read-only)
User minta: saat customer telepon minta bantuan, admin bisa buka detail
user di `/admin/users` dan lihat log import per baris (mana yang error)
— PERSIS tampilan yang dilihat user di `app.`, supaya admin bisa kasih
advice yang benar. Riset dulu: semua modul import (Faktur Pembelian/
Penjualan, Akun Hutang Pemasok) ternyata sudah 1 tabel shared
(`import_batches`/`import_batch_rows`), jadi cukup 2 endpoint admin
generik (bukan 3 per-modul) — `GET /admin/users/:id/import-batches`
(profil+riwayat) dan `GET /admin/import-batches/:batchId` (detail,
bentuk respons SAMA PERSIS endpoint customer).

Disepakati 2 hal dulu sebelum eksekusi: (1) tampilan REPLIKASI PERSIS
per modul (bukan 1 versi generik) — 3 tampilan beda persis seperti versi
customer; (2) READ-ONLY total, tidak ada Retry/Edit dari admin (tetap
aksi self-service user sendiri). Halaman baru: `/admin/users/:id`
(profil + riwayat batch lintas modul) dan
`/admin/import-batches/:batchId` (1 route, branch render 3 tampilan
berdasar `batch.module`).

Typecheck 0 error, lint 0 error, test 196 pass/0 fail (naik dari 190, 6
test baru). Diverifikasi manual end-to-end via curl (bikin batch nyata
dgn baris sukses+gagal, akses lewat sesi admin asli via proxy dev)
sebelum ditutup. Detail lengkap → `docs/phases/phase-30-admin-lihat-log-import-user.md`.

## Update 2026-09-05 — Fase 31 Done: fitur Lupa Password (prioritas #1 dari audit fondasi)
User minta audit fondasi sebelum lanjut fitur baru — ketemu 2 gap
nyata: (1) tidak ada fitur Lupa Password sama sekali, (2) `apps/web`
nol test otomatis walau `architecture-testing.md` mensyaratkan ada.
User pilih Lupa Password sebagai prioritas #1 (paling mendesak, langsung
berdampak ke pelanggan asli).

Ternyata Better Auth (versi 1.7.1 terpasang) SUDAH punya endpoint reset
password LENGKAP sebagai bagian CORE (`/request-password-reset`,
`/reset-password/:token`, `/reset-password` — bukan plugin terpisah,
sudah otomatis ter-mount). Gap sebenarnya cuma 2: (1) callback
`sendResetPassword` belum diisi (Better Auth aktif menolak dgn
"RESET_PASSWORD_DISABLED" tanpa itu), (2) belum ada halaman frontend
untuk 2 langkah alurnya (minta link, atur password baru). Dikerjakan:
1 callback kirim email (`lib/auth.ts`) + 4 halaman baru (2 surface × 2
langkah) + link "Lupa password?" di form login + pengecualian guard
proxy.ts.

Typecheck 0 error, lint 0 error, test 198 pass/0 fail (naik dari 196, 2
test baru — end-to-end PAKAI TOKEN ASLI dari tabel `verification`,
bukan mock). Diverifikasi manual lewat proxy dev juga (curl: sign-up →
lupa password → ambil token asli dari DB → reset → login password baru
sukses, password lama ditolak) sebelum ditutup. Detail lengkap →
`docs/phases/phase-31-lupa-password.md`.

**Gap #2 (nol test frontend) BELUM dikerjakan** — user pilih Lupa
Password dulu sebagai prioritas, gap ini masih terbuka, tunggu arahan
selanjutnya.

## Update 2026-09-05 — Fase 32 Done: fondasi test frontend (gap #2 dari audit fondasi)
Lanjutan gap #2 yang tertunda di atas — user minta lanjut setelah Fase
31 selesai. Dipasang: `bun test` (SAMA dgn apps/api, bukan Vitest/Jest
terpisah) + React Testing Library + `happy-dom` + jest-dom, dibuktikan
lewat 10 test NYATA untuk 3 komponen Fase 31 (Login/ForgotPassword/
ResetPasswordForm) — network call di-mock `mock.module()` bawaan Bun.

Proses setup ketemu 2 bug non-obvious yang didiagnosis sampai akar
penyebab (dicatat detail di `docs/phases/phase-32-fondasi-test-frontend.md`
§ Keputusan Kecil + `docs/architecture/architecture-testing.md`): (1)
file preload registrasi DOM HARUS terpisah dari import testing-library
(ES import hoisting bikin `screen` singleton `@testing-library/dom`
"lahir rusak" kalau digabung 1 file), (2) `<input type="email">`
memblokir submit total untuk value salah format SEBELUM sempat ke JS
— test validasi client-side field ini wajib pakai field kosong, bukan
string "kelihatan salah".

Typecheck 0 error, lint 0 error, test `apps/web` 11 pass/0 fail (baru).
`bun run test` root sekarang total 209 test (198 api + 11 web). Kedua
gap dari audit fondasi (Lupa Password, test frontend) SELESAI.

## Update 2026-09-05 — Audit modul (dieksekusi vs belum) + rapikan dokumentasi arsitektur per-modul
User minta inventarisasi modul Accurate: mana yang sudah dieksekusi,
mana yang belum, dan pastikan masing-masing punya arsitektur MATANG.

**Hasil audit (cek langsung ke kode, bukan asumsi):**
- **Sudah dieksekusi (3)**: Faktur Pembelian (`purchase_invoice`,
  Fase 02/05/06/08/09), Faktur Penjualan (`sales_invoice`, Fase 13),
  Akun Hutang Pemasok (`vendor_payable_account`, Fase 04, kategori Data
  Master bukan modul transaksi) — SEMUA punya backend route + halaman
  customer + worker processing lengkap.
- **BELUM dieksekusi sama sekali (3)**: Sales Receipt, Purchase
  Payment, Jurnal Umum — cuma nama di katalog `MODULE_OPTIONS` + scope
  OAuth disiapkan di `accurate-scopes.ts`, 0 route/halaman/worker logic.

**Temuan dokumentasi (jawab "arsitektur matang?"): TERNYATA BELUM.**
Ketiga modul yang sudah jalan SEMUA numplek di 1 file
(`architecture-accurate-integration.md`, 765 baris) yang berantakan:
section Fase 05 (Purchase Invoice) MUNCUL 2X (duplikat persis), judul
Fase 06 masih tertulis "🆕 DIRENCANAKAN" padahal sudah lama Done, dan
section "Sales Invoice" nyempil di TENGAH beberapa sub-section Purchase
Invoice (urutan heading tidak logis).

**Fix**: dipisah jadi 1 file per modul (dipilih user) + trim file lama
jadi cuma infra BERSAMA (OAuth, skema bulk-import generik, rate limit,
error handling):
- `docs/architecture/architecture-accurate-integration.md` (405 baris,
  turun dari 765 — infra bersama SAJA)
- `docs/architecture/architecture-purchase-invoice.md` (baru, 190
  baris — duplikasi dihapus, judul stale diperbaiki)
- `docs/architecture/architecture-sales-invoice.md` (baru, 107 baris)
- `docs/architecture/architecture-vendor-payable-account.md` (baru,
  164 baris)

Referensi navigasi utama diperbaiki (CLAUDE.md Peta Dokumen, tabel fase
di atas untuk Fase 02/04/05/06/08/09/13, ADR-0026, phase-04) — mention
generik yang cuma nunjuk § 1/§ "Dokumentasi Resmi" TIDAK diubah (masih
valid, section itu tetap di file infra bersama). Tidak ada perubahan
kode — murni dokumentasi, typecheck tetap 0 error.

## Update 2026-09-05 — Fase 33 Done: Modul Purchase Payment
Lanjutan dari audit modul di atas — user pilih eksekusi Purchase
Payment lebih dulu dari 3 modul yang belum dikerjakan (Sales Receipt,
Purchase Payment, Jurnal Umum), satu-satu, riset arsitektur dulu baru
kode (§ `docs/architecture/architecture-purchase-payment.md`, ditulis
sebelum sesi ini lanjut ke eksekusi).

**Temuan riset paling penting**: modul ini BUKAN mirror Purchase
Invoice seperti Sales Invoice dulu — ini aplikasi PEMBAYARAN ke faktur
yang SUDAH ADA di Accurate (`detailInvoice[].invoiceNo`), bukan
transaksi pembuatan baru. Konsekuensi desain: 1 baris Excel = 1
pembayaran = 1 faktur (TIDAK pakai grouping Bill No/PO Number seperti
PI/SI), vendor & faktur WAJIB sudah terdaftar (TIDAK auto-create, beda
dari PI), dan 1 kolom "Jumlah Bayar" cukup untuk mendukung pelunasan
penuh MAUPUN pembayaran sebagian sekaligus (`paymentAmount` tidak
divalidasi Accurate terhadap sisa tagihan — dikonfirmasi via OpenAPI
spec, sesuai permintaan user "dukung keduanya").

Implementasi mengikuti pola `vendor_payable_account` (Fase 04) 1:1:
mapping file, service `savePurchasePayment()` (langsung `save.do`
tanpa lookup), route 6-endpoint, halaman upload+detail, entri sidebar
(`moduleKey: "purchase_payment"`). Tidak ada ADR baru (keputusan sudah
tuntas di architecture doc sebelum eksekusi, sama seperti Fase 04).

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 205
pass/0 fail (7 baru untuk modul ini — guard 401/403, ownership batch,
validasi mapping wajib, list ter-scope subscription). Payload
`buildPurchasePaymentPayload()` diverifikasi manual cocok persis
skema `save.do` dari OpenAPI spec. Security review inline: 0 temuan
(pola reuse dari route yang sudah teraudit Fase 04/28). Detail lengkap
→ `docs/phases/phase-33-modul-purchase-payment.md`.

Sisa 2 modul (Sales Receipt, Jurnal Umum) BELUM dikerjakan — menunggu
arahan user lanjut satu-satu, sesuai permintaan eksplisit.

## Update 2026-09-05 — Fase 34 Done: Modul Sales Receipt
Lanjutan langsung dari Fase 33 — user minta lanjut modul berikutnya,
riset arsitektur dulu (§ SOP), baru implementasi, konsisten dengan
modul lain termasuk contoh Excel-nya.

Riset OpenAPI spec (`sales-receipt/save.do`) mengonfirmasi modul ini
adalah bayangan cermin PERSIS Purchase Payment (Fase 33) — struktur
field IDENTIK 100% (`vendorNo`→`customerNo`, faktur acuan Faktur
Penjualan bukan Faktur Pembelian). Semua 4 keputusan desain (1
baris=1 penerimaan=1 faktur, tidak auto-create customer/faktur, 1
kolom Jumlah Bayar untuk lunas/sebagian, tidak ada Batal Import)
di-reuse langsung dari Fase 33 tanpa perlu konfirmasi ulang user — 0
keputusan baru. Header Excel dibuat konsisten dengan
`sales-invoice.mapping.ts` ("Customer No") supaya user yang sudah kenal
template Sales Invoice tidak bingung.

Implementasi mengikuti pola `purchase-payment` 1:1: mapping file,
service `saveSalesReceipt()`, route 6-endpoint, halaman upload+detail,
entri sidebar (icon `HandCoins`, beda dari `Wallet` Purchase Payment
untuk bedakan uang masuk/keluar). Tidak ada ADR baru.

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 212
pass/0 fail (7 baru untuk modul ini, naik dari 205). Payload
`buildSalesReceiptPayload()` diverifikasi manual cocok persis skema
`save.do`. Security review inline: 0 temuan (pola reuse dari route yang
sudah teraudit Fase 33). Detail lengkap →
`docs/phases/phase-34-modul-sales-receipt.md`.

**Sisa 1 modul terakhir dari katalog 5 sub-modul ADR-0019: Jurnal Umum
(Journal Voucher)** — arsitekturnya beda paling jauh (GL debit/kredit
lines, tanpa vendor/customer sama sekali), BELUM diriset sama sekali,
menunggu arahan user untuk lanjut.

## Update 2026-09-05 — Fase 35 Done: Modul Jurnal Umum (modul TERAKHIR katalog 5 sub-modul)
Lanjutan langsung dari Fase 34 — user minta lanjut modul terakhir,
riset arsitektur dulu (§ SOP, ditegaskan ulang user mid-turn: "harus
mulai dari arsitektur -> implementasi -> test").

Riset OpenAPI spec (`journal-voucher/save.do`) menemukan modul ini BEDA
TOTAL dari 4 modul lain: transaksi akuntansi murni (debit/kredit ke
akun COA), TANPA vendor/customer, dan butuh MINIMAL 2 baris (debit+
kredit, WAJIB seimbang) per transaksi — beda dari pola "1 baris = 1
transaksi" Purchase Payment/Sales Receipt. Karena ini genuinely
keputusan arsitektur baru (bukan mirror), 2 opsi granularitas Excel
dipresentasikan ke user via AskUserQuestion SEBELUM kode ditulis: (A)
format lebar 1 baris = 1 jurnal 2-akun lengkap [direkomendasikan
sebagai lebih sederhana], (B) format panjang + grouping by "Nomor
Jurnal" (reuse pola Bill No ADR-0011, mendukung N-akun tapi lebih
kompleks) [direkomendasikan sebagai lebih fleksibel/standar akuntansi].
**User memilih Opsi A** — modul akhirnya SESEDERHANA Purchase Payment/
Sales Receipt (per-baris, tanpa grouping/cross-batch sama sekali).

Satu-satunya logic baru (tidak ada di modul lain): validasi balance
debit=kredit LOKAL sebelum panggil Accurate (hemat rate limit, pesan
error lebih jelas dari sekadar penolakan generik Accurate) — diuji 3
unit test khusus (`journal-voucher.mapping.test.ts`, modul lain tidak
punya test mapping terpisah karena murni passthrough tanpa logic baru).

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 222
pass/0 fail (10 baru: 7 route + 3 unit, naik dari 212). Security review
inline: 0 temuan. Detail lengkap →
`docs/phases/phase-35-modul-jurnal-umum.md`.

**Dengan ini, seluruh katalog 5 sub-modul ADR-0019 + 1 modul Data
Master (ADR-0026) SEMUA sudah punya implementasi end-to-end lengkap**:
Purchase Invoice, Sales Invoice, Vendor Payable Account, Purchase
Payment, Sales Receipt, Jurnal Umum. Tidak ada modul Accurate yang
direncanakan tersisa belum dikerjakan.

## Update 2026-09-06 — Audit konsistensi 6 modul (setelah katalog lengkap)
User minta evaluasi menyeluruh: konsistensi 6 modul, integrasi admin,
retensi data harus sesuai admin settings, gap/bug antara arsitektur doc
vs kode implementasi.

**✅ Sudah konsisten (diverifikasi, bukan cuma diasumsikan):**
- Key modul (`purchase_invoice`/`sales_invoice`/`vendor_payable_account`/
  `purchase_payment`/`sales_receipt`/`journal_voucher`) PERSIS sama di
  `accurate-scopes.ts`, `plans.route.ts`, `module-options.ts`,
  `sidebar.tsx`, dan semua 6 route file — 0 typo.
- Template Excel: semua 6 modul punya endpoint download yang jalan.
- Retensi data import: SUDAH otomatis konsisten di kode (job
  `PURGE_OLD_IMPORTS` generik, tidak filter per `module`, jadi setting
  admin — default 2 hari, maks 7 hari — berlaku sama ke 6 modul tanpa
  kode tambahan). Cuma teks di halaman `/admin/settings` yang stale
  (nyebut cuma 2 modul lama) — **FIXED** (§ di bawah).
- Admin log viewer BACKEND (`admin/import-batches.route.ts`) generik,
  otomatis mencakup 6 modul.

**🐛 Bug ditemukan & di-fix**: halaman admin
`admin/import-batches/[batchId]/page.tsx` (Fase 30) hardcode render
per-modul, TIDAK PERNAH dapat cabang untuk 3 modul baru (Purchase
Payment/Sales Receipt/Jurnal Umum, Fase 33-35, dibangun setelah Fase
30 selesai) — admin yang buka detail batch 3 modul itu cuma lihat
header kosong TANPA tabel per-baris. **FIXED**: tambah
`PurchasePaymentView`/`SalesReceiptView`/`JournalVoucherView` (mirror
`VendorPayableAccountView`) + 3 entri `MODULE_TITLE`. Teks retensi di
`/admin/settings` juga diperbaiki (generik "semua modul", bukan
hardcode 2 nama). Detail root cause → `docs/lessons-learned.md`
2026-09-06.

**⚠️ Gap besar ditemukan, BELUM di-fix (user pilih prioritas: benerin
admin view dulu, gap ini menyusul terpisah)**: fitur self-service
history HANYA pernah dibangun untuk Purchase Invoice & Sales Invoice.
4 modul lain (Vendor Payable Account, Purchase Payment, Sales Receipt,
Jurnal Umum) TIDAK PUNYA:
1. Halaman "Riwayat" (`/module/import/riwayat`) — backend list endpoint
   sudah ada di 6 modul, tapi cuma PI/SI yang punya halaman frontend-nya.
2. Card "Import Terakhir" di dashboard homepage (`app/(protected)/page.tsx`)
   — cuma render untuk PI/SI, hardcode.
3. Dialog "Edit Baris" (edit data baris gagal tanpa upload ulang).
4. Dialog "Hapus Riwayat Batch".
5. "Batal Import" (undo ke Accurate) — INI KEKECUALIAN, sengaja tidak
   ada di Purchase Payment/Sales Receipt/Jurnal Umum (alasan bisnis
   sudah didokumentasikan di masing-masing architecture doc — 2
   transaksi valid beda, bukan duplikat yang perlu dideteksi — BUKAN
   gap). VPA juga tidak punya cancel, tapi alasannya belum pernah
   didokumentasikan eksplisit (dibangun Fase 04, sebelum fitur cancel
   ada sama sekali).

Akibat gap #1-4: customer yang HANYA subscribe salah satu dari 4 modul
itu, setelah upload pertama & pindah halaman, TIDAK ADA cara balik
lihat riwayat import lewat UI sama sekali. Kalau user mau dikerjakan,
ini scope besar (halaman baru × 4 modul) — perlu SOP fase terpisah
(kemungkinan 1 fase per fitur, bukan 1 fase besar per modul, supaya
tetap bisa direview bertahap), BELUM dimulai, menunggu keputusan user
kapan mau lanjut.

## Update 2026-09-06 — Fase 36-39 Done: Paritas Riwayat/Edit Baris/Hapus untuk 4 modul (menutup audit konsistensi)
Lanjutan langsung dari gap #1-4 di atas — user minta eksekusi, dengan
instruksi eksplisit: pastikan konsisten, dan kalau scope-nya besar,
rencanakan per-batch supaya tidak ada yang kelewat. Dieksekusi 4 fase
berurutan (Fase 36 VPA → 37 Purchase Payment → 38 Sales Receipt → 39
Jurnal Umum), Fase 36 jadi TEMPLATE yang direplikasi persis ke 3
lainnya — mengikuti gaya Purchase Invoice per-modul (BUKAN komponen
shared generik), sesuai instruksi eksplisit user "sesuai standar
Purchase Invoice yang pertama kita bangun".

Per modul ditambahkan: `GET list` +`offset`/+`total` (paginasi), `PUT
:batchId/rows/:rowId` (Edit Baris), `DELETE :batchId` (hapus riwayat
lokal + audit log, TIDAK sentuh Accurate), halaman Riwayat (arsip
paginated), dialog Edit Baris + Hapus Riwayat, kolom "Aksi" di halaman
detail batch, card "Import Terakhir" di dashboard homepage. "Batal
Import" TETAP TIDAK ditambahkan ke 4 modul ini (bukan gap — keputusan
bisnis yang sudah didokumentasikan sejak Fase 33-35).

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 258
pass/0 fail (36 baru — 4 modul × ~9 test, naik dari 222). Security
review inline gabungan: 0 temuan (8 endpoint baru semua mekanis, reuse
pola Purchase Invoice yang sudah teraudit Fase 08/09). Detail lengkap
per modul → `docs/phases/phase-36-riwayat-vendor-payable-account.md`
s/d `docs/phases/phase-39-riwayat-journal-voucher.md`.

**Ini menutup audit konsistensi 6 modul 2026-09-06** — kedua temuan
dari audit itu (bug admin batch-view + gap paritas fitur history)
sekarang SELESAI untuk seluruh 6 modul.

## Update 2026-09-06 — Card baru admin dashboard: total baris berhasil diimport (semua user, semua modul)
User minta card ringkasan baru di `/admin` (sebelum card "Pengguna"):
total `import_batch_rows` berstatus `success`, GABUNGAN lintas semua
user & semua 6 modul (query generik, tidak filter `module` — sama
prinsipnya dengan job retensi § architecture-subscription.md § "Retensi
Data Import"). Baris berstatus `cancelled` (Batal Import, Fase 09)
SENGAJA TIDAK dihitung — sudah bukan transaksi aktif di Accurate.

Perubahan: `apps/api/src/routes/admin/stats.route.ts` tambah 1 query
`count()` + field `successfulRowCount` di response; `apps/web/app/admin/(protected)/page.tsx`
tambah `StatCard` baru (icon `FileCheck2`, label "Baris Berhasil
Diimport", angka diformat `toLocaleString("id-ID")`) di URUTAN
PERTAMA (sebelum Pengguna/Paket Aktif/Langganan Aktif), grid disesuaikan
`sm:grid-cols-2 lg:grid-cols-4` supaya 4 card tetap rapi.

Tidak ada test baru ditambahkan — konsisten dengan level cakupan
existing `stats.route.ts` (endpoint read-only sederhana, sudah tidak
ada test sebelumnya juga, sama seperti `audit-logs`/`plans`/
`subscriptions`/`branding` routes). Typecheck 0 error (api+web), lint 0
error, test suite `apps/api` tetap 258 pass/0 fail (tidak berubah).
Diverifikasi manual: query `SELECT count(*) FROM import_batch_rows
WHERE status = 'success'` cocok dengan angka yang dikembalikan endpoint.

## Update 2026-09-06 — Fase 40 Done: Estimasi Efisiensi Waktu Kerja (dashboard customer)
User minta fitur baru: setting admin (estimasi detik input manual per
baris di Accurate, default 30 detik) dikalikan total baris sukses milik
tiap customer (lintas semua modul), ditampilkan sebagai 2 card baru di
dashboard `app.` — salah satunya card highlight (background warna
primary, teks putih) bertuliskan "Anda telah efisiensi waktu kerja
sebanyak: X Jam Y Menit Z Detik".

Ditambahkan: `apps/api/src/lib/manual-input-estimate.ts` (konstanta
setting), validasi server di `settings.route.ts`, card baru di
`/admin/settings`, endpoint baru `GET /me/stats` (hitung total baris
sukses + kalikan setting, 100% di server), util
`formatWorkTimeSaved()` (cascade Jam→Menit→Detik) di `apps/web/lib/utils.ts`,
2 card baru di dashboard customer.

Test yang ditulis untuk endpoint baru (`me.route.test.ts`, sebelumnya
0 test sama sekali di file ini) LANGSUNG menangkap 1 bug nyata: path
route salah tulis (`/stats` alih-alih `/me/stats` — `meRoute` daftarkan
path lengkap per endpoint, bukan relatif seperti route lain yang pakai
`{ prefix }`). Diperbaiki sebelum tutup fase.

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 262
pass/0 fail (4 baru, naik dari 258). Security review inline: 0 temuan.
Setting `data.manualInputSecondsPerRow` yang sempat tertulis nilai test
(45) sudah dibersihkan manual dari DB dev supaya default 30 tetap
akurat di admin nyata. Detail lengkap →
`docs/phases/phase-40-estimasi-efisiensi-waktu-kerja.md`.

## Update 2026-09-06 — Fase 41 Done: Arsip Import Gabungan + Card "Import Terakhir" Unifikasi
User minta 2 perubahan dashboard customer: (1) card "Import Terakhir"
yang tadinya 1 card TERPISAH per modul (bisa 6 card bertumpuk kalau
subscribe semua modul) diganti 1 card GABUNGAN lintas semua modul; (2)
item nav baru "Arsip Import" di paling bawah grup "Import Data"
(sidebar) — halaman arsip penuh (paginated) yang JUGA gabungan lintas
semua modul, dengan notifikasi dismissible di puncak halaman yang
angkanya ("...akan menghapus otomatis arsip import selama N hari")
ditarik LANGSUNG dari setting admin `data.importRetentionDays`.

Ditambahkan: endpoint baru `GET /me/import-batches` (generik, scoped
per-user, LINTAS semua modul, TIDAK dibatasi subscription aktif
sekarang — arsip histori, bukan gerbang fitur), komponen shared BARU
`ImportBatchTable` (dipakai OLEH KEDUANYA — card dashboard & halaman
Arsip Import — dispatch Detail/Cancel/Delete per baris berdasarkan
`batch.module`, Cancel cuma untuk Purchase Invoice/Sales Invoice).
Dashboard: hapus ~370 baris kode 6-blok-per-modul, ganti 1 card + 1
fetch. 6 halaman Riwayat per-modul lama (Fase 09, 36-39) TIDAK dihapus,
cuma tidak lagi jadi titik akses utama.

Extract `ImportBatchTable` jadi shared component (BUKAN duplikasi
"3 baris mirip" seperti pola backend) — sengaja, karena logic dispatch
6-modul ini kalau diduplikasi lagi berisiko ulangi bug yang sama
(admin batch-view lupa di-backfill, § lessons-learned.md 2026-09-06).

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 264
pass/0 fail (2 baru, naik dari 262). Security review inline: 0 temuan.
Detail lengkap → `docs/phases/phase-41-arsip-import-gabungan.md`.

## Update 2026-09-06 — Bug fix: QRIS dinamis gagal simpan (400) walau payload EMV valid
User laporkan simpan QRIS di `/admin/settings` selalu gagal ("Gagal
menyimpan pengaturan", 400 Bad Request). Root cause: payload EMV yang
disalin dari alat scan/decode QR eksternal ke Textarea HAMPIR SELALU
ikut bawa whitespace/newline — validasi backend (`isValidQrisPayload`,
regex `$`-anchored) nol toleransi, menolak payload yang SEBENARNYA
valid, dan frontend tidak menangani kode error spesifik (fallback ke
pesan generik, tidak actionable sama sekali).

Fix: trim `emvPayload` SEBELUM validasi & SEBELUM disimpan (backend +
frontend, mirror check), tambah handling `INVALID_QRIS_ACCOUNTS`/
`INVALID_BANK_ACCOUNTS` spesifik di frontend (sebutkan nama QRIS yang
bermasalah). 2 test regresi baru (`settings.route.test.ts`) — payload
ber-whitespace kini tersimpan TRIM (200), payload BENERAN rusak tetap
ditolak (400 + `qrisId`). Test suite `apps/api` 266 pass/0 fail (naik
dari 264), typecheck+lint 0 error. Detail lengkap →
`docs/lessons-learned.md` 2026-09-06.

## Update 2026-09-06 — Bug fix KEDUA: crash total (bukan cuma 400) simpan QRIS entri statis lama
Segera setelah fix di atas, user laporkan crash BARU: `TypeError:
Cannot read properties of undefined (reading 'trim')` di
`settings/page.tsx`. Sebab: entri QRIS `isDynamic: false` (statis)
TIDAK PERNAH dijamin punya field `emvPayload` sama sekali (bentuk lama:
`{id, name, imageUrl, isDynamic}` saja) — fix pertama asumsikan field
itu SELALU string (biarpun kosong).

Root cause dikonfirmasi PERSIS: `orders.route.test.ts` menulis fixture
QRIS statis (`{id:"qris-static-1", ..., isDynamic:false}`, tanpa
`emvPayload`, domain `example.test` — reserved-for-testing) ke row
settings GLOBAL `company.qrisAccounts` tiap test itu jalan, tanpa
cleanup — pola SAMA yang sudah dicatat 2× hari ini untuk
`data.manualInputSecondsPerRow` (Fase 40/41). Ini MENGONFIRMASI data
yang sempat saya hapus sebelumnya (dikira "test leakage") memang benar
test fixture, BUKAN data asli user — tidak ada kehilangan data nyata.

Fix: normalisasi SETIAP entri `qrisAccounts` SAAT LOAD dari server
(default eksplisit tiap field kalau hilang), bukan cuma saat save —
`form.qrisAccounts` di state React sekarang SELALU cocok 100% dengan
tipe `QrisAccount`. Typecheck+lint 0 error. Detail lengkap →
`docs/lessons-learned.md` 2026-09-06 (entri sama, ditambah § "Bug KEDUA").

## Update 2026-09-06 — Fase 42 Done: QRIS baca payload EMV otomatis dari foto barcode
User tunjuk akar masalah SEBENARNYA di balik 2 bug whitespace/crash
sebelumnya: alur lama MEWAJIBKAN admin scan/decode barcode QRIS SENDIRI
pakai alat eksternal lalu copy-paste manual — padahal foto yang
diupload SUDAH berisi persis payload yang dicari. Sistem sekarang BACA
LANGSUNG dari barcode-nya (library `jsqr` + `sharp` yang sudah ada),
`isDynamic` otomatis aktif kalau berhasil — TIDAK ADA LAGI langkah
manual sama sekali untuk kasus normal (fallback manual tetap ada untuk
foto yang tidak terbaca).

Ditemukan bug tersendiri saat mengerjakan ini: `bun add jsqr` dijalankan
dari `apps/api` (bukan root) bikin `elysia` ter-install 2 SALINAN FISIK
berbeda, bikin Eden Treaty typecheck gagal. Fix: `rm -rf node_modules
&& bun install` dari ROOT — pelajaran: SELALU install dependency baru
dari root di monorepo bun workspace ini, jangan dari subfolder.

Test suite `apps/api` 271 pass/0 fail (5 baru — round-trip QR
SUNGGUHAN via package `qrcode` yang sudah ada, bukan mock), typecheck+lint
0 error. Security review inline: 0 temuan. Detail lengkap →
`docs/phases/phase-42-qris-auto-decode.md`.

## Update 2026-09-06 — Audit: docs/architecture-subscription.md vs kode nyata
User minta cek konsistensi dokumentasi arsitektur "paket" (subscription/
plans) vs kode yang benar-benar berjalan. Dicek langsung: skema
`plans`/`subscriptions` (`db/schema/subscription.schema.ts`),
`subscription-gate.ts` (`getActiveSubscriptionsWithPlans`,
`subscriptionGatePlugin`), `subscriptions.route.ts` (checkout),
`admin/subscriptions.route.ts`, `admin/users.route.ts` (provisioning).

**Kode-nya SENDIRI sudah benar** — 0 bug ditemukan. Yang ketemu murni
DRIFT dokumentasi (5 titik), sudah diperbaiki langsung (tidak perlu
konfirmasi, cuma edit teks doc, 0 risiko):
1. Snippet kode `getActiveSubscriptionsWithPlans` di doc HILANG
   `.orderBy(desc(subscriptions.createdAt))` — fix Low security review
   2026-09-04 (ordering deterministik) yang sudah ada di kode nyata
   tapi tidak pernah disalin balik ke doc.
2. Narasi "Admin-Provisioned" TIDAK menyebutkan guard
   `FORBIDDEN_MARK_AS_PAID` (permission `subscriptions.manage` terpisah
   dari `users.manage` untuk jalur `markAsPaid`) — fix High security
   review 2026-09-04 yang juga tidak pernah masuk doc.
3. Tabel "API (Ringkas)": `POST /subscriptions/checkout` masih tertulis
   `body: { planId } — return payment URL` (model LAMA, pra-Fase 16) —
   padahal kode NYATA sudah `{ planIds: uuid[] }` (cart) dan return
   `{ invoiceId, orderId, amountDue }`, BUKAN payment URL (metode bayar
   dipilih terpisah, § Fase 16/ADR-0022 payment manual). Footnote Fase
   16 sempat ditambah tapi baris utamanya tidak pernah dikoreksi.
4. Enumerasi sub-modul ("Cart Multi-Modul" section) cuma sebut 5 dari 6
   sub-modul — `vendor_payable_account` (ditambah Fase 28/ADR-0026)
   kelewat di kalimat ini walau sudah dicatat terpisah di komentar
   skema atasnya.
5. § Referensi di akhir dokumen tidak mencantumkan ADR-0019/0020/0026
   walau ketiganya dikutip berkali-kali di isi dokumen — ditambahkan.

Tidak ada perubahan kode sama sekali di audit ini — murni perbaikan
dokumentasi supaya sinkron dengan kode yang SUDAH benar.

## Update 2026-09-06 — Audit: docs/architecture-payment.md vs kode nyata
Lanjutan audit doc-vs-code, sekarang untuk payment manual (transfer
bank + QRIS). Dicek: skema `orders` (`\d orders` langsung ke DB),
`orders.route.ts`/`admin/orders.route.ts`/`public/orders.route.ts`
(exact path per endpoint), `lib/invoice-number.ts`
(`generateInvoiceNumber`), `lib/qris-emv.ts` (`buildDynamicQris`),
`lib/order-payment.ts` (`buildQrisResult`), `lib/minio.ts`
(`PAYMENT_PROOF_BUCKET`/`ensurePaymentProofBucket`), row-lock transaction
di `POST /admin/orders/:id/confirm`, halaman publik `landing/pay/[orderId]`.

**Hasil jauh lebih bersih dari audit subscription sebelumnya** — hampir
SEMUA klaim cocok PERSIS dengan kode (skema kolom-per-kolom, 4 endpoint
publik + guard + rate limit `/public` 20req/60s, formula
`amountDue = invoice.total + order.uniqueCode`, presigned URL 10 menit,
pola row-lock `SELECT...FOR UPDATE` pada orders MAUPUN invoices dengan
recheck status setelah lock, tidak ada env var gateway). Cuma 3 gap
KECIL (kelengkapan, bukan kesalahan), sudah diperbaiki:
1. Pseudocode `buildDynamicQris()` di doc tidak sebutkan guard keras
   "throw kalau tidak ada Tag 53/54" (fix Medium security review
   2026-09-04) — ditambahkan.
2. Doc tidak sebutkan `lib/order-payment.ts` `buildQrisResult()`
   sebagai helper BERSAMA yang dipakai KEDUA jalur qris (login +
   publik) — ditambahkan referensinya.
3. Paragraf auto-decode payload EMV (yang justru BARU jadi kenyataan
   hari ini lewat Fase 42) diperbarui: sebut Fase 42 secara eksplisit +
   nama library (`sharp`+`jsQR`), dan reword paragraf fallback statis
   supaya jelas ini kondisi "auto-decode gagal DAN admin tidak isi
   manual", bukan lagi satu-satunya jalur seperti kesan sebelumnya.

Tidak ada perubahan kode — arsitektur payment yang berjalan sudah
sesuai dokumentasinya (setelah 3 penyesuaian kecil di atas).

## Update 2026-09-06 — Fase 45 Done: Sistem Notifikasi (In-App) + Pengumuman Admin
Lonceng notifikasi di Topbar (dulu sengaja `disabled` sejak ADR-0024)
sekarang jadi sistem sungguhan — 12 tipe notifikasi mencakup SELURUH
alur subscribe (checkout → bukti transfer → verifikasi/tolak) dan trial
(mulai → reminder H-3/H-1 → expired), plus 2 operational alert yang
ketemu lewat screening (reminder subscription asli H-7/H-3/H-1, dan
koneksi Accurate terputus — sebelumnya customer TIDAK PERNAH tahu
koneksinya putus sampai coba import gagal). Sekalian dibangun fitur
broadcast/pengumuman admin (3 mode target: semua customer/modul
tertentu/user tertentu), skema fan-out 1 row per penerima (ADR-0029,
BUKAN shared+read-receipt join — rasional: kesederhanaan query, skala
project ini belum butuh efisiensi storage itu).

**Item PENDING (eksplisit diminta user, JANGAN dilupakan)**: **Email
notifikasi untuk event yang SAMA (checkout, trial, pembayaran, dst)
BELUM dibangun** — user secara eksplisit minta in-app dibangun DULU,
tapi email untuk event yang sama WAJIB menyusul di fase terpisah,
bukan dilupakan. Semua trigger point sudah disiapkan (12 titik di
`lib/notifications.ts`/`lib/order-payment.ts`/`workers/index.ts`) supaya
gampang disambung ke `sendEmail()` (`lib/email.ts`, sudah ada) nanti,
tapi belum ada satu pun panggilan email baru ditambahkan fase ini.

Typecheck 0 error (api+web), test suite `apps/api` 317 pass/0 fail (18
baru), lint 0 error. Security review inline: 0 temuan Critical/High, 2
temuan Low (broadcast fan-out belum idempotent, targetUserIds tidak
divalidasi sebelum enqueue — keduanya diterima, § phase doc Known
Limitations). Detail lengkap → `docs/phases/phase-45-sistem-notifikasi.md`,
`docs/decisions/adr-0029-notifikasi-fanout-per-penerima.md`.

## Update 2026-09-06 — Fase 46 Done: Customer Care (Profil CS + WhatsApp Rotator + Analitik)
Fitur baru: profil CS (foto, nama, posisi, WhatsApp) dikelola admin
(`/admin/customer-care` — CRUD, upload foto, jam kerja popup, toggle
"Off Hari Ini" per-agent, analitik "dilayani hari ini"), ditampilkan ke
customer lewat floating widget di SEMUA halaman app (bukan cuma
dashboard, dikonfirmasi user). Rotasi WhatsApp otomatis (pilih agent
online dengan klik paling sedikit hari ini) dan status online DIHITUNG
(bukan disimpan) dari jam kerja global + toggle manual — SEMUANYA
timezone-aware, reuse infrastruktur Fase 44/ADR-0028 ("off hari ini"
auto-reset besok tanpa job/cron, tinggal `manuallyOfflineUntil > now()`).

Nomor WhatsApp TIDAK di-expose sampai titik klik, dan klik itu sendiri
divalidasi ulang server-side (cegah bypass rotasi lewat manipulasi
client). Analitik hitung customer UNIK (`COUNT DISTINCT`), bukan raw
click count — 1 customer klik 2x hari yang sama tetap dihitung 1 orang.

Typecheck 0 error (api+web), test suite `apps/api` 352 pass/0 fail (35
baru), lint 0 error. Security review inline: 0 temuan Critical/High, 1
temuan Low (klik tidak rate-limited/de-duplicated — sedikit
mempengaruhi keadilan rotasi kalau customer klik berkali-kali, TIDAK
mempengaruhi analitik "customer unik" — diterima). Detail lengkap →
`docs/phases/phase-46-customer-care.md`,
`docs/architecture/architecture-customer-care.md`.

## Update 2026-09-06 — Fase 44 Done: Audit & Perbaikan Timezone Menyeluruh
User minta audit ("berlangganan tidak benar terhitung-nya hanya karena
timezone, kalau salah ini, fatal"). Ditemukan setting `company.timezone`
(ada sejak Fase 00/01) **TIDAK PERNAH benar-benar dipakai** di kode
manapun — `formatDate()` hardcode `"Asia/Jakarta"` literal, murni
decorative — plus **2 bug FATAL**:

1. `endAt` subscription admin-manual salah ~7 jam — `admin/users/page.tsx`
   kirim `new Date(dateInputValue).toISOString()` dari `<input
   type="date">`, JS mem-parse tanggal-saja sebagai UTC MIDNIGHT bukan
   akhir hari Asia/Jakarta. Masa aktif TERAKHIR subscription terpotong
   ~17 jam tanpa admin sadar.
2. `todayAccurateDate()` (`accurate-vendor.ts`) baca timezone PROSES
   SERVER (bukan timezone perusahaan) — di production (container tanpa
   `TZ` eksplisit, default UTC), jendela 00:00–06:59 WIB bikin
   `transDate` auto-create vendor/customer tercatat SALAH 1 HARI di
   pembukuan Accurate customer, SETIAP HARI tanpa terkecuali.

Fix: `apps/api/src/lib/company-timezone.ts` (baru, `getCompanyTimezone()`),
`apps/web/lib/timezone.ts` (baru, `endOfDayInTimezone`/`middayInTimezone`,
native `Intl.DateTimeFormat`, TANPA dependency baru), `CompanyTimezoneProvider`
(Context, root layout) + wire ulang 16 titik `formatDate()`. Kode lain
yang SUDAH BENAR (kalkulasi `endAt` self-service, job
`EXPIRE_SUBSCRIPTIONS`, parser tanggal Excel `toAccurateDate()`)
diverifikasi TIDAK diubah — bukti pola yang benar sudah ada di codebase,
cuma tidak diterapkan konsisten di 2 titik itu.

Typecheck 0 error (api+web). Test suite: `apps/api` 288 pass/0 fail (3
baru, membuktikan `todayAccurateDate` genuinely baca setting timezone),
`apps/web` 15 pass/0 fail (4 baru, termasuk verifikasi round-trip
akhir-hari yang menangkap bug rounding milidetik `Intl.DateTimeFormat`
sebelum sempat shipped). Lint 0 error. Security review inline: 0 temuan.
Detail lengkap → `docs/decisions/adr-0028-timezone-aware-date-handling.md`,
`docs/phases/phase-44-audit-timezone.md`,
`docs/lessons-learned.md` entri 2026-09-06 "Audit timezone menyeluruh".

## Update 2026-09-06 — Fase 47 Done: Landing Page Redesign (Nyontek Desain Referensi)
Landing page (`apps/web/app/landing/`) dibangun ulang total menyontek
desain referensi user (screenshot): hero (headline + ilustrasi hosted
`facinstitute.id`), banner CTA hijau, funfact bar (3 angka SUNGGUHAN
dari `GET /public/stats` — endpoint publik baru, rate-limited, agregat
saja/tanpa PII), grid fitur (1 kartu = 1 sub-modul Facport, dinamis
dari `GET /plans` yang sudah publik, logic cart-select-redirect
disalin dari `catalog-cart.tsx` lama), section harga/CTA penutup (copy
generik, bukan duplikasi 1 harga spesifik yang menyesatkan — Facport
jual per-sub-modul, bukan 1 harga tunggal). Token warna baru
`--color-landing-*` (hijau) dipisah dari `--color-primary-*` (biru,
admin/app) — identitas marketing site sengaja dibedakan dari identitas
produk. `catalog-cart.tsx` lama dihapus, digantikan `module-features.tsx`.

Instruksi eksplisit user: section STATIS (hero, banner, penutup) tetap
hardcode JSX, cuma Fitur & Funfact yang dinamis. Verifikasi visual di
browser tidak bisa dilakukan lewat Claude in Chrome sesi itu (mismatch
akun OAuth) — dikonfirmasi manual oleh user sendiri belakangan.

Full test suite `apps/api`: 355 pass/0 fail (3 baru,
`public/stats.route.test.ts`). Typecheck & lint web 0 error. Security
review inline: endpoint publik baru cuma balikin agregat, aman
diekspos tanpa auth, konsisten `GET /settings/public`. Detail lengkap →
`docs/phases/phase-47-landing-page-redesign.md`.

## Update 2026-09-06 — Fase 48 Done: Auto-Login Setelah Verifikasi Email + Bawa Pilihan Paket
Lanjutan Fase 47 — user pilih sub-modul di landing, daftar baru, klik
link verifikasi email harus LANGSUNG login dan mendarat di
`/subscribe` dengan paket sudah ke-preselect (bukan diminta login
manual lagi dengan pilihan paket hilang di tengah jalan). Fix:
`autoSignInAfterVerification: true` (Better Auth), `register-form.tsx`
kirim `callbackURL` absolute (`window.location.origin` + path
tervalidasi `getSafeRedirect()`, di-extract ke `lib/safe-redirect.ts`
bersama) ke `signUp.email()`. Link "Daftar"/"Login" di 2 halaman saling
meneruskan `?redirect=` supaya tidak hilang di tengah alur.

**Bug ditemukan & diperbaiki DI FASE INI JUGA (sebelum fitur ini):**
self-register TIDAK PERNAH dapat role "customer" sama sekali (beda
dari alur admin-provisioned) — akibatnya user baru tidak muncul di
admin > Pengguna DAN login "gagal diam-diam" (redirect balik ke
`/login` tanpa pesan error). Fix: intercept `POST /api/auth/sign-up/email`
di `app.ts` (assign role SETELAH signup HTTP asli, TIDAK dobel-jalan
untuk akun admin/staff-provisioned yang pakai jalur `auth.api.signUpEmail()`
server-side langsung). Detail lengkap →
`docs/lessons-learned.md` entri 2026-09-06 "Self-register TIDAK PERNAH
dapat role customer".

Known limitation: auto-login TIDAK bisa diverifikasi end-to-end penuh
di dev lokal (`.localhost`, `crossSubDomainCookies` nonaktif khusus
situ) — WAJIB diverifikasi manual di production/staging. User
konfirmasi belakangan production login sudah OK.

Test suite `apps/api`: 357 pass/0 fail (2 baru). Typecheck & lint web 0
error. Security review inline: 0 temuan (callbackURL selalu dibangun
dari origin terpercaya + `getSafeRedirect()`, bukan string bebas dari
user). Detail lengkap → `docs/phases/phase-48-auto-login-verifikasi-email.md`.

## Update 2026-09-06 — Audit Excel Kompetitor: 2 Gap Serius Ditemukan di 5 Modul Import
User minta cek apakah modul import Facport sudah "follow up" file Excel
contoh kompetitor (`docs/referencehtml/`, 6 file: Sales Invoice,
Purchase Invoice, Purchase Payment, Sales Receipt, Buku Besar/Journal
Voucher). Dibandingkan ISI DATA ASLI-nya (bukan cuma nama kolom) dengan
mapping import Facport — ditemukan:

- **Purchase Invoice**: ✅ AMAN — grouping "Bill No" 100% terisi di
  data asli, grouping jalan benar.
- **Sales Invoice**: 🔴 KRITIS — grouping pakai "PO Number" yang **100%
  KOSONG** di data asli (833 baris), padahal **52% faktur (77/149)
  multi-item** (sampai 58 baris/faktur) — faktur bisa pecah diam-diam
  jadi puluhan faktur terpisah di Accurate.
- **Sales Receipt**: 🔴 KRITIS — cuma dukung 1 baris = 1 penerimaan,
  padahal **SEMUA 137 struk (100%)** di data asli multi-faktur.
- **Purchase Payment**: 🟠 TINGGI — 110/258 (43%) pembayaran asli bayar
  >1 faktur sekaligus (sampai 30 faktur/pembayaran).
- **Journal Voucher**: 🟠 TINGGI — format lebar cuma bisa 2 akun/jurnal,
  mayoritas transaksi asli (1 sheet sampel, 84%) butuh 3-6 akun.

Root cause bersama: verifikasi awal SUDAH ketat ke OpenAPI spec resmi
Accurate (field VALID), tapi TIDAK pernah dicek terhadap data nyata
(kolom mana yang REALISTIS TERISI di praktik). Temuan ini jadi trigger
Fase 49 & 50 di bawah. Detail lengkap → `docs/lessons-learned.md` entri
2026-09-06 "Asumsi kunci grouping Excel ('PO Number') ternyata SELALU
KOSONG di data asli".

## Update 2026-09-06 — Fase 49 Done: Perbaiki Grouping Multi-Baris (Sales Receipt & Sales Invoice)
Sales Invoice: kunci grouping multi-item digeneralisasi — kolom yang
di-mapping ke "Trans No" (`number`) sekarang DIUTAMAKAN (match pola
data asli kompetitor), fallback ke "PO Number" (perilaku lama, zero
regression). Sales Receipt: dapat kapasitas grouping BARU dari nol —
field opsional `receiptNumber` (→ Accurate `number`) jadi kunci
penggabungan banyak baris jadi 1 `sales-receipt/save.do` dengan
`detailInvoice[]` N faktur, `chequeAmount` total = SUM. Diproses
per-grup (`processSalesReceiptGroup`), SEDERHANA tanpa retry-cerdas-
lintas-batch (konsisten keputusan lama: "Batal Import" sengaja tidak
didukung modul ini).

Full test suite `apps/api`: 372 pass/0 fail (15 baru). Typecheck 0
error, security review inline 0 temuan. Detail lengkap →
`docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md`.

## Update 2026-09-06 — Fase 50 Done: Grouping Multi-Baris (Purchase Payment & Journal Voucher)
Purchase Payment: dapat grouping baru (mirror PERSIS Sales Receipt
Fase 49) — field `paymentNumber`, label kolom diganti ikut istilah
kompetitor ("Purchase Payment No", "Payment" BUKAN "Cheque Amount" yang
sering kosong di data asli). Journal Voucher: dapat Opsi B (format
"panjang" ala kompetitor, grouping by "Transaction Number", N-akun per
jurnal) **BERDAMPINGAN** dengan Opsi A (format lebar lama, 2-akun) —
dikonfirmasi eksplisit user untuk TIDAK mengganti total (modul sudah
live sejak Fase 35, risiko rusak retry batch customer lain yang mungkin
sudah pakai format lebar). `formatOf()` deteksi format otomatis dari
kolom yang di-mapping. Validasi double-entry digeneralisasi: SUM semua
baris DEBIT = SUM semua baris CREDIT per grup (bukan lagi cuma 2 angka).

Full test suite `apps/api`: 399 pass/0 fail (27 baru). Typecheck 0
error, security review inline 0 temuan. Detail lengkap →
`docs/phases/phase-50-grouping-purchase-payment-dan-journal-voucher.md`.

## Update 2026-09-06 — Fase 51 Done: Grid Edit ala Excel untuk Baris Gagal Import
Opsi KEDUA untuk perbaiki baris gagal import (dialog per-baris dari
2026-08-28 TETAP ADA, tidak digantikan): grid/tabel editable ala Excel
di-render langsung di halaman web (`components/import/editable-grid.tsx`,
1 komponen generic dipakai 6 halaman hasil import — BEDA dari
`edit-row-dialog.tsx` yang 6 file terpisah per-modul, karena kompleksitas
grid tidak masuk akal diduplikasi 6x). Backend dapat endpoint bulk baru
`PUT /{module}/import/:batchId/rows` di 6 modul — baris valid tersimpan,
baris bermasalah dicatat di `errors[]` tanpa menggagalkan baris lain
dalam request yang sama. Grid responsif (scroll horizontal, DITEKANKAN
eksplisit oleh user, reuse pola `overflow-x-auto` yang sudah standar).
TIDAK auto-trigger retry — user tetap klik "Retry baris gagal" terpisah,
konsisten UX dengan edit per-baris.

Known limitation: dialog per-baris Journal Voucher belum di-update
untuk format panjang (Fase 50) — gap pre-existing, grid barunya sudah
benar untuk kedua format jadi tetap ada jalur yang benar. Purchase
Invoice & Sales Invoice tidak punya test rute edit-row sama sekali
(gap pre-existing sejak awal, di luar scope).

Full test suite `apps/api`: 412 pass/0 fail (13 baru). Typecheck & lint
0 error. Security review inline: 1 temuan Low (diterima — `body.rows`
tanpa limit eksplisit, endpoint tetap di balik auth+subscription-gate).
Detail lengkap → `docs/phases/phase-51-grid-edit-baris-gagal.md`.

## Update 2026-09-07 — Fase 52 Done: Perbaikan Deploy Production Pertama (facinstitute.id)
Deploy production PERTAMA KALI Facport ke domain asli (5 subdomain
`facinstitute.id`, server `wasugi@76.13.18.136`, instance baru `/opt/facport`
terpisah dari demo lama `ane.web.id`) mengungkap 3 bug infrastruktur nyata
yang baru "teruji" sekarang — semuanya cuma muncul saat jalur tertentu
BENAR-BENAR dieksekusi untuk pertama kali:
1. MinIO tidak pernah ada di `ci.yml`/`release.yml`/`deploy-staging.yml`
   (env var doang tanpa server) — baru ketahuan karena test upload bukti
   transfer baru di-unskip beberapa hari sebelumnya.
2. `pdfkit` gagal resolve subpath import Node (`#standard-fonts/*`) di
   production build — baru ketahuan karena fitur invoice PDF (Fase 15)
   baru pertama kali di-build jadi image Docker di v1.13.0.
3. Image production tidak bisa `db:migrate`/`db:seed` (Dockerfile tidak
   copy `drizzle.config.ts`/`drizzle/`/`src/`) — baru ketahuan karena baru
   kali ini ada yang migrate DB KOSONG dari dalam image production.

Rilis `v1.13.0` → `v1.13.1` → `v1.13.2` (2 hotfix beruntun, masing-masing
lewat alur PR develop→main penuh, CI hijau sebelum merge). Prosedur
bootstrap admin pertama untuk instance baru didokumentasikan (belum
pernah ada sebelumnya — panel admin tidak punya self-register by design).
Auto-login-setelah-verifikasi (Fase 48) diinvestigasi ulang lewat
reproduksi `curl -v` langsung — dikonfirmasi BEKERJA NORMAL di production
(bukan bug, kejadian awal kemungkinan token verifikasi expired).

Server production online & terverifikasi manual: 5 subdomain HTTPS aktif
(SSL certbot), login Super Admin sukses, 5 paket sub-modul tampil di
landing page. Upload logo (media/MinIO) BELUM dikonfirmasi terverifikasi
manual — lihat Known Limitations. Detail lengkap →
`docs/phases/phase-52-perbaikan-deploy-production-pertama.md`.

## Update 2026-09-07 — Fase 53 Done: Multi-Tier Billing per Sub-Modul
1 sub-modul (mis. "Purchase Invoice") sekarang bisa punya beberapa tier
durasi/harga (mis. Bulanan/Tahunan), tampil sebagai SATU kartu di
landing dan `/subscribe` dengan pill pemilih tier — bukan 2 kartu modul
terpisah yang membingungkan (diminta user eksplisit). Riset Plan Mode
menemukan **backend tidak perlu diubah skemanya sama sekali** — checkout
sudah plan-id-based dan guard modul sudah module-key-based sejak Fase
16, jadi 2+ baris `plans` dengan `modules` sama otomatis bekerja benar
(endAt per tier, guard modul-sudah-aktif, trial per modul). Grouping
murni frontend (`apps/web/lib/use-grouped-plans.ts`, hook shared
landing+subscribe). Tambahan 1 guard backend `DUPLICATE_MODULE_IN_CART`
(defense-in-depth). Admin dapat helper text penamaan tier + sort tabel
by modul (kosmetik).

Test baru: 6 unit test hook + 1 test route. Full suite `apps/api` 413
pass/0 fail, `apps/web` 21 pass/0 fail. Typecheck+lint 0 error. Build
production sukses. Security review inline: 0 temuan. Detail lengkap →
`docs/phases/phase-53-multi-tier-billing-per-modul.md`.

## Update 2026-09-07 — Fase 54 Done: Perbaikan Logika Upgrade Trial → Paket Asli
User memberi catatan eksplisit: trial itu OPSIONAL, tidak boleh
memblokir upgrade ke paket asli kapan saja selama trial masih berjalan.
2 bug ditemukan: (1) **regresi UI** dari redesain Fase 53 — tombol
"Berlangganan" ikut disembunyikan total selama modul sedang trial
aktif (seharusnya tetap tampil), (2) **bug data laten sejak Fase 43** —
saat admin confirm pembayaran paket asli untuk modul yang usernya
sedang trial, subscription trial lama tidak pernah ditutup, user jadi
punya 2 subscription "active" bersamaan untuk modul yang sama (status
yang ditampilkan jadi order-dependent/tidak konsisten).

Fix: hapus gate `!isTrialActive` di section "Pilih Paket" (`/subscribe`),
dan subscription trial lama otomatis di-set `status: "cancelled"`
begitu paket asli confirm — diterapkan di 2 titik (`admin/orders.route.ts`
confirm, `admin/subscriptions.route.ts` assign manual). Test baru: 1
test route verifikasi trial lama ter-cancel + subscription baru aktif
non-trial. Full suite `apps/api` 414 pass/0 fail, `apps/web` 21 pass/0
fail. Detail lengkap → `docs/phases/phase-54-perbaikan-logika-upgrade-trial.md`.

## Update 2026-09-08 — Fase 55 Direncanakan: Atribut Tambahan (Data Classification) di Import Sales Invoice
Client minta 10 kolom teks bebas tambahan ("Karakter 1"-"Karakter 10",
istilah Accurate: "Atribut Tambahan") bisa diisi lewat import Excel
Sales Invoice — file asli client dijanjikan sore hari ini, jadi
**eksekusi kode SENGAJA ditunda**, cuma disiapkan dokumen arsitektur
lengkap dulu. Temuan kunci: field resmi Accurate
`detailItem[].dataClassification1Name` s/d `...10Name` (diverifikasi
ke `docs/referencehtml/accurate-openapi.json`, per baris item, tipe
string) — arsitektur mapping import SUDAH generik penuh, jadi TIDAK
perlu migration DB/endpoint baru/perubahan frontend, cukup tambah
entri di `sales-invoice.mapping.ts`. Posisi/nama kolom Excel
(`defaultColumnMap`) cuma default/auto-suggest — user tetap bisa
remap manual per-import (mekanisme sudah ada), jadi aman disesuaikan
lagi begitu file client asli diterima tanpa risiko "kolom salah
posisi". Detail lengkap → `docs/architecture/architecture-sales-invoice.md`
§ "Atribut Tambahan", `docs/phases/phase-55-atribut-tambahan-sales-invoice.md`.

## Update 2026-09-08 — Fase 55 Done: Eksekusi Atribut Tambahan Sales Invoice
Setelah dokumentasi arsitektur selesai, user memutuskan LANGSUNG
eksekusi kode (bukan tunggu file client asli sore ini) — karena field
API-nya (`dataClassification1Name`..`10Name`) fixed terlepas dari nama
kolom Excel apa pun, dan penyesuaian nama kolom nanti tidak butuh
deploy ulang (remap manual di UI import, mekanisme sudah ada). Tambah
10 field opsional (`attribut1`..`attribut10`) di
`sales-invoice.mapping.ts` + `template-guide.ts`, nama kolom default
"Karakter 1"-"Karakter 10" (istilah asli Accurate). Tidak ada
migration/endpoint/frontend baru — murni penambahan mapping mengikuti
arsitektur generik yang sudah ada.

Test baru: 1 unit test. Full suite `apps/api` 415 pass/0 fail.
Typecheck 0 error. Detail lengkap →
`docs/phases/phase-55-atribut-tambahan-sales-invoice.md`.

## Update 2026-09-08 — Fase 56 Done: Fix Error Message Batch Gagal Dini (Semua Modul)
User temukan batch production nyata
(`379b65d8-90e4-4f29-8abb-70af74ddff74`) — status batch "failed", tapi
baris-barisnya masih "pending" tanpa error message sama sekali, admin
tidak tahu penyebabnya. Root cause: job `IMPORT_TO_ACCURATE` punya 2
titik "gagal dini" SEBELUM loop per-baris (koneksi Accurate belum ada,
atau gagal buka sesi Data Usaha) yang cuma update status batch, tidak
pernah sentuh baris-barisnya — bug SISTEMIK karena kode ini shared
sebelum percabangan per modul, berpotensi kena SEMUA 6 modul import.

Fix: helper `failAllPendingRows()` dipanggil di kedua titik gagal-dini,
ditaruh SEBELUM percabangan per modul supaya otomatis berlaku ke ke-6
modul sekaligus (bukan cuma modul tempat bug ditemukan). Security
review inline: `err.message` yang disurfacekan diverifikasi tidak
pernah berisi token/secret. Diketahui: `workers/index.ts` tidak punya
test file sama sekali (gap pre-existing, dicatat di Known Limitations,
di luar scope fix ini).

Full suite `apps/api` 415 pass/0 fail (tidak ada test baru — worker
sulit di-unit-test tanpa refactor tambahan). Typecheck 0 error. Detail
lengkap → `docs/phases/phase-56-fix-error-message-batch-gagal-dini.md`.
