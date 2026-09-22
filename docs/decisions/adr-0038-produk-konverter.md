# ADR-0038: Produk Konverter (Excel→XML untuk Accurate Desktop) — Arsitektur & Migrasi dari App Lama

**Status:** Accepted
**Tanggal:** 2026-09-22
**Extends:** ADR-0033 (ekspansi multi-produk) — mengisi keputusan konkret yang di ADR-0033 masih "belum ditentukan pas fase build masing-masing". ADR-0019 (gating per sub-modul & katalog plan) tetap berlaku, TIDAK diganti.

## Context

Produk kedua Facport ("Konverter", § `architecture-product-lines.md`) sudah direncanakan sejak Fase 117 tapi 0% dibangun. Ada aplikasi TERPISAH yang sudah berjalan di produksi untuk fitur ini: `/Users/webane/sites/konverter` (PHP, ~2000 baris + ~1000 baris JS, storage JSON file flat, 34 user). Fungsinya: convert Excel→XML **100% di browser** (tanpa API call ke Accurate sama sekali) untuk pengguna **Accurate DESKTOP** (beda dari Facport yang untuk Accurate Online via OAuth) — 16 tipe transaksi.

Riset (3 subagent Explore, grounded ke kode nyata kedua sisi — app lama & Facport) sebelum ADR ini ditulis menemukan:
- Logic konversi per tipe (`process`/`build`/`summary`) di app lama adalah PURE FUNCTIONS tanpa dependency DOM — sangat portable ke TypeScript.
- Infrastruktur billing/gating Facport (`moduleAccess()`, `plans.productLine`, `createTrialSubscription()`) SUDAH cukup generik untuk dipakai Konverter TANPA ubah kode.
- Satu fungsi trial (`checkTrialRowBudget`) TIDAK generik — terikat `import_batches` yang Konverter tidak punya.
- TIDAK ADA pola "generate file di browser lalu download" di Facport sama sekali (semua download lewat server) — Konverter jadi pola pertama.
- App lama punya model entitlement (`jenis` = daftar tipe transaksi yang diizinkan per user, + `aktif_dari`/`aktif_sampai` = window aktif akun) yang PERSIS konsep sub-modul+subscription Facport — memperkuat keputusan "pola Modul→Sub-modul sama seperti Facport", bukan model baru.

## Decision

1. **Auth/billing/RBAC Konverter = 100% Facport, TANPA migrasi apa pun dari app lama** (dikonfirmasi eksplisit oleh user). Better Auth, `plans`/`subscriptions`/`invoices`/`orders`, `moduleAccess()` macro dipakai APA ADANYA. Sistem lama (session PHP native, bcrypt, JSON file, CSRF token sendiri) dibuang total, TIDAK diporting.

2. **16 tipe transaksi = 16 Varian (moduleKey) TERPISAH, SKU granular** (mirror ADR-0019 persis) — BUKAN bundel tetap, BUKAN 1 SKU tunggal buka semua. Konvensi nama moduleKey: `konverter_<tipe>` (snake_case, mis. `konverter_sales_invoice`, `konverter_journal_voucher`) — konsisten pola existing (`sales_invoice`, dst), prefix `konverter_` supaya visually jelas beda Produk saat dilihat campur di `plans.modules`/kode, dan mencegah collision nama modul lintas Produk di masa depan (mis. Facport & Konverter keduanya punya "Sales Invoice").

   Pemetaan 16 tipe → moduleKey → Kategori (existing `MODULE_CATEGORIES`, KECUALI 1 kategori baru):
   | Tipe legacy | moduleKey | Kategori |
   |---|---|---|
   | salesinvoice | `konverter_sales_invoice` | Sales |
   | salesorder | `konverter_sales_order` | Sales |
   | deliveryorder | `konverter_delivery_order` | Sales |
   | salesreturn | `konverter_sales_return` | Sales |
   | purchaseinvoice | `konverter_purchase_invoice` | Purchase |
   | purchaseorder | `konverter_purchase_order` | Purchase |
   | receiveitem | `konverter_receive_item` | Purchase |
   | purchasereturn | `konverter_purchase_return` | Purchase |
   | otherdeposit | `konverter_other_deposit` | Cash & Bank |
   | otherpayment | `konverter_other_payment` | Cash & Bank |
   | customerreceipt | `konverter_customer_receipt` | Cash & Bank |
   | vendorpayment | `konverter_vendor_payment` | Cash & Bank |
   | journalvoucher | `konverter_journal_voucher` | General Ledger |
   | itemtransfer | `konverter_item_transfer` | Inventory |
   | requisition | `konverter_requisition` | Inventory |
   | stdcost | `konverter_standard_cost` | **Master Data** (kategori BARU, § poin 3) |

