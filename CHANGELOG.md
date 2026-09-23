## 2.11.0 (2026-09-23)

* Merge pull request #72 from webaneid/develop ([7ad2a17](https://github.com/webaneid/facport/commit/7ad2a17)), closes [#72](https://github.com/webaneid/facport/issues/72)
* fix: evaluasi client sebelum rilis — 3 temuan (kategori, pesan upload, Fiscal Rate) ([0089516](https://github.com/webaneid/facport/commit/0089516))
* fix(admin): "Jenis Paket" jadi gerbang Produk (bukan sub-heading di section Fitur) ([417be05](https://github.com/webaneid/facport/commit/417be05))
* fix(admin): kelompokkan "Tambah Paket" per Produk, bukan cuma Kategori ([7bd4b47](https://github.com/webaneid/facport/commit/7bd4b47))
* fix(konverter): isi Branch Code setelah upload tidak pernah memicu ringkasan ([dc27a46](https://github.com/webaneid/facport/commit/dc27a46))
* fix(konverter): perbaiki crash runtime "Functions cannot be passed to Client Components" di SEMUA 16 ([008be63](https://github.com/webaneid/facport/commit/008be63))
* fix(subscribe): judul+deskripsi section Konverter di /subscribe ([e055490](https://github.com/webaneid/facport/commit/e055490))
* feat(konverter): Fase 150 — fondasi Produk Konverter (katalog, conversion_logs, sidebar multi-Produk ([497658e](https://github.com/webaneid/facport/commit/497658e))
* feat(konverter): Fase 151 — port tipe transaksi pertama (Requisition) ([e8766e6](https://github.com/webaneid/facport/commit/e8766e6))
* feat(konverter): Fase 152 — port Item Transfer & Journal Voucher ([03638d2](https://github.com/webaneid/facport/commit/03638d2))
* feat(konverter): Fase 153 — port Cash & Bank (4 tipe, kategori selesai) ([dcabe0a](https://github.com/webaneid/facport/commit/dcabe0a))
* feat(konverter): Fase 154 — port Purchase (4 tipe, kategori selesai) ([cc4afa4](https://github.com/webaneid/facport/commit/cc4afa4))
* feat(konverter): Fase 155 — port Sales (4 tipe, 15/16 Varian selesai) ([450388a](https://github.com/webaneid/facport/commit/450388a))
* feat(konverter): Fase 156 — port Standard Cost, SELURUH 16 Varian selesai ([9a1b264](https://github.com/webaneid/facport/commit/9a1b264))
* docs(konverter): arsitektur Produk Konverter (Fase 150) - fondasi, belum ada kode ([4339fe1](https://github.com/webaneid/facport/commit/4339fe1))
* docs(konverter): revisi trial - kuota baris DITEGAKKAN server, bukan cuma durasi ([3997312](https://github.com/webaneid/facport/commit/3997312))

## 2.10.0 (2026-09-22)

* Merge pull request #71 from webaneid/develop ([0905d7d](https://github.com/webaneid/facport/commit/0905d7d)), closes [#71](https://github.com/webaneid/facport/issues/71)
* fix(invoice): tambahkan kolom Fiscal Rate (Kurs Pajak) di Sales Invoice & Purchase Invoice ([a2bf805](https://github.com/webaneid/facport/commit/a2bf805))
* fix(ui): rapikan tabel Invoice admin - kolom Nomor/Total tidak lagi menimpa kolom sebelah ([776e29b](https://github.com/webaneid/facport/commit/776e29b))
* refactor(ui): pindahkan menu Tagihan dari Sidebar ke dropdown avatar Topbar ([a2529a5](https://github.com/webaneid/facport/commit/a2529a5))
* feat(ui): tampilkan nama Data Usaha aktif di Topbar dashboard pelanggan ([1bdac5f](https://github.com/webaneid/facport/commit/1bdac5f))

## 2.9.0 (2026-09-22)

* Merge pull request #70 from webaneid/develop ([f04f004](https://github.com/webaneid/facport/commit/f04f004)), closes [#70](https://github.com/webaneid/facport/issues/70)
* fix(manufacture): template unduhan multi-baris + perbaikan nama kolom Qty ([71c4787](https://github.com/webaneid/facport/commit/71c4787))
* feat(manufacture): modul import Material Slip (Fase 148) dan Finished Good Slip (Fase 149) ([1985582](https://github.com/webaneid/facport/commit/1985582))
* docs(manufacture): arsitektur Material Slip (Fase 148) dan Finished Good Slip (Fase 149) ([a9154b4](https://github.com/webaneid/facport/commit/a9154b4))
* docs(manufacture): verifikasi data riil client — portion=persen, temuan grouping multi-baris ([27f57b6](https://github.com/webaneid/facport/commit/27f57b6))
* docs(material-slip): konfirmasi contoh data riil — enum literal, grouping multi-item ([856922d](https://github.com/webaneid/facport/commit/856922d))
* docs(material-slip): koreksi Dept Name — field departmentName ADA di API ([92e574e](https://github.com/webaneid/facport/commit/92e574e))

## 2.8.0 (2026-09-22)

* Merge pull request #69 from webaneid/develop ([e0af4e3](https://github.com/webaneid/facport/commit/e0af4e3)), closes [#69](https://github.com/webaneid/facport/issues/69)
* docs: catat rilis v2.7.0 (cutover koneksi Accurate) dan status Fase 145 ([a0661f9](https://github.com/webaneid/facport/commit/a0661f9))
* docs: perbarui sisa rujukan alur OAuth lama di dokumen integrasi Accurate ([5cd2e8c](https://github.com/webaneid/facport/commit/5cd2e8c))
* docs: sinkronkan scope modul dengan kode (registri Fase 142) dan status 5 sub-modul Fase 136 ([a89c20e](https://github.com/webaneid/facport/commit/a89c20e))
* docs: sinkronkan status Fase 141-145 dan rujukan yang basi setelah rilis v2.7.0 ([5500a34](https://github.com/webaneid/facport/commit/5500a34))
* docs(sop): pengingat registrasi endpoint Accurate di langkah eksekusi ([f6badfb](https://github.com/webaneid/facport/commit/f6badfb))
* chore(scope): buang scope glaccount_view yang tidak pernah dipakai kode ([7c11dd1](https://github.com/webaneid/facport/commit/7c11dd1))
* feat(roll-over): modul import Roll Over (Fase 146) ([cdbbed1](https://github.com/webaneid/facport/commit/cdbbed1))
* feat(work-order): modul import Work Order + perbaikan header duplikat Excel (Fase 147) ([d217e24](https://github.com/webaneid/facport/commit/d217e24))

## 2.7.0 (2026-09-21)

* Merge pull request #68 from webaneid/develop ([887c0b1](https://github.com/webaneid/facport/commit/887c0b1)), closes [#68](https://github.com/webaneid/facport/issues/68)
* fix(admin): putuskan koneksi Accurate per Data Usaha, bukan per subscription (Fase 144) ([fb9e808](https://github.com/webaneid/facport/commit/fb9e808))
* fix(test): ganti nilai token nyata di tes galat token dengan penanda palsu ([ae02130](https://github.com/webaneid/facport/commit/ae02130))
* feat(accurate): koneksi 1-per-akun dipegang Data Usaha + gerbang koneksi popup (Fase 143-144) ([32c68e4](https://github.com/webaneid/facport/commit/32c68e4))
* feat(accurate): mesin scope — registri endpoint, granted_scopes, otorisasi semua scope (Fase 142) ([0be3bc6](https://github.com/webaneid/facport/commit/0be3bc6)), closes [#2](https://github.com/webaneid/facport/issues/2)
* feat(accurate): putus total ke koneksi lama saat cutover (migrasi 0030, Fase 145) ([d94e7be](https://github.com/webaneid/facport/commit/d94e7be))
* docs(accurate): bukti otorisasi OAuth & ADR-0036 koneksi per akun (Fase 141) ([0f0a552](https://github.com/webaneid/facport/commit/0f0a552))
* docs(accurate): catat verifikasi end-to-end UI gerbang koneksi (Fase 144) ([384b3c3](https://github.com/webaneid/facport/commit/384b3c3))
* docs(accurate): hasil pemeriksaan production P1-P3, tutup Fase 141 ([604de32](https://github.com/webaneid/facport/commit/604de32))
* docs(accurate): rencana Fase 145 — cutover koneksi Accurate ke production ([719294d](https://github.com/webaneid/facport/commit/719294d))

## <small>2.6.1 (2026-09-21)</small>

* feat(sales,inventory,manufacture): modul Sales Order, Inventory Adjustment & Job Costing (Fase 137-1 ([d1384dc](https://github.com/webaneid/facport/commit/d1384dc))
* Merge pull request #67 from webaneid/release/fase-137-140 ([bf8c9fd](https://github.com/webaneid/facport/commit/bf8c9fd)), closes [#67](https://github.com/webaneid/facport/issues/67)
* fix(gate): gerbang modul pilih subscription sesuai Data Usaha aktif (Fase 140) ([b4ac893](https://github.com/webaneid/facport/commit/b4ac893))
* chore: gitignore file .env.deploy hasil generate runbook deploy manual ([71e1c2b](https://github.com/webaneid/facport/commit/71e1c2b))
* docs: catat rilis v2.6.0 & deploy manual ke production ([0399cf1](https://github.com/webaneid/facport/commit/0399cf1))

## 2.6.0 (2026-09-17)

* Merge pull request #65 from webaneid/develop ([29ad6e7](https://github.com/webaneid/facport/commit/29ad6e7)), closes [#65](https://github.com/webaneid/facport/issues/65)
* feat(inventory): modul Item Transfer & Item Requisition (Fase 134-135) ([a5276fe](https://github.com/webaneid/facport/commit/a5276fe))
* docs: catat rilis v2.5.1 & deploy manual ke production ([381bccb](https://github.com/webaneid/facport/commit/381bccb))

## <small>2.5.1 (2026-09-16)</small>

* Merge pull request #64 from webaneid/develop ([5b257f8](https://github.com/webaneid/facport/commit/5b257f8)), closes [#64](https://github.com/webaneid/facport/issues/64)
* fix(ui): lebar kolom tabel tidak terkontrol di seluruh app (Fase 133) ([40a431a](https://github.com/webaneid/facport/commit/40a431a))
* docs: catat rilis v2.5.0 & deploy manual ke production ([4985627](https://github.com/webaneid/facport/commit/4985627))

## 2.5.0 (2026-09-16)

* Merge pull request #63 from webaneid/develop ([14bfdf9](https://github.com/webaneid/facport/commit/14bfdf9)), closes [#63](https://github.com/webaneid/facport/issues/63)
* feat(invoice): tampilkan durasi paket + tanggal berlaku aktual (Fase 131) ([020815f](https://github.com/webaneid/facport/commit/020815f))
* feat(notifications): notifikasi expiry spesifik + email + banner (Fase 132) ([bb87aa8](https://github.com/webaneid/facport/commit/bb87aa8))
* feat(other-deposit): modul import Other Deposit ke Accurate (Fase 128) ([af16d04](https://github.com/webaneid/facport/commit/af16d04))
* feat(subscribe): subtitle + accordion default-open per kartu Kategori (Fase 129) ([48ed3b6](https://github.com/webaneid/facport/commit/48ed3b6))
* feat(subscription): tampilkan tanggal expiry aktual di admin & /subscribe (Fase 130) ([b03d064](https://github.com/webaneid/facport/commit/b03d064))
* docs: SOP checklist permanen buat titik registrasi modul import baru (gap kejadian ke-2) ([ae6df39](https://github.com/webaneid/facport/commit/ae6df39))

## 2.4.0 (2026-09-15)

* Merge pull request #62 from webaneid/develop ([af03b19](https://github.com/webaneid/facport/commit/af03b19)), closes [#62](https://github.com/webaneid/facport/issues/62)
* fix(admin): sederhanakan tabel Pengguna jadi 4 kolom, hindari scroll horizontal ([aee2705](https://github.com/webaneid/facport/commit/aee2705))
* feat(sidebar): grup Produk "Facport" + flyout Kategori, fix scroll popup Tambah Paket (Fase 126) ([2fcd530](https://github.com/webaneid/facport/commit/2fcd530))
* feat(subscribe): "Tambahan Anggota" jadi section Produk ke-4, gated fitur aktif dibayar (Fase 127 la ([23973bf](https://github.com/webaneid/facport/commit/23973bf))
* feat(subscribe): redesain /subscribe jadi grup Produk → Kategori → Varian dengan accordion (Fase 127 ([123ec7e](https://github.com/webaneid/facport/commit/123ec7e))
* docs: perbaiki domain production di runbook deploy (ane.web.id sudah decommission sejak Fase 112) ([e21b92c](https://github.com/webaneid/facport/commit/e21b92c))

## 2.3.0 (2026-09-15)

* Merge pull request #61 from webaneid/develop ([cd2e490](https://github.com/webaneid/facport/commit/cd2e490)), closes [#61](https://github.com/webaneid/facport/issues/61)
* fix(import): gating tombol Delete owner-only di 12 halaman Riwayat per-modul (Fase 125 lanjutan) ([3a3bb2d](https://github.com/webaneid/facport/commit/3a3bb2d))
* fix(import): member hanya bisa hapus batch di Data Usaha sendiri, bukan siapa saja (Fase 125) ([1578874](https://github.com/webaneid/facport/commit/1578874))
* fix(purchase-order): branchName kelupaan di requiredFields (Fase 120) ([3b58709](https://github.com/webaneid/facport/commit/3b58709))
* feat(import): owner bisa lihat riwayat upload semua anggota tim (Fase 125 poin 3) ([92208e2](https://github.com/webaneid/facport/commit/92208e2))
* feat(purchase-order): modul import Purchase Order ke Accurate (Fase 120) ([2de0786](https://github.com/webaneid/facport/commit/2de0786))
* feat(purchase-return): modul import Purchase Return ke Accurate (Fase 122) ([a685056](https://github.com/webaneid/facport/commit/a685056))
* feat(receive-item): modul import Receive Item ke Accurate (Fase 121) ([dde9115](https://github.com/webaneid/facport/commit/dde9115))
* feat(sales-quotation): modul import Sales Quotation ke Accurate (Fase 123) ([9cb21ef](https://github.com/webaneid/facport/commit/9cb21ef))
* feat(sales-return): modul import Sales Return ke Accurate (Fase 124) ([8b37f80](https://github.com/webaneid/facport/commit/8b37f80))
* docs: arsitektur 5 sub-modul baru — Purchase Order/Receive Item/Purchase Return/Sales Quotation/Sale ([be414e2](https://github.com/webaneid/facport/commit/be414e2))
* docs: koreksi field Custom Character/Number/Date + klarifikasi scope Fase 119 ([d43b27d](https://github.com/webaneid/facport/commit/d43b27d))
* docs: perbarui Peta Dokumen CLAUDE.md — 5 sub-modul Fase 119 selesai ([3ff5d49](https://github.com/webaneid/facport/commit/3ff5d49))

## 2.2.0 (2026-09-15)

* docs+feat: peta struktur produk multi-brand Facport/Konverter/AutoProduksi (Fase 117, ADR-0033) ([7feae80](https://github.com/webaneid/facport/commit/7feae80))
* Merge pull request #60 from webaneid/develop ([4169796](https://github.com/webaneid/facport/commit/4169796)), closes [#60](https://github.com/webaneid/facport/issues/60)
* fix(accurate): PPh23 Sales Receipt/Purchase Payment salah cocok jenis pajak ([a894f63](https://github.com/webaneid/facport/commit/a894f63))
* feat(invoice): tampilkan Data Usaha + Produk/Modul/Sub-modul di admin panel & PDF (Fase 118) ([03a468c](https://github.com/webaneid/facport/commit/03a468c))

## 2.1.0 (2026-09-14)

* Merge pull request #59 from webaneid/develop ([cefa93b](https://github.com/webaneid/facport/commit/cefa93b)), closes [#59](https://github.com/webaneid/facport/issues/59)
* feat: fitur banner Promo dinamis di /pilih-usaha + admin CRUD (Fase 116) ([25b95e5](https://github.com/webaneid/facport/commit/25b95e5))
* fix: bug backfill Data Usaha (grouping per koneksi bukan per company) + setup backup otomatis produc ([911f80c](https://github.com/webaneid/facport/commit/911f80c))
* fix: scope dashboard/arsip/koneksi ke Data Usaha aktif + reconnect Accurate bisa reuse koneksi (Fase ([96b4890](https://github.com/webaneid/facport/commit/96b4890))
* fix(admin): riwayat langganan jadi accordion per Data Usaha + auto-suggest tanggal expired dari dura ([d03cc6f](https://github.com/webaneid/facport/commit/d03cc6f))
* fix(deploy): pindah image MinIO runtime ke quay.io, hindari rate-limit docker.io ([318d3ac](https://github.com/webaneid/facport/commit/318d3ac))
* fix(scripts): backup-db.sh gagal total (exit 1, tanpa output) karena grep DB_USER/DB_NAME tidak kete ([3c05908](https://github.com/webaneid/facport/commit/3c05908))
* docs: catat deploy manual v2.0.0 - bug drizzle-kit CLI di production + workaround psql manual ([053147d](https://github.com/webaneid/facport/commit/053147d))
* docs: tutup Fase 112 - dokumentasikan deploy v2.0.0 ke production + semua perbaikan pasca-deploy ([ab81cec](https://github.com/webaneid/facport/commit/ab81cec))

## 2.0.0 (2026-09-12)

* feat!: tutup restrukturisasi Data Usaha (Fase 106-111) sebagai rilis v2.0.0 ([421c2aa](https://github.com/webaneid/facport/commit/421c2aa))
* Merge branch 'feature/data-usaha-restructure' into develop ([e5e3f7a](https://github.com/webaneid/facport/commit/e5e3f7a))
* Merge pull request #58 from webaneid/develop ([4e6fc5f](https://github.com/webaneid/facport/commit/4e6fc5f)), closes [#58](https://github.com/webaneid/facport/issues/58)
* fix(admin): admin bisa lihat & targetkan Data Usaha spesifik untuk invoice/langganan customer ([d43ebea](https://github.com/webaneid/facport/commit/d43ebea))
* fix(ci): pindah image MinIO dari docker.io ke quay.io, hindari rate-limit anonymous pull ([399f324](https://github.com/webaneid/facport/commit/399f324))
* fix(deploy): tambah langkah migrate yang hilang di runbook & workflow deploy ([24f7748](https://github.com/webaneid/facport/commit/24f7748))
* fix(web): perbaiki 4 error lint react-hooks/set-state-in-effect, tambah lint ke gate SOP ([98d821e](https://github.com/webaneid/facport/commit/98d821e))
* feat: model seat User Tambahan + invite (password & Google), rewrite gating akses Owned/Accessible ([4f0f9ce](https://github.com/webaneid/facport/commit/4f0f9ce))
* feat: transfer kepemilikan Data Usaha (self-service + admin-assisted) ([2ca4e2e](https://github.com/webaneid/facport/commit/2ca4e2e))
* feat(auth): batas device/sesi login per user + tutup celah Google OAuth disabled-account (Fase 106) ([1499da1](https://github.com/webaneid/facport/commit/1499da1))
* feat(dashboard): gerbang "Pilih Data Usaha" + scoping frontend per Data Usaha (Fase 109) ([e904835](https://github.com/webaneid/facport/commit/e904835))
* feat(dashboard): redesain halaman Pilih Data Usaha + rename Data Usaha + branding dari database ([05078e0](https://github.com/webaneid/facport/commit/05078e0))
* feat(import): accordion tertutup untuk Cocokkan Kolom Purchase Invoice ([aaf1037](https://github.com/webaneid/facport/commit/aaf1037))
* feat(subscriptions): migrasi skema Data Usaha + scoping backend checkout/trial/admin (Fase 107) ([5b4687a](https://github.com/webaneid/facport/commit/5b4687a))
* docs: audit final - 3 gap ditemukan sebelum eksekusi (transfer bulk, billing, OAuth scope) ([f571d02](https://github.com/webaneid/facport/commit/f571d02))
* docs: gap scope OAuth Accurate ternyata sudah terjawab dari preseden kode sendiri ([b635616](https://github.com/webaneid/facport/commit/b635616))
* docs: keputusan final client soal cakupan seat + fitur baru transfer kepemilikan ([5a4a3dc](https://github.com/webaneid/facport/commit/5a4a3dc))
* docs: klarifikasi status Modul saat ini (belum struktur DB, aman diformalkan nanti) ([a72cc8b](https://github.com/webaneid/facport/commit/a72cc8b))
* docs: revisi arsitektur user tambahan - restrukturisasi dashboard per Data Usaha ([d501039](https://github.com/webaneid/facport/commit/d501039))
* docs: sempurnakan alur invite (2 jalur penerimaan) + catat keputusan tertunda cakupan seat ([b021954](https://github.com/webaneid/facport/commit/b021954))
* docs: tambah jalur admin untuk bantu transfer kepemilikan Data Usaha ([7e40418](https://github.com/webaneid/facport/commit/7e40418))

### BREAKING CHANGE

* model kepemilikan subscription/invoice/koneksi Accurate
sekarang di-scope per Data Usaha (data_usaha.userId, MUTABLE), bukan lagi
langsung per akun user. Endpoint yang membaca/menulis subscription tanpa
memperhitungkan dataUsahaId (checkout, admin invoice/subscription
provisioning, gating akses modul) semuanya sudah dimigrasikan di Fase
106-111 - integrasi baru yang menyentuh area ini WAJIB reuse
createInvoiceAndOrder()/createManualSubscriptions()/ownsDataUsaha(), lihat
docs/architecture/architecture-transaction-flow.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

## 1.28.0 (2026-09-11)

* Merge pull request #57 from webaneid/develop ([1d2ea81](https://github.com/webaneid/facport/commit/1d2ea81)), closes [#57](https://github.com/webaneid/facport/issues/57)
* docs: rencana arsitektur user tambahan (seat), multi-instance modul, batas device ([dd9c274](https://github.com/webaneid/facport/commit/dd9c274))
* feat(admin): search form berfungsi di semua halaman list + hapus Cari Cepat (Fase 105) ([72a9c37](https://github.com/webaneid/facport/commit/72a9c37))
* feat(dashboard): logo perusahaan di header + footer copyright (Fase 103) ([230ef9f](https://github.com/webaneid/facport/commit/230ef9f))
* feat(invoice): logo perusahaan di PDF + pindah bukti transfer ke bawah tabel (Fase 104) ([9d6fb79](https://github.com/webaneid/facport/commit/9d6fb79))

## <small>1.27.2 (2026-09-11)</small>

* Merge pull request #56 from webaneid/develop ([7bc198d](https://github.com/webaneid/facport/commit/7bc198d)), closes [#56](https://github.com/webaneid/facport/issues/56)
* fix: trim key baris hasil parse Excel, konsisten dengan header (bug generik) ([35ea28d](https://github.com/webaneid/facport/commit/35ea28d))

## <small>1.27.1 (2026-09-10)</small>

* Merge pull request #55 from webaneid/develop ([b8fa0fd](https://github.com/webaneid/facport/commit/b8fa0fd)), closes [#55](https://github.com/webaneid/facport/issues/55)
* fix: konversi tanggal Excel serial ke DD/MM/YYYY (Other Payment & Journal Voucher) ([24d2e22](https://github.com/webaneid/facport/commit/24d2e22))

## 1.27.0 (2026-09-10)

* Merge pull request #54 from webaneid/develop ([d6c87aa](https://github.com/webaneid/facport/commit/d6c87aa)), closes [#54](https://github.com/webaneid/facport/issues/54)
* fix: pindah kolom Expense Name dekat Acc No, perjelas bukan nama akun ([e6e31f9](https://github.com/webaneid/facport/commit/e6e31f9))
* feat: modul baru Other Payment (Pembayaran Bank/Kas) — Fase 96 ([1e46bbc](https://github.com/webaneid/facport/commit/1e46bbc))

## <small>1.26.2 (2026-09-10)</small>

* Merge pull request #53 from webaneid/develop ([87a25a0](https://github.com/webaneid/facport/commit/87a25a0)), closes [#53](https://github.com/webaneid/facport/issues/53)
* fix: auto-create Kategori Keuangan untuk Journal Voucher (gap Fase 95) ([df2779a](https://github.com/webaneid/facport/commit/df2779a))
* fix: mirror speculative fix struktur PPh (detailTax) ke Purchase Payment ([5507ea4](https://github.com/webaneid/facport/commit/5507ea4))
* fix: struktur payload PPh23 Sales Receipt (detailTax di root, bukan nested) ([e17485c](https://github.com/webaneid/facport/commit/e17485c))

## <small>1.26.1 (2026-09-10)</small>

* Merge pull request #52 from webaneid/develop ([d59bd2c](https://github.com/webaneid/facport/commit/d59bd2c)), closes [#52](https://github.com/webaneid/facport/issues/52)
* fix: pensiunkan Opsi A (format lebar) Jurnal Umum — fix bug tabrakan nama kolom ([103d31c](https://github.com/webaneid/facport/commit/103d31c))
* docs: koreksi Deferral bukan gap — tidak ada kolom Excel untuk itu ([47d3705](https://github.com/webaneid/facport/commit/47d3705))
* docs: rencana Fase 96 — modul baru Other Payment (Pembayaran Bank/Kas) ([f7d70ee](https://github.com/webaneid/facport/commit/f7d70ee))

## 1.26.0 (2026-09-10)

* Merge pull request #51 from webaneid/develop ([4ea37a9](https://github.com/webaneid/facport/commit/4ea37a9)), closes [#51](https://github.com/webaneid/facport/issues/51)
* feat: ekspansi field Jurnal Umum Opsi B + ganti kolom Debit/Kredit terpisah ([7b47445](https://github.com/webaneid/facport/commit/7b47445))
* feat: tambah kolom Nomor Bukti di detail batch admin Sales Receipt ([933fb05](https://github.com/webaneid/facport/commit/933fb05))
* chore: script debug currency JV — tambah rate/primeAmount round 2 ([8a2c513](https://github.com/webaneid/facport/commit/8a2c513))
* chore: script debug PPh bisa pilih koneksi Accurate spesifik via CONNECTION_USER_ID ([c66da7c](https://github.com/webaneid/facport/commit/c66da7c))
* chore: script debug PPh coba kirim pphAmount juga ([48a630b](https://github.com/webaneid/facport/commit/48a630b))
* chore: script debug PPh coba speculative detailTax[].taxId ([53d2668](https://github.com/webaneid/facport/commit/53d2668))
* chore: script debug PPh pakai CONNECTION_ID eksak, bukan heuristik ([60a98c0](https://github.com/webaneid/facport/commit/60a98c0))
* chore: script debug PPh refresh access token proaktif sebelum test ([55779b2](https://github.com/webaneid/facport/commit/55779b2))
* chore: script debug PPh sekarang cetak raw response body (HTTP 403 non-JSON) ([a8bd815](https://github.com/webaneid/facport/commit/a8bd815))
* chore: script debug sekali-pakai riset currency di journal-voucher/save.do ([7f00cb5](https://github.com/webaneid/facport/commit/7f00cb5))
* chore: tambah script debug sekali-pakai isolasi paidPph/pphNumber Sales Receipt ([58437e0](https://github.com/webaneid/facport/commit/58437e0))
* fix: Jurnal Umum — journalNumber dibuang saat kirim ke Accurate, Opsi B tidak bisa di-mapping manual ([3ec50a3](https://github.com/webaneid/facport/commit/3ec50a3))
* docs: catat gap PPh23 Sales Receipt tidak diproses Accurate (menunggu jawaban support) ([f9a6f1c](https://github.com/webaneid/facport/commit/f9a6f1c))

## 1.25.0 (2026-09-10)

* Merge pull request #50 from webaneid/develop ([8de2509](https://github.com/webaneid/facport/commit/8de2509)), closes [#50](https://github.com/webaneid/facport/issues/50)
* fix: bukti transfer tidak bisa dibuka admin (presigned URL salah host) ([d73b2f9](https://github.com/webaneid/facport/commit/d73b2f9))
* fix: lint error react-hooks/set-state-in-effect di detail user admin ([3fa047e](https://github.com/webaneid/facport/commit/3fa047e))
* feat: icon detail/bukti transfer invoice + status pembayaran di PDF ([a4fa47b](https://github.com/webaneid/facport/commit/a4fa47b))
* feat: tombol Hubungkan Ulang & kelola koneksi Accurate dari admin ([f9259bf](https://github.com/webaneid/facport/commit/f9259bf))

## 1.24.0 (2026-09-10)

* Merge pull request #49 from webaneid/develop ([8a5d239](https://github.com/webaneid/facport/commit/8a5d239)), closes [#49](https://github.com/webaneid/facport/issues/49)
* feat: ekspansi field Purchase Payment, fix Branch wajib & bug kurs multi-currency ([964bd33](https://github.com/webaneid/facport/commit/964bd33))
* feat: tambah indikator progres (progress bar + teks berputar) untuk semua fitur import ([ace4117](https://github.com/webaneid/facport/commit/ace4117))
* fix: normalisasi tanggal & dropdown paymentNumber hilang di Purchase Payment ([94fae0a](https://github.com/webaneid/facport/commit/94fae0a))

## 1.23.0 (2026-09-09)

* Merge pull request #48 from webaneid/develop ([601d10e](https://github.com/webaneid/facport/commit/601d10e)), closes [#48](https://github.com/webaneid/facport/issues/48)
* docs: perbaiki komentar/dokumentasi basi Sales Receipt (validasi menyeluruh) ([88f1148](https://github.com/webaneid/facport/commit/88f1148))
* feat: fix dropdown No. Sales Receipt & ekspansi 18 field opsional Sales Receipt ([9a6d07c](https://github.com/webaneid/facport/commit/9a6d07c))
* feat: siapkan scope tax_view untuk riset Tax ID Sales Receipt ([4c5365a](https://github.com/webaneid/facport/commit/4c5365a))
* feat: validasi Tax ID Sales Receipt ke Master Data Pajak Accurate ([476bab2](https://github.com/webaneid/facport/commit/476bab2))
* chore: ganti istilah "modul"/"sub-modul" jadi "fitur" di semua teks UI ([32c2484](https://github.com/webaneid/facport/commit/32c2484))

## <small>1.22.1 (2026-09-09)</small>

* Merge pull request #47 from webaneid/develop ([eda5d2c](https://github.com/webaneid/facport/commit/eda5d2c)), closes [#47](https://github.com/webaneid/facport/issues/47)
* fix: grouping Trans No untuk Purchase Invoice, guard idempotent saat faktur dihapus di Accurate ([c9175b4](https://github.com/webaneid/facport/commit/c9175b4))

## 1.22.0 (2026-09-09)

* Merge pull request #46 from webaneid/develop ([5789068](https://github.com/webaneid/facport/commit/5789068)), closes [#46](https://github.com/webaneid/facport/issues/46)
* feat: mirror link alur pembelian ke Purchase Invoice, tambah field Proyek level Expense ([7f8eb14](https://github.com/webaneid/facport/commit/7f8eb14))

## 1.21.0 (2026-09-09)

* Merge pull request #45 from webaneid/develop ([02407d5](https://github.com/webaneid/facport/commit/02407d5)), closes [#45](https://github.com/webaneid/facport/issues/45)
* feat: link alur penjualan/pembelian level ITEM+EXPENSE, rename PO No/Expense, fix scope vendor Purch ([73819eb](https://github.com/webaneid/facport/commit/73819eb))

## 1.20.0 (2026-09-09)

* Merge pull request #44 from webaneid/develop ([728d85c](https://github.com/webaneid/facport/commit/728d85c)), closes [#44](https://github.com/webaneid/facport/issues/44)
* feat: tambah Atribut Tambahan & Kategori Keuangan Purchase Invoice ([33df07b](https://github.com/webaneid/facport/commit/33df07b))
* feat: tambah Kategori Keuangan level EXPENSE (baris Beban) Sales Invoice ([51b30e6](https://github.com/webaneid/facport/commit/51b30e6))

## 1.19.0 (2026-09-09)

* Merge pull request #43 from webaneid/develop ([67efe79](https://github.com/webaneid/facport/commit/67efe79)), closes [#43](https://github.com/webaneid/facport/issues/43)
* feat: tambah Atribut Tambahan level ITEM (charField/numericField/dateField) ([eaff3c9](https://github.com/webaneid/facport/commit/eaff3c9))

## <small>1.18.2 (2026-09-08)</small>

* Merge pull request #42 from webaneid/develop ([1ae5c2e](https://github.com/webaneid/facport/commit/1ae5c2e)), closes [#42](https://github.com/webaneid/facport/issues/42)
* fix: koreksi kolom Kategori Keuangan + fix lookup gagal kenali record existing ([a168cfd](https://github.com/webaneid/facport/commit/a168cfd))

## <small>1.18.1 (2026-09-08)</small>

* Merge pull request #41 from webaneid/develop ([abc0be2](https://github.com/webaneid/facport/commit/abc0be2)), closes [#41](https://github.com/webaneid/facport/issues/41)
* fix: rename kolom template Sales Invoice sesuai istilah resmi Accurate ([cb201b3](https://github.com/webaneid/facport/commit/cb201b3))

## 1.18.0 (2026-09-08)

* Merge pull request #40 from webaneid/develop ([320aa9a](https://github.com/webaneid/facport/commit/320aa9a)), closes [#40](https://github.com/webaneid/facport/issues/40)
* feat: auto-create Kategori Keuangan (Atribut Tambahan item-level) Sales Invoice ([ca11766](https://github.com/webaneid/facport/commit/ca11766))

## <small>1.17.2 (2026-09-08)</small>

* Merge pull request #39 from webaneid/develop ([d6adc5f](https://github.com/webaneid/facport/commit/d6adc5f)), closes [#39](https://github.com/webaneid/facport/issues/39)
* fix: batasi guard idempotent append faktur ke retry batch yang sama ([391e649](https://github.com/webaneid/facport/commit/391e649))

## <small>1.17.1 (2026-09-08)</small>

* Merge pull request #38 from webaneid/develop ([8ed5659](https://github.com/webaneid/facport/commit/8ed5659)), closes [#38](https://github.com/webaneid/facport/issues/38)
* fix(invoice-import): atribut tambahan level header, dropdown mapping, tipe data boolean/persen ([7725a44](https://github.com/webaneid/facport/commit/7725a44))
* fix(sales-invoice): tampilkan Nomor Transaksi, sinkron grouping Fase 49 ([4a3dce8](https://github.com/webaneid/facport/commit/4a3dce8))
* docs(auth): panduan step-by-step Login/Register Google, portable ke project lain ([7738038](https://github.com/webaneid/facport/commit/7738038))

## 1.17.0 (2026-09-08)

* Merge pull request #37 from webaneid/develop ([d00d9c8](https://github.com/webaneid/facport/commit/d00d9c8)), closes [#37](https://github.com/webaneid/facport/issues/37)
* feat(auth): login/register dengan Google OAuth (surface app saja) ([2264c66](https://github.com/webaneid/facport/commit/2264c66))

## <small>1.16.1 (2026-09-08)</small>

* Merge pull request #36 from webaneid/develop ([9cd53d9](https://github.com/webaneid/facport/commit/9cd53d9)), closes [#36](https://github.com/webaneid/facport/issues/36)
* fix(sales-invoice): koreksi mapping atribut tambahan & requiredFields ke format client asli ([5dabdb7](https://github.com/webaneid/facport/commit/5dabdb7))

## 1.16.0 (2026-09-07)

* Merge pull request #35 from webaneid/develop ([d1b0283](https://github.com/webaneid/facport/commit/d1b0283)), closes [#35](https://github.com/webaneid/facport/issues/35)
* feat(admin): redesign dashboard admin dengan chart & fix bug userCount ([40c4e7e](https://github.com/webaneid/facport/commit/40c4e7e))
* feat(subscribe): prioritaskan tier tahunan sebagai default auto-select ([459be56](https://github.com/webaneid/facport/commit/459be56))

## <small>1.15.1 (2026-09-07)</small>

* Merge pull request #34 from webaneid/develop ([f9a39a2](https://github.com/webaneid/facport/commit/f9a39a2)), closes [#34](https://github.com/webaneid/facport/issues/34)
* fix(admin): tampilkan semua langganan aktif user di /admin/users, bukan cuma 1 ([1efd51d](https://github.com/webaneid/facport/commit/1efd51d))
* fix(notifications): link admin double-prefix /admin/admin/... jadi bare path ([8808bc1](https://github.com/webaneid/facport/commit/8808bc1))

## 1.15.0 (2026-09-07)

* Merge pull request #33 from webaneid/develop ([15301ce](https://github.com/webaneid/facport/commit/15301ce)), closes [#33](https://github.com/webaneid/facport/issues/33)
* fix(workers): baris import dapat error message saat batch gagal dini (semua modul) ([26dc9ba](https://github.com/webaneid/facport/commit/26dc9ba))
* docs(sales-invoice): catat status rilis Fase 55 — kode selesai, belum di-release ([368d8ef](https://github.com/webaneid/facport/commit/368d8ef))
* feat(sales-invoice): dukung Atribut Tambahan (Data Classification) di import Excel ([7a1774e](https://github.com/webaneid/facport/commit/7a1774e))

## 1.14.0 (2026-09-07)

* Merge pull request #32 from webaneid/develop ([97d078d](https://github.com/webaneid/facport/commit/97d078d)), closes [#32](https://github.com/webaneid/facport/issues/32)
* fix: trial tidak boleh blokir upgrade ke paket asli (Fase 54) ([2b39cd4](https://github.com/webaneid/facport/commit/2b39cd4))
* fix(branding): sidebar pakai favicon (persegi), bukan logo (panjang) ([109283f](https://github.com/webaneid/facport/commit/109283f))
* fix(notifications): link pengumuman customer ke /notifications, bukan / ([02be873](https://github.com/webaneid/facport/commit/02be873))
* feat: multi-tier billing per sub-modul (Bulanan/Tahunan dalam 1 kartu) ([c1960fa](https://github.com/webaneid/facport/commit/c1960fa))
* feat(auth): redesain 7 halaman auth + koreksi warna brand resmi Facport ([7ab409d](https://github.com/webaneid/facport/commit/7ab409d)), closes [#023e8a](https://github.com/webaneid/facport/issues/023e8a) [#178549](https://github.com/webaneid/facport/issues/178549) [#184e30](https://github.com/webaneid/facport/issues/184e30) [#55b4d6](https://github.com/webaneid/facport/issues/55b4d6) [#f5f1e8](https://github.com/webaneid/facport/issues/f5f1e8) [#178549](https://github.com/webaneid/facport/issues/178549) [#184e30](https://github.com/webaneid/facport/issues/184e30) [#023e8a](https://github.com/webaneid/facport/issues/023e8a)
* feat(notifications): popup detail saat klik notifikasi dari lonceng ([89572d4](https://github.com/webaneid/facport/commit/89572d4))
* docs: tutup Fase 52 — dokumentasi deploy production pertama facinstitute.id ([9922731](https://github.com/webaneid/facport/commit/9922731))
* docs: update Fase 52 — Resend email production resolved ([9b4ab66](https://github.com/webaneid/facport/commit/9b4ab66))

## <small>1.13.2 (2026-09-07)</small>

* Merge pull request #31 from webaneid/develop ([4d932c6](https://github.com/webaneid/facport/commit/4d932c6)), closes [#31](https://github.com/webaneid/facport/issues/31)
* fix(docker): sertakan drizzle.config.ts + drizzle/ + src/ di image api ([4717717](https://github.com/webaneid/facport/commit/4717717))

## <small>1.13.1 (2026-09-06)</small>

* Merge pull request #28 from webaneid/develop ([19459eb](https://github.com/webaneid/facport/commit/19459eb)), closes [#28](https://github.com/webaneid/facport/issues/28)
* fix(api): pdfkit gagal resolve font di production build ([17ea1c7](https://github.com/webaneid/facport/commit/17ea1c7))

## 1.13.0 (2026-09-06)

* Merge pull request #25 from webaneid/feat/sales-invoice ([ae84211](https://github.com/webaneid/facport/commit/ae84211)), closes [#25](https://github.com/webaneid/facport/issues/25)
* Merge pull request #26 from webaneid/feat/subscription-foundation ([67b2138](https://github.com/webaneid/facport/commit/67b2138)), closes [#26](https://github.com/webaneid/facport/issues/26)
* Merge pull request #27 from webaneid/develop ([8dbdc41](https://github.com/webaneid/facport/commit/8dbdc41)), closes [#27](https://github.com/webaneid/facport/issues/27)
* fix: audit & perbaikan timezone menyeluruh — 2 bug FATAL (Fase 44) ([9382545](https://github.com/webaneid/facport/commit/9382545))
* fix(ci): ganti pendekatan MinIO — docker run manual, bukan services ([8c7ae9a](https://github.com/webaneid/facport/commit/8c7ae9a))
* fix(ci): tambah MinIO di release.yml + deploy-staging.yml (bug sama ci.yml) ([8ee0656](https://github.com/webaneid/facport/commit/8ee0656))
* fix(ci): tambah service MinIO yang hilang di validate job ([3b267c6](https://github.com/webaneid/facport/commit/3b267c6))
* fix(landing): tangkap koneksi gagal saat fetch /public/stats ([7ee352e](https://github.com/webaneid/facport/commit/7ee352e))
* feat: Admin UI Kit v2 — shell, primitives, data table, permission guard (Fase 23-26) ([14fc446](https://github.com/webaneid/facport/commit/14fc446))
* feat: checkout UI + onboarding admin + fondasi admin design system (Fase 17-19) ([69e168b](https://github.com/webaneid/facport/commit/69e168b))
* feat: estimasi efisiensi waktu kerja + arsip import gabungan + QRIS auto-decode + paket durasi fleks ([df469b0](https://github.com/webaneid/facport/commit/df469b0))
* feat: fondasi test frontend + 3 modul transaksi baru — Purchase Payment, Sales Receipt, Journal Vouc ([39973b2](https://github.com/webaneid/facport/commit/39973b2))
* feat: manajemen invoice admin + modul Akun Hutang Pemasok terpisah + role staff + lupa password (Fas ([1bc9256](https://github.com/webaneid/facport/commit/1bc9256))
* feat: paritas riwayat/edit baris/hapus untuk Vendor Payable Account, Purchase Payment, Sales Receipt ([d0068d7](https://github.com/webaneid/facport/commit/d0068d7))
* feat: redesain landing page + auto-login verifikasi email + perbaiki grouping multi-baris 5 modul im ([4bd89da](https://github.com/webaneid/facport/commit/4bd89da))
* feat: sistem notifikasi in-app + pengumuman admin + Customer Care (Fase 45-46) ([070005b](https://github.com/webaneid/facport/commit/070005b))
* feat: unifikasi status invoice/pembayaran + rollout konsistensi admin + account self-service (Fase 2 ([9a013d9](https://github.com/webaneid/facport/commit/9a013d9))
* feat(invoice): skema invoice profesional + generator PDF server-side ([f78d021](https://github.com/webaneid/facport/commit/f78d021))
* feat(payment): ganti rencana payment gateway ke pembayaran manual (transfer bank + QRIS) ([b8d093b](https://github.com/webaneid/facport/commit/b8d093b))
* feat(sales-invoice): Sales Invoice (Faktur Penjualan) — mirror lengkap Purchase Invoice ([4ec5e83](https://github.com/webaneid/facport/commit/4ec5e83))
* feat(subscription): restrukturisasi gating per sub-modul + koneksi Accurate reusable ([64378c8](https://github.com/webaneid/facport/commit/64378c8))
* docs: runbook onboarding domain baru ke VPS shared (realita nginx, bukan Caddy) ([ea62116](https://github.com/webaneid/facport/commit/ea62116))
* docs: sync develop docs ke main (runbook onboarding domain baru) ([b1dc65c](https://github.com/webaneid/facport/commit/b1dc65c))

## 1.12.0 (2026-09-04)

* Merge pull request #23 from webaneid/feat/admin-expiry-and-branding ([b286835](https://github.com/webaneid/facport/commit/b286835)), closes [#23](https://github.com/webaneid/facport/issues/23)
* Merge pull request #24 from webaneid/develop ([1d24b86](https://github.com/webaneid/facport/commit/1d24b86)), closes [#24](https://github.com/webaneid/facport/issues/24)
* docs: catat 2 bug deploy-staging.yml lagi (env test-gate + permissions GHCR) ([1d417ad](https://github.com/webaneid/facport/commit/1d417ad))
* docs: catat 3 bug ci.yml laten yang ketahuan di PR pertama repo ini ([4db1a01](https://github.com/webaneid/facport/commit/4db1a01))
* docs: catat root cause tombol Retry hilang + bug Bill No vs Trans No mismatch ([876e090](https://github.com/webaneid/facport/commit/876e090))
* fix(ci): deploy-staging.yml lupa services Postgres + env block untuk typecheck/test ([4a8901d](https://github.com/webaneid/facport/commit/4a8901d))
* fix(ci): fetch-depth 0 di ci.yml supaya gitleaks-action bisa diff base..head PR ([97a9a25](https://github.com/webaneid/facport/commit/97a9a25))
* fix(ci): tambah MINIO_PUBLIC_URL ke env CI/release ([0bd3f5b](https://github.com/webaneid/facport/commit/0bd3f5b))
* fix(ci): tambah permissions packages:write ke deploy-staging.yml ([db479a6](https://github.com/webaneid/facport/commit/db479a6))
* fix(lint): patuhi rule react-hooks/set-state-in-effect & immutability (eslint-plugin-react-hooks v7) ([2522cb7](https://github.com/webaneid/facport/commit/2522cb7))
* feat(branding): upload logo & favicon company, bucket public MinIO baru ([3a8e2da](https://github.com/webaneid/facport/commit/3a8e2da))
* feat(subscriptions): admin bisa set tanggal expired manual per subscription ([75f2da8](https://github.com/webaneid/facport/commit/75f2da8))

## 1.11.0 (2026-09-02)

* feat: perjelas dialog Edit Baris — tanda wajib, highlight per-kolom, auto-scroll ke error ([a2ae455](https://github.com/webaneid/facport/commit/a2ae455))

## <small>1.10.5 (2026-09-01)</small>

* fix: tombol Retry hilang saat semua baris gagal sudah diedit jadi menunggu ([24d1404](https://github.com/webaneid/facport/commit/24d1404))
* docs: standarkan runbook deploy manual (Minimal/Full) ke server ([89616bf](https://github.com/webaneid/facport/commit/89616bf))

## <small>1.10.4 (2026-08-31)</small>

* fix: terjemahkan field wajib ke nama kolom Excel di error Edit Baris ([40642fe](https://github.com/webaneid/facport/commit/40642fe))
* docs: catat gotcha deploy manual — network "edge" bikin bare `up -d` selalu gagal di VPS ini ([6b768c8](https://github.com/webaneid/facport/commit/6b768c8))

## <small>1.10.3 (2026-08-31)</small>

* fix: matikan auto-parse Date Eden Treaty — cegah tanggal rusak di dialog Edit baris ([b3d0ff1](https://github.com/webaneid/facport/commit/b3d0ff1))
* docs: catat 2 bug produksi hari ini di lessons-learned.md ([c0b2926](https://github.com/webaneid/facport/commit/c0b2926))

## <small>1.10.2 (2026-08-28)</small>

* fix: normalisasi tanggal di dialog Edit baris gagal ([75cbff2](https://github.com/webaneid/facport/commit/75cbff2))

## <small>1.10.1 (2026-08-28)</small>

* fix: AppShell nav — pisahkan surface (string) dari komponen icon ([8b8261c](https://github.com/webaneid/facport/commit/8b8261c))
* docs: tutup Fase 10 — diverifikasi nyata (job retensi + query admin) ([1030975](https://github.com/webaneid/facport/commit/1030975))

## 1.10.0 (2026-08-28)

* feat: Fase 10 — admin dashboard (settings, user, paket, retensi data) ([f2a7734](https://github.com/webaneid/facport/commit/f2a7734))
* docs: catat fitur Delete (hapus lokal) di PROGRESS.md ([f3b615a](https://github.com/webaneid/facport/commit/f3b615a))

## 1.9.0 (2026-08-28)

* feat: aktifkan Delete — hapus riwayat import lokal, tidak sentuh Accurate ([a016916](https://github.com/webaneid/facport/commit/a016916))
* docs: catat fitur Edit Baris Gagal di PROGRESS.md ([164aae1](https://github.com/webaneid/facport/commit/164aae1))

## 1.8.0 (2026-08-28)

* feat: edit baris gagal langsung di aplikasi (tanpa upload ulang) ([04790f4](https://github.com/webaneid/facport/commit/04790f4))

## <small>1.7.3 (2026-08-28)</small>

* fix(web): lebarkan halaman detail batch (max-w-3xl -> max-w-4xl) ([fbb7445](https://github.com/webaneid/facport/commit/fbb7445))

## <small>1.7.2 (2026-08-28)</small>

* fix(web): pindah icon Edit ke baris gagal, bukan tabel batch ([df6823f](https://github.com/webaneid/facport/commit/df6823f))

## <small>1.7.1 (2026-08-28)</small>

* fix: dashboard 500 — pisahkan CANCELLABLE_BATCH_STATUS dari file "use client" ([d6cd362](https://github.com/webaneid/facport/commit/d6cd362))

## 1.7.0 (2026-08-28)

* feat(web): icon konsisten Detail/Batal Import di dashboard + arsip ([dfe6a95](https://github.com/webaneid/facport/commit/dfe6a95))
* docs: tutup Fase 09 — diverifikasi ulang nyata pasca-fix ADR-0014 ([26a7e4e](https://github.com/webaneid/facport/commit/26a7e4e))

## <small>1.6.1 (2026-08-28)</small>

* fix: Fase 09 — blokir faktur gabungan, bukan susutkan (ADR-0014) ([0d6503b](https://github.com/webaneid/facport/commit/0d6503b))

## 1.6.0 (2026-08-27)

* feat: Fase 09 — Batal Import (hapus/susutkan faktur di Accurate) ([b8fc5f4](https://github.com/webaneid/facport/commit/b8fc5f4))
* docs: tutup Fase 08 — diverifikasi nyata (6/6 retry sukses) ([0029fe9](https://github.com/webaneid/facport/commit/0029fe9)), closes [200/#250](https://github.com/webaneid/facport/issues/250)

## <small>1.5.1 (2026-08-27)</small>

* fix: field vendor.vendorNo (bukan vendor.no) di getPurchaseInvoiceDetail ([00bb9fb](https://github.com/webaneid/facport/commit/00bb9fb))

## 1.5.0 (2026-08-27)

* feat: Fase 08 — Retry Cerdas, update faktur existing (append item) ([8128049](https://github.com/webaneid/facport/commit/8128049))
* docs: tutup Fase 06 — diverifikasi nyata ke Accurate + lessons-learned worker ([f4a56ab](https://github.com/webaneid/facport/commit/f4a56ab))

## 1.4.0 (2026-08-27)

* docs: update Fase 06 — sisi kode selesai, menunggu verifikasi Accurate nyata ([13a046f](https://github.com/webaneid/facport/commit/13a046f))
* feat(api): grouping Faktur Pembelian multi-item berdasarkan Bill No (Fase 06, 1/3) ([05c5e37](https://github.com/webaneid/facport/commit/05c5e37))
* feat(api): worker proses Faktur Pembelian per-grup, bukan per-baris (Fase 06, 2/3) ([8080505](https://github.com/webaneid/facport/commit/8080505))
* feat(web): catatan info grouping multi-item di UI konfirmasi mapping (Fase 06, 3/3) ([e3ccb36](https://github.com/webaneid/facport/commit/e3ccb36))

## 1.3.0 (2026-08-27)

* feat(web): tampilkan & urutkan Nomor Faktur di detail hasil import (Fase 07) ([376991c](https://github.com/webaneid/facport/commit/376991c))
* docs: rencana Fase 06 (Purchase Invoice multi-item) + ADR-0011 ([34fab0a](https://github.com/webaneid/facport/commit/34fab0a))
* fix(api): import_batches.status varchar(20) overflow untuk "completed_with_errors" ([d49b234](https://github.com/webaneid/facport/commit/d49b234))

## <small>1.2.1 (2026-08-27)</small>

* fix(deploy): tambah service worker — job queue TIDAK PERNAH diproses tanpa ini ([a256df0](https://github.com/webaneid/facport/commit/a256df0))

## 1.2.0 (2026-08-27)

* feat(import): pakai template-guide.ts — generateTemplateBuffer signature baru ([8e61194](https://github.com/webaneid/facport/commit/8e61194))
* feat(import): tambah panduan pengisian + baris contoh di template Excel ([350256c](https://github.com/webaneid/facport/commit/350256c))

## 1.1.0 (2026-08-26)

* feat(accurate): simpan & tampilkan nama Data Usaha, perbaiki UX pilih Data Usaha ([e51cb0c](https://github.com/webaneid/facport/commit/e51cb0c))

## <small>1.0.17 (2026-08-26)</small>

* fix(web): dashboard 500 — fetchJson() gak tahan body kosong dari /me/subscription ([a0e3c5f](https://github.com/webaneid/facport/commit/a0e3c5f))

## <small>1.0.16 (2026-08-26)</small>

* fix(api): 3 pola process.env.NODE_ENV lain kena const-fold Bun juga ([c190d93](https://github.com/webaneid/facport/commit/c190d93))

## <small>1.0.15 (2026-08-26)</small>

* fix(api): crossSubDomainCookies.enabled ke-const-fold jadi false permanen saat build ([2fe0033](https://github.com/webaneid/facport/commit/2fe0033))

## <small>1.0.14 (2026-08-26)</small>

* fix(web): NEXT_PUBLIC_API_URL di-bake ke bundle client saat build, bukan runtime ([1a96c3e](https://github.com/webaneid/facport/commit/1a96c3e))

## <small>1.0.13 (2026-08-26)</small>

* fix(deploy): healthcheck api/web pakai wget yang gak ada di image slim ([97881b4](https://github.com/webaneid/facport/commit/97881b4))

## <small>1.0.12 (2026-08-26)</small>

* fix(docker): api production stage juga butuh node_modules root (symlink sharp patah) ([7d80172](https://github.com/webaneid/facport/commit/7d80172))

## <small>1.0.11 (2026-08-26)</small>

* fix(deploy): DATABASE_URL di .env.production/staging.example gak boleh pakai \${...} ([58b0108](https://github.com/webaneid/facport/commit/58b0108))
* docs: dokumentasikan 6 bug deploy.yml (deploy.yml belum pernah jalan sejak v1.0.0) ([590c8cf](https://github.com/webaneid/facport/commit/590c8cf))

## <small>1.0.10 (2026-08-26)</small>

* fix(docker): web production stage — jalan di Node, bukan Bun, tanpa output:standalone ([d822d0b](https://github.com/webaneid/facport/commit/d822d0b))

## <small>1.0.9 (2026-08-26)</small>

* fix(web): bungkus LoginForm dengan Suspense — useSearchParams() bikin next build gagal ([6164826](https://github.com/webaneid/facport/commit/6164826))

## <small>1.0.8 (2026-08-26)</small>

* fix(docker): web build butuh source+deps apps/api juga (Eden Treaty type import) ([8d62159](https://github.com/webaneid/facport/commit/8d62159))

## <small>1.0.7 (2026-08-26)</small>

* fix(docker): copy root tsconfig.json — extends "../../tsconfig.json" gagal resolve ([6d3c93c](https://github.com/webaneid/facport/commit/6d3c93c))

## <small>1.0.6 (2026-08-26)</small>

* fix(api): tambah script "build" yang belum ada — Dockerfile butuh dist/index.js ([569381d](https://github.com/webaneid/facport/commit/569381d))

## <small>1.0.5 (2026-08-26)</small>

* fix(docker): Dockerfile copy bun.lockb yang tidak ada, seharusnya bun.lock ([92d2938](https://github.com/webaneid/facport/commit/92d2938))

## <small>1.0.4 (2026-08-26)</small>

* fix(ci): resolve-tag salah bandingkan SHA — build-and-push selalu ke-skip ([174cae8](https://github.com/webaneid/facport/commit/174cae8))

## <small>1.0.3 (2026-08-26)</small>

* fix(ci): deploy.yml tidak pernah jalan — GITHUB_TOKEN gak trigger event release ([ae1fd1f](https://github.com/webaneid/facport/commit/ae1fd1f))

## <small>1.0.2 (2026-08-26)</small>

* fix(web): resolve surface via subdomain prefix instead of hardcoded domain ([5f32fda](https://github.com/webaneid/facport/commit/5f32fda))
* docs: dokumentasikan 5 bug CI/CD dari push pertama + verifikasi pipeline ([bef70a1](https://github.com/webaneid/facport/commit/bef70a1))
* docs: prune irrelevant/stale documentation to save read tokens ([2bf9903](https://github.com/webaneid/facport/commit/2bf9903))

## <small>1.0.1 (2026-08-22)</small>

* fix: Akun Hutang di import Faktur Pembelian juga update vendor existing ([22bfa31](https://github.com/webaneid/facport/commit/22bfa31))

## 1.0.0 (2026-08-22)

* fix: install conventional-changelog-conventionalcommits peer dep ([d54f027](https://github.com/webaneid/facport/commit/d54f027))
* fix: install semantic-release plugins as devDependencies ([f560b7b](https://github.com/webaneid/facport/commit/f560b7b))
* fix: pin conventional-changelog-conventionalcommits to v7 ([83b53d2](https://github.com/webaneid/facport/commit/83b53d2))
* fix: seed role admin/customer in CI before running tests ([7349060](https://github.com/webaneid/facport/commit/7349060))
* fix: setup working CI/CD pipeline ([a7d7673](https://github.com/webaneid/facport/commit/a7d7673))
* Initial commit: Facport Fase 00-05 ([7fb0e98](https://github.com/webaneid/facport/commit/7fb0e98))
