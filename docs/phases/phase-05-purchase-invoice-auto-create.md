# Fase 05 — Purchase Invoice: Auto-create Vendor & Item

**Status:** Done
**Mulai:** 2026-08-20
**Selesai:** 2026-08-20

## Tujuan
Perluasan modul Import Faktur Pembelian (Fase 02) — sebelum ini, `vendorNo`
dan `itemNo` di Excel WAJIB sudah ada di Accurate, kalau belum ada baris itu
gagal. User minta: kalau Pemasok/Barang belum ada, buatkan otomatis
(termasuk field tambahan: kategori, telepon, WhatsApp, email, alamat,
negara, Akun Hutang untuk Pemasok baru), baru Fakturnya dibuat — 1 Excel =
transaksi + auto-lengkapi data master yang belum ada, tanpa perlu 2 langkah
terpisah (bikin master data dulu, baru import transaksi).

Scope diputuskan lewat 3 opsi yang ditawarkan ke user (perluas Purchase
Invoice / modul Setup Data Master terpisah / perluas Fase 04) — user pilih
**perluas Purchase Invoice** (Recommended saat itu).

## Scope
- [x] Field OPSIONAL baru di mapping Purchase Invoice: `vendorName`,
      `vendorCategoryName`, `vendorWorkPhone`, `vendorMobilePhone`,
      `vendorWhatsapp`, `vendorEmail`, `vendorAddress`, `vendorCountry`,
      `vendorPayableAccountNo`, `itemCategoryName` — SEMUA opsional,
      cuma dipakai kalau vendor/item BELUM ada (tidak pernah update yang
      sudah ada)
- [x] `lib/accurate-vendor.ts` — `findOrCreateVendor()` (lookup
      `vendor/list.do` by `vendorNo`, kalau tidak ketemu → `vendor/save.do`
      CREATE baru, `name` wajib diisi kalau memang mau create)
- [x] `lib/accurate-item.ts` (baru) — `findOrCreateItem()`, pola sama,
      `itemType` selalu `NON_INVENTORY` (default, tidak ada kolom Excel
      untuk ini — hindari kompleksitas stok/gudang)
- [x] Worker (`workers/index.ts`) — case `purchase_invoice` di
      `processImportRow()` sekarang panggil `findOrCreateVendor` →
      `findOrCreateItem` → `savePurchaseInvoice` berurutan, per baris
- [x] UI — field baru ditambah ke `ACCURATE_FIELDS` combobox halaman
      import (dengan label "...Baru" biar jelas kapan dipakai), deskripsi
      halaman diupdate
- [x] Scope Accurate: `item_save` ditambah PERMANEN ke modul `pembelian`
      (`item_view` sudah baseline) — konsekuensi rollout SAMA seperti
      Fase 04 (koneksi existing perlu re-authorize)

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Vendor (Data Master)", § 3 (Purchase Invoice)
- Fase sebelumnya yang di-reuse penuh: `docs/phases/phase-02-modul-pembelian-purchase-invoice.md`
- Field WhatsApp (`bbmPin`, nested `detailContact[]`) — temuan dari sesi
  eksplorasi field vendor sebelumnya, § Fase 04 doc

## Keputusan Kecil Selama Eksekusi
- WhatsApp (`bbmPin`) TIDAK bisa jadi field top-level vendor (API-nya
  nempel di `detailContact[]`, butuh `name` kontak) — belum ada kolom
  "Nama Kontak" terpisah di Excel, jadi dipakai NAMA VENDOR sebagai nama
  kontak default. Kalau nanti butuh kontak dengan nama beda dari vendor,
  perlu kolom tambahan (belum ada, dicatat di Known Limitations).
- `vendorPayableAccountNo` (Akun Hutang) awalnya HANYA dipakai saat vendor
  BARU dibuat (hindari "diam-diam ubah data existing", prinsip yang sama
  dari Fase 04). **Direvisi 2026-08-22 (keputusan eksplisit user)**:
  sekarang JUGA update akun hutang vendor yang SUDAH ADA — field lain
  (nama, kategori, telepon, email, WA, alamat, negara) TETAP create-only,
  cuma Akun Hutang yang dikecualikan (dianggap aman karena settingnya
  idempotent, beda dari field identitas vendor). Diverifikasi ulang via
  test call nyata: vendor "PT Uji Otomatis Delapan" (V.NEW08, sudah ada)
  di-update akun hutangnya dari `211.101-01` (IDR) → `211.101-02` (USD),
  field lain (nama/telepon/email) TERBUKTI tidak ikut berubah. Modul Fase
  04 (Import Akun Hutang Pemasok) TETAP ada — masih relevan buat update
  akun hutang TANPA perlu ikut bikin/sertakan transaksi Faktur Pembelian.