3. **Tambah 1 kategori baru "Master Data" di `MODULE_CATEGORIES`** — `stdcost` (update Harga Pokok Standar & Jual) bukan transaksi, tapi update data master barang; tidak cocok masuk 5 kategori existing (Cash & Bank/GL/Purchase/Sales/Inventory/Manufacture). Kategori ini murni presentasional (sama seperti kategori lain), tidak dipakai gating.

4. **Tabel `conversion_logs` BARU** (desain final, sebelumnya cuma dikunci di ADR-0033 sebagai rencana):
   ```
   conversion_logs
     id            uuid PK default gen_random_uuid()
     userId        text NOT NULL → user.id
     dataUsahaId   uuid NOT NULL → data_usaha.id
     subscriptionId uuid NOT NULL → subscriptions.id
     moduleKey     varchar(50) NOT NULL   -- "konverter_sales_invoice", dst
     fileName      varchar(255) NOT NULL  -- nama file Excel yang diupload, self-reported
     rowCount      integer NOT NULL       -- jumlah baris berhasil dikonversi, self-reported
     createdAt     timestamptz NOT NULL default now()
   ```
   SEMUA self-reported dari client (browser lapor "saya baru convert file X, N baris, tipe Y") — TIDAK diverifikasi server (tidak ada cara verifikasi tanpa mengirim isi file, yang justru melanggar prinsip privacy-first 100%-client-side app lama). Tabel ini PURE riwayat/analytics (halaman "Riwayat Konversi" customer + rekap admin), **BUKAN untuk enforcement kuota trial** (§ poin 5) — beda filosofi dari `import_batches` Facport yang server-verified.

5. **Trial Konverter = DURASI HARI SAJA, TANPA kuota baris.** `checkTrialRowBudget()` (`lib/trial.ts`) TIDAK dipanggil sama sekali oleh rute Konverter manapun (Konverter tidak punya route import server-side — satu-satunya endpoint server adalah `POST /me/conversion-logs`, sekadar insert log, TIDAK ada pengecekan kuota di situ). `createTrialSubscription()` dipakai APA ADANYA (generik, tidak butuh ubah kode) — trial berakhir murni berdasar `trial.durationDays` (backstop kadaluarsa yang sudah ada), konsisten karena kuota baris HARD-ENFORCED tidak mungkin secara teknis untuk proses 100% client-side/self-reported (user bisa lapor angka apa saja).

6. **Union TypeBox `modules` (`admin/plans.route.ts`) ditambah 16 `t.Literal` manual** — TIDAK digenerate otomatis dari `module-catalog.ts` (alasan sama seperti Facport: `.map()` dari const array merusak inferensi Eden Treaty, insiden 2026-09-04, dijaga test guard drift-check yang sudah ada).

