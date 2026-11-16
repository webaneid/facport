# Rencana — Evaluasi Client 16 Nov 2026 (Sheet "Catatan 16 Nov 26")

**Status:** RENCANA (belum ada kode). Keputusan 1–4 dijawab user 2026-11-17 (§ Keputusan).
**Sumber:** `docs/referencehtml/Catatan Aplikasi FAC V2.xlsx`, sheet 2 "Catatan 16 Nov 26" (5 butir, semua AutoProduksi, 3 butir bergambar). Sheet lain (Purchase Order … Delivery Order, 16 sheet) dibahas bertahap setelah sheet ini; sheet "Note" hanya tabel status modul (Panduan/Eksekusi/Cek/Paket), bukan permintaan.
**Nomor fase:** 219–222 (terakhir terpakai 218). Sheet berikutnya mulai 223.

## Ringkasan Butir → Fase

| # | Catatan client | Gambar | Fase |
|---|----------------|--------|------|
| 1 | Kolom Keterangan otomatis terisi nama produk jadi | Daftar Penyesuaian Persediaan: Keterangan masih "Input Dari AutoProduksi" (dikotak merah) | 219 |
| 2 | `Info Lainnya: Keterangan` tiap detail item ditulis Barang Jadi / Bahan Baku | Dialog Rincian Barang → tab Info Lainnya, Keterangan kosong | 219 |
| 3 | Riwayat Input Produksi bisa diunduh ke Excel, rentang 2 hari | Halaman Riwayat Input Produksi (10 baris/halaman, 2 halaman) | 221 |
| 4 | Formula boleh hanya Barang Jadi, tanpa Bahan Baku | — | 220 |
| 5 | Opsi memunculkan multi satuan di Barang Jadi/Bahan Baku | — | 222 |

## Temuan Kode (diverifikasi 2026-11-17)

- **Satu titik rakit payload:** `apps/api/src/lib/autoproduksi.ts` → `buildProductionEntryPayload()`. Dipakai Input Produksi (form) DAN Import Produksi (Excel), jadi butir 1–2 cukup diubah di sini. `description` kini literal `"Input Dari AutoProduksi"`; baris detail belum punya `detailNotes`.
- **`detailNotes` ada di spec resmi** `item-adjustment/save.do` (`accurate-openapi.json`) — kandidat kuat untuk "Info Lainnya: Keterangan" per baris. **Belum terbukti** bahwa field itu yang tampil di tab Info Lainnya, dan belum dicek apakah `saveInventoryAdjustment()` meneruskan field tak dikenal atau memakai daftar putih.
- **Larangan Bahan Baku kosong ada di 3 tempat:** rute `autoproduksi.route.ts:62` (`minItems: 1`), pemetaan Excel `autoproduksi-formula.mapping.ts:178` (`bbCount < 1`), dan form Formula (web). Skema DB tidak melarang (tabel item terpisah, tanpa constraint).
- **`finishedGoodItemName` boleh null** (kolom opsional; formula hasil Import Excel belum tentu mengisinya) — butir 1 perlu cadangan nama.
- **Multi satuan sudah dibangun sebagian** (Satuan ke-2..5, `UnitField` hanya menampilkan pilihan kalau barang punya >1 satuan), tetapi dokumen arsitektur mencatat nama field `unit2..5`/`ratio2..5` di `item/list.do` **belum pernah diverifikasi panggilan nyata**.
- **Riwayat:** `GET /autoproduksi/production-entries` (limit/offset, urut `createdAt` turun) tanpa filter tanggal. Pola ekspor Excel sudah ada (Fase 193, `autoproduksi-formula-export.ts`).

## Fase 219 — Keterangan Otomatis pada Penyesuaian Persediaan (butir 1 + 2)

**Tujuan:** dokumen di Accurate memuat nama produk jadi di Keterangan header dan label Barang Jadi/Bahan Baku di Keterangan tiap baris.

**Scope**
- [ ] Verifikasi nyata (akun uji `testesoperator`): kirim `detailNotes` ke `item-adjustment/save.do`, buka dokumen, pastikan muncul di Info Lainnya → Keterangan.
- [ ] `buildProductionEntryPayload()`: `description` = `Input Dari AutoProduksi - <nama produk jadi>` (cadangan nama: nama Formula bila `finishedGoodItemName` kosong; potong sesuai batas panjang Accurate); `detailNotes` = "Barang Jadi" / "Bahan Baku".
- [ ] Pastikan `saveInventoryAdjustment()` tidak membuang `detailNotes`.
- [ ] Perbarui tes unit payload (`autoproduksi.test.ts`) + `architecture-autoproduksi.md`.