- `itemType` selalu `NON_INVENTORY` (bukan kolom Excel) — kalau user butuh
  item ber-stok (`INVENTORY`), tetap harus dibuat manual dulu di Accurate.
  Keputusan sengaja membatasi scope, bukan kelupaan.
- Ditemukan (lewat trial-error debugging test manual, BUKAN bug produk):
  akun Accurate "Retail Demo" butuh `branchName` (multi-cabang) DAN
  `billNumber`/"Bill No" (`useBillNumber: true` di setting akun) supaya
  Faktur Pembelian bisa disimpan — dua-duanya SUDAH jadi kolom opsional
  sejak Fase 02, cuma perlu diingatkan lagi karena gampang lupa saat susun
  Excel test. Dicatat di sini supaya tidak dikira bug baru di masa depan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web
- [x] Security review dijalankan (inline) — 0 temuan baru (perluasan
      fungsi dari endpoint yang sudah ada, dual-gate & ownership check
      tidak berubah, tidak ada input baru yang lewati validasi Elysia)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — tidak ada yang ditunda
- [x] `docs/PROGRESS.md` diupdate
- [x] Diverifikasi lewat browser sungguhan (Playwright) SAMPAI SUKSES
      PENUH: vendor baru + item baru + Faktur Pembelian tercipta dalam 1
      alur UI (bukan cuma test script terisolasi) — vendor "PT Uji
      Otomatis Delapan" (V.NEW08), item "Kursi Uji Delapan"
      (TEST-BRG-08), faktur id 102450, SEMUA field (WhatsApp, akun
      hutang, alamat, dll) dikonfirmasi tersimpan benar via cek API
      langsung setelahnya.
- [x] Test otomatis: 4 test baru untuk `extractVendorCreateFields`/
      `extractItemCreateFields` (pure function, termasuk kasus WhatsApp),
      49 test total di suite (tidak ada regresi)

## Known Limitations
- Kontak WhatsApp selalu pakai nama VENDOR sebagai nama kontak (belum ada
  kolom "Nama Kontak" terpisah di Excel untuk kasus vendor punya banyak
  kontak/PIC berbeda)
- `itemType` selalu `NON_INVENTORY` — item ber-stok (`INVENTORY`) tidak
  bisa dibuat lewat jalur auto-create ini
- ~~`vendorPayableAccountNo` cuma dipakai saat CREATE~~ — SUDAH DIPERBAIKI
  2026-08-22, lihat § "Keputusan Kecil" di atas
- Sama seperti Fase 04: koneksi Accurate EXISTING (connect sebelum fase
  ini di-deploy) perlu re-authorize manual untuk dapat scope `item_save`
  baru
- Auto-create menambah 2 API call ekstra per baris (cari/bikin vendor +
  cari/bikin item) di atas 1 call save faktur — total sampai 3 call per
  baris (dari sebelumnya cuma 1), mempengaruhi throughput terhadap rate
  limit 8/detik untuk file besar

## Ringkasan Hasil
Fitur berhasil dibangun dan diverifikasi end-to-end lewat browser
sungguhan. Proses debugging-nya sendiri jadi pelajaran berharga: 3
"kegagalan" pertama yang ditemui saat testing (`Satuan Barang terlalu
besar`, batch stuck `processing`, `No Faktur # harus diisi`) SEMUA
ternyata bukan bug di kode — dua di antaranya bug di skrip test sendiri
(kolom Excel bergeser karena array headers/row yang disusun manual tidak
sinkron; hot-reload worker mengganggu job yang sedang jalan saat file
sedang diedit), satu lagi validasi Accurate yang sah (`billNumber`
wajib karena setting akun `useBillNumber: true`) yang cuma lupa diisi di
Excel test. Setelah root cause masing-masing dipastikan (bukan
langsung disimpulkan sebagai "bug produk"), test ulang dengan data benar
langsung sukses. Pelajaran ini dicatat di `docs/lessons-learned.md`.

Verifikasi akhir: typecheck nol error (api+web), 49 test lolos (4 baru)
tanpa regresi, security review 0 temuan, alur penuh (vendor baru + item
baru + akun hutang + WhatsApp + faktur) dibuktikan jalan lewat browser
sungguhan dengan data terkonfirmasi tersimpan benar di Accurate.