7. **Pola client-side baru** (dibangun sekali, dipakai 16 tipe): `apps/web/lib/converter/shared.ts` (port helper generik app lama: `escapeXml`, `str`, `flag1`, `num`, `normDate`, `reserved`, `envelope` — SEMUA pure function, tanpa DOM), `apps/web/lib/download-file.ts` (helper baru `downloadTextFile(filename, content, mimeType)` via `Blob`+`URL.createObjectURL`+`<a download>` sintetis — pola PERTAMA di project ini, tidak ada existing helper). `xlsx` (SheetJS, versi CDN SAMA `xlsx-0.20.3` seperti `apps/api`) ditambah sebagai dependency `apps/web`, WAJIB `dynamic import()` khusus route `/konverter/*` (bundle ~1MB+, jangan masuk initial load halaman lain).

8. **Sidebar**: `NavGroup` baru `{label: "Konverter", productLine: "konverter", items: [...]}`. Logic clustering per Produk (field `NavGroup.productLine`) SUDAH punya tipe sejak Fase 117 tapi belum pernah ada implementasi nyata yang dites — WAJIB divalidasi jalan benar dengan Facport nav AKTIF BERSAMAAN (bukan diasumsikan otomatis benar hanya karena tipenya sudah ada).

9. **Migrasi 34 user app lama DITUNDA** (keputusan eksplisit user, bukan lupa) — app lama tetap jalan terpisah untuk mereka sampai masa aktif habis. Konverter di Facport = signup baru. Revisit kapan pun ada kebutuhan bisnis nyata untuk migrasi (mis. app lama mau di-nonaktifkan total).

## Alternatif yang Dipertimbangkan

- **Bundel tetap (Paket Penjualan/Pembelian/dst, mirror "paket cepat" app lama)** — ditolak: kurang fleksibel dibanding SKU granular, admin tetap bisa BUAT plan yang menggabungkan beberapa moduleKey lewat `/admin/plans` yang sudah ada (1 Plan boleh berisi banyak `modules`) — jadi granular tidak menghalangi dijual sebagai "paket", cuma fleksibel di kedua arah.
- **1 SKU tunggal buka semua 16 tipe** — ditolak: tidak bisa jual sebagian tipe ke customer yang cuma butuh sedikit, kontradiksi dengan model ADR-0019 yang sudah terbukti bekerja untuk Facport.
- **Reuse `checkTrialRowBudget` dengan tabel `conversion_logs` sebagai pengganti `import_batches`** — ditolak: `conversion_logs` self-reported (bisa dipalsukan client), memakainya sebagai HARD QUOTA menciptakan ilusi keamanan yang salah. Trial durasi-hari saja lebih honest tentang batasan teknis yang sebenarnya.
- **Migrasi 34 user sekarang** — ditunda (bukan ditolak permanen), keputusan eksplisit user demi tidak memperlambat pembangunan fitur inti.

## Konsekuensi

- `MODULE_CATEGORIES` bertambah 1 nilai ("Master Data") — konsumen (`groupItemsByCategory`, `/subscribe` catalog) harus tetap aman kalau kategori ini kosong di Produk lain (Facport/AutoProduksi tidak punya modul kategori ini, mengikuti kaidah "kosong = hilang" yang sudah ada).
- `apps/web` bundle bertambah dependency `xlsx` (mitigasi: dynamic import per-route, tidak masuk initial load).
- Sidebar clustering multi-Produk PERTAMA KALI benar-benar dites jalan (risiko: bug laten di `navGroupsFor()` filter yang selama ini cuma pernah dites dengan 1 productLine aktif).
- Tidak ada perubahan apa pun ke Produk Facport yang sudah live — Konverter aditif murni (tabel baru, kolom `MODULE_CATALOG` baru, tidak ada migrasi data existing).

## Referensi
- ADR yang diperluas: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`, `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`
- Architecture doc: `docs/architecture/architecture-konverter.md` (detail teknis lengkap 16 tipe + alur)
- Phase doc: `docs/phases/phase-150-arsitektur-konverter.md`
- Sumber app lama (di luar repo): `/Users/webane/sites/konverter` (`tool.html`, `akun.php`, `billing.php`, `lib.php`)