**Di luar scope:** mengubah dokumen yang sudah terlanjur terkirim (aturan: dokumen pelanggan tidak boleh diubah — hanya dokumen baru yang berformat baru). Modul Inventory Adjustment umum tidak disentuh.

**Risiko:** rendah; perubahan murni di fungsi tanpa DB. Satu-satunya ketidakpastian adalah perilaku `detailNotes` di Accurate → ditutup langkah verifikasi pertama.

## Fase 220 — Formula Tanpa Bahan Baku (butir 4)

**Tujuan:** Formula berisi hanya Barang Jadi bisa dibuat (form + Import Excel), diproduksi, dan diekspor.

**Scope**
- [ ] Rute: `items` boleh kosong (`minItems` dicabut); form Formula: bagian Bahan Baku opsional.
- [ ] Import Formula: aturan "minimal 1 baris BB" dicabut; panduan template ikut diperbarui; Export (Fase 193) tetap round-trip.
- [ ] Penyesuaian Persediaan hanya berisi baris `ADJUSTMENT_IN` (payload otomatis benar, `detailItem` = 1 baris). **Uji nyata dulu:** kirim ADJUSTMENT_IN tanpa `unitCost` dan dengan `unitCost`, lihat perilaku Accurate (Harga Standar sudah ada sejak Fase 159 tetapi OPSIONAL; baru dikirim bila terisi). Wajib/tidaknya diputuskan dari hasil uji, bukan asumsi.
- [ ] Tampilan Formula/Input Produksi menangani daftar bahan kosong (mis. ringkasan "tanpa bahan baku").
- [ ] Tes: rute, mapping, payload; uji nyata ke Accurate (1 dokumen hanya Barang Jadi).

**Risiko:** sedang — perilaku bisnis baru (stok bertambah tanpa mengurangi bahan); perlu konfirmasi client (§ Keputusan 3). Formula lama tidak terpengaruh.

## Fase 221 — Unduh Riwayat Input Produksi ke Excel (butir 3)

**Tujuan:** pelanggan mengunduh Riwayat Input Produksi sebagai Excel untuk rentang tanggal terbatas.

**Scope**
- [ ] Filter tanggal pada `GET /autoproduksi/production-entries` (rentang, divalidasi `t.Object`).
- [ ] Endpoint ekspor Excel (kolom: Formula, Barang Jadi, Qty Produksi, Tanggal, Status, No. Transaksi Accurate, Galat, Waktu Dibuat — final sesudah § Keputusan 2) mengikuti pola Fase 193; ownership via subscription aktif; gate modul.
- [ ] Pilih tanggal sendiri, rentang maksimal 2 hari berdasarkan tanggal produksi (keputusan 2); tolak rentang lebih panjang dengan pesan jelas.
- [ ] UI di halaman Riwayat: pemilih rentang + tombol Unduh.
- [ ] Kewajiban "tugas berat lewat job queue": ekspor 2 hari kecil, dikerjakan sinkron dengan batas baris eksplisit; alasan dicatat di dokumen arsitektur (hindari pelanggaran diam-diam).
- [ ] Zona waktu: tanggal tampil mengikuti zona waktu perusahaan, penyimpanan tetap UTC.
- [ ] Tes rute + ekspor; jaga tidak ada injeksi formula Excel pada sel teks (galat Accurate berisi teks bebas).

**Risiko:** rendah–sedang (ekspor teks bebas → sanitasi sel; rentang/zona waktu).

## Fase 222 — Multi Satuan Barang Jadi/Bahan Baku (butir 5) — DIPERLAKUKAN SEBAGAI DUGAAN BUG

**Hasil riset kode (2026-11-17), tiga kemungkinan penyebab pilihan satuan tidak muncul:**
1. **Nama field baca belum terbukti.** Spec TULIS memakai `unit2Name`…`unit5Name` + `ratio2..5`; bentuk BACA `item/list.do` tidak ada di spec dan belum pernah diuji (pelajaran HOTFIX 2026-09-30: `unit1` ternyata objek `{id,name}`, bukan `unit1Name`).
2. **Kegagalan diam-diam.** `accurate-lookup.route.ts:112-118`: bila Accurate menolak permintaan field diperluas, kode mengulang dengan `unit1` saja lalu hanya `logger.warn`. Hasilnya pelanggan melihat kotak teks bebas tanpa tahu mengapa.
3. **Satuan hanya termuat saat mencari barang.** Di form Formula (`formulas/page.tsx:122-126`), daftar satuan diisi hanya dari hasil pencarian pada sesi itu. Saat membuka Formula tersimpan untuk diedit, `unitsByItemNo` kosong → kotak teks, bukan pilihan. Ini hampir pasti terlihat client sebagai "tidak muncul".

**Scope**
- [ ] Discovery nyata: `item/list.do` dan `item/detail.do` pada barang bersatuan ganda (akun uji/dev bila ada koneksi; kalau tidak ada barang multi-satuan, buat 1 di akun uji). Catat bentuk respons asli di arsitektur.
- [ ] Perbaiki `extractItemUnits`/daftar `fields` sesuai bentuk asli; tes dengan respons nyata (fixture).
- [ ] Muat satuan barang tersimpan saat Formula dibuka untuk edit (cari per `itemNo`), bukan hanya dari pencarian.
- [ ] Ganti kegagalan diam-diam: bila daftar satuan gagal dimuat, tampilkan petunjuk "daftar satuan tidak dapat dimuat — ketik manual" + log galat (bukan hanya warn).
- [ ] Jalur Excel: validasi satuan (Fase "Validasi satuan Formula terhadap master barang") tetap lolos untuk satuan ke-2..5.
- [ ] Bila setelah semua ini client masih menginginkan saklar tampil/sembunyi, itu fase tersendiri (tanya client).

**Risiko:** sedang — bergantung respons nyata Accurate; sisanya di sisi kami.

## Keputusan (dijawab user 2026-11-17)

1. **Keterangan header:** `Input Dari AutoProduksi - <nama produk jadi>` (contoh `Input Dari AutoProduksi - Bolu Kukus`). DISETUJUI.
2. **Rentang 2 hari:** saran diterima — pilih tanggal sendiri, maksimal 2 hari, berdasarkan tanggal produksi. DISETUJUI.
3. **Harga Standar:** sudah ada sejak Fase 159 sebagai opsional. Wajib/tidaknya untuk Formula tanpa bahan diputuskan dari uji nyata ke Accurate di Fase 220 (user: "kalau sebelumnya sudah ada, saya kira aman").
4. **Multi satuan:** user tidak tahu, minta riset; bila bug harus diperbaiki → Fase 222 diperlakukan sebagai dugaan bug (hasil riset di atas).

## Urutan & Rilis (usulan)

219 → 220 → 222 (discovery boleh paralel dengan 219) → 221. Satu rilis minor gabungan setelah semua selesai + diuji, atau dipecah 219+220 dulu — **rilis hanya atas permintaan eksplisit**. Tiap fase mengikuti SOP: typecheck nol → tinjauan keamanan → bersihkan data uji DB dev bersama → tutup fase → catat PROGRESS.

## Hasil Pemeriksaan Sheet Lain (2026-11-17)

Dibandingkan sel + hash gambar dengan panduan lama `docs/referencehtml/facport/developmen-15-september-2026.xlsx`:
- **14 dari 15 sheet modul IDENTIK** (Purchase Order, Receive Item, Purchase Return, Sales Quotation, Sales Return, Other Deposit, Sales Order, Item Requisition, Item Transfer, Inventory Adjustment, Job Costing, Roll Over, Work Order, Material Slip, Finished Good Slip) — itu panduan pemetaan kolom Excel → layar Accurate yang sudah menjadi dasar pembangunan modulnya, **bukan permintaan baru**.
- **Delivery Order berbeda** hanya karena kolom Atribut Tambahan (CLS 1–10, Custom Character/Number/Date detail item + header) — sudah dikerjakan di Fase 212 (v2.47.0).
- **Sheet "Note"**: kolom "Cek" kini terisi "Sudah" untuk Other Deposit, Journal Voucher, Work Order, Material Slip, Finished Good Slip (status verifikasi client).
- Satu-satunya sheet yang benar-benar baru: **"Catatan 16 Nov 26"** (Fase 219–222).
- Catatan kecil Purchase Order: judul kolom di panduan client `EXPENSE : Finance Category 1..10` (spasi sebelum titik dua) vs template kami `EXPENSE: Finance Category N`; pencocokan header kami hanya `trim` + huruf kecil, jadi file Excel BUATAN SENDIRI dengan ejaan spasi tidak otomatis terpetakan (template unduhan Facport aman; pemetaan manual di UI tetap bisa). Perbaikan opsional (toleransi spasi di sekitar `:`) menyentuh banyak rute — hanya bila client mengeluh.
