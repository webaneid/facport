# Fase 208 — Galat "Accurate mengembalikan N baris detail, padahal M dikirim" (Sales Invoice, client Banjaran)

**Status:** PENYEBAB TERBUKTI 2026-10-26 (client Tuparev) + pencegahan dikodekan (belum dirilis); pemulihan baris lama MENUNGGU keputusan (lihat "Update 2026-10-26")
**Ditemukan:** 2026-10-21 (v2.43.0 di produksi)
**Selesai:** -

> **Baca ini kalau kamu melanjutkan topik "Banjaran" / galat 10-vs-9 baris.**
> Semua yang sudah diketahui, sudah dicoba, dan yang belum diketahui ada di sini.

## Update 2026-10-26 — PENYEBAB TERBUKTI (client Tuparev, file `baris-gagal-Tuparev 30 (1).xlsx` + tangkapan layar Accurate)
Pesan galat yang SAMA muncul pada 3 faktur Tuparev (`Tiktok/Tuparev/3010-001/-002/-003`), dan faktur-fakturnya **tersimpan di Accurate**. Selisih jumlah baris
= jumlah item berkode **`PKT…`** (paket/grup) pada tiap faktur — bukan kebetulan:

| Faktur | Dikirim | Item `PKT…` | Kembali | Selisih |
|---|---|---|---|---|
| …3010-003 | 6 | 3 | 9 | +3 |
| …3010-001 | 8 | 4 | 12 | +4 |
| …3010-002 | 6 | 3 | 9 | +3 |

Tangkapan layar Accurate: tiap `PKT013`/`PKT018` diikuti baris OTOMATIS `--NP (BEST SELLER) …` (kode `NP0013`) / `--NP (SPECIAL PRICE) …` (`NP0018`) berharga 0, yang
tidak ada di Excel. Hipotesis #1 (item Barang Grup/Paket) **terbukti**; Banjaran (+1/+4/+3) konsisten dengan pola yang sama (belum dikonfirmasi dengan data Banjaran).

**Pencegahan (kode, 2026-10-26):** `alignSavedDetailItems` + `selectSavedDetailForMapping` (`lib/import-mapping/source-expansion.ts`), dipakai `processSalesInvoiceGroup`:
bila detail hasil `save.do` > yang dikirim, baca `detail.do` dan cocokkan tiap baris yang dikirim BERURUTAN berdasarkan kode item; baris sisa (tambahan Accurate) hanya
diterima bila kodenya TIDAK sama dengan baris yang dikirim. Tidak terbukti aman / gagal baca → tetap ditolak seperti sebelumnya. `mapDetailIdsToRows` TIDAK diubah.
Tes: 13 kasus baru di `source-expansion.test.ts` (termasuk kasus yang HARUS tetap ditolak).

**Pemulihan baris lama — "adopsi" (2026-10-26, dikodekan, belum dirilis):** Retry atau unggah ulang pada baris yang gagal karena galat ini → `save.do` menolak "Sudah ada data lain dengan <nomor>"
→ worker (`tryAdoptExistingSalesInvoice`) membaca faktur lewat nomor (`getSalesInvoiceByNumber`) dan `matchExistingSalesInvoice` (`lib/accurate-adopt-existing.ts`) menautkan baris HANYA bila SEMUA terpenuhi:
nomor sama; Customer sama; tiap baris file ketemu berurutan lewat kode item; kuantitas SAMA PERSIS dan harga sama (toleransi Rp1); baris tambahan ≤ jumlah baris file (mencegah file lain berisi sebagian item
dengan nomor yang sama dianggap "sudah ada"). Berhasil → baris **sukses** dengan keterangan "Sudah ada di Accurate — … sudah tersimpan pada percobaan sebelumnya dan tidak dibuat ulang…" (disimpan di `errorMessage` baris sukses,
dikenali UI lewat `ADOPTED_NOTE_PREFIX`); tidak cocok → gagal dengan pesan yang menjelaskan perbedaannya. Hanya MEMBACA Accurate. Dukungan UI: banner hijau "N faktur sudah ada di Accurate … bukan karena isi file" +
keterangan per baris (halaman detail Sales Invoice), petunjuk di Ringkasan Galat untuk pesan lama & baru (bukan kesalahan data, Retry aman). Pesan galat pemetaan juga diganti: "Faktur … SUDAH tersimpan di Accurate … bukan kesalahan data Anda".
Tes: `accurate-adopt-existing.test.ts` (12 kasus, termasuk 7 yang HARUS ditolak).

**Belum dikerjakan:**
1. Adopsi hanya untuk **Sales Invoice** (modul yang terbukti). Purchase Invoice dan modul lain belum diperiksa untuk item paket / galat serupa.
2. **Jalur "tambah ke faktur yang sudah ada"** (`appendToExistingSalesInvoice`) memakai `result.detailItem.slice(-newRows.length)` untuk id baris baru — diam-diam salah bila Accurate menyisipkan baris NP otomatis. Tidak merusak hapus faktur (hapus faktur utuh) tapi id tercatat keliru; dampak kecil, ditunda.
3. Verifikasi dengan Accurate asli (Tuparev/Banjaran) setelah rilis: Retry pada baris lama harus menjadi sukses dengan keterangan.

## Gejala
Pelanggan (file `banjaran 29.xlsx`, modul Sales Invoice, 118 baris, batch `a98b7ffa-a632-49c7-88b8-8c24a3e88d0b`, 2026-10-21 10:27 UTC)
melihat sebagian baris berstatus **Gagal**: *"Accurate mengembalikan 10 baris detail, padahal 9 dikirim — id baris tidak bisa dipetakan dengan aman."*

Hasil (diukur dari DB produksi):

| Faktur (nomor dari file) | Baris Excel | Dikirim | Dikembalikan Accurate | Selisih |
|---|---|---|---|---|
| Gofood/Banjaran/…-001 | 9 | 9 | 10 | +1 |
| TikTok/Banjaran/…-001 | 8 | 8 | 12 | +4 |
| TikTok/Banjaran/…-002 | 6 | 6 | 9 | +3 |

95 dari 118 baris sukses. 23 baris (3 faktur) gagal. *Catatan:* pesan galat sistem menulis `…/2810-001`, sedangkan `raw_data`
baris 29 menulis `Gofood/Banjaran/2910-001` — **belum dicocokkan** mana nomor yang benar (kemungkinan beda dokumen atau salah baca); cek langsung di DB/Accurate.

## Mekanisme (dari kode — pasti)
- Galat dilempar **SETELAH `save.do` Accurate berhasil**: `processSalesInvoiceGroup` (`apps/api/src/workers/index.ts` ±1080) memanggil
  `mapDetailIdsToRows` (`apps/api/src/lib/import-mapping/source-expansion.ts` ±158), yang SENGAJA menolak bila jumlah `detailItem` hasil
  `save.do` ≠ jumlah yang dikirim (salah-petakan id detail merusak guard hapus faktur — jangan diganti menjadi menebak).
- Akibatnya: **faktur kemungkinan besar SUDAH ADA di Accurate**, tetapi baris di DB berstatus `failed` tanpa `accurate_transaction_id`.
- Unggah ulang file yang sama (`banjaran 29 copy.xlsx`, batch `510d2a94-be78-489d-98a2-ac01b6b04008`, 10:30 UTC): 95 baris sukses
  (idempoten), 23 baris gagal dengan pesan lain: *"Sudah ada data lain dengan gofood/banjaran/…"* → mendukung bahwa dokumennya sudah ada.
- Cakupan: hanya batch ini. Query seluruh `import_batch_rows` (galat `like 'Accurate mengembalikan%baris detail%'`): 1 batch, 1 pengguna, 23 baris, tanggal 2026-10-21. Tidak ada pelanggan lain, tidak ada riwayat lebih lama.

## Yang BELUM diketahui — penyebab selisih
Baris Excel biasa: nomor transaksi sama, customer `GOFOOD`, item `C045` (Shopping Bag M), `G021` (Sweet Kokona Less Sugar), `A001` (Brownies Original);
tidak ada nomor dokumen sumber (jadi BUKAN perluasan DO/SO/SQ Fase 198). Kode tidak punya penanganan item paket/grup; item baru dibuat `NON_INVENTORY`.

Hipotesis (BELUM terbukti), urut kecurigaan:
1. Salah satu item adalah **Barang Grup/Paket** di Accurate yang diperluas menjadi baris komponen di respons `detailItem` (selisih +1/+4/+3 tidak seragam cocok dengan ini).
2. Accurate menambah baris otomatis lain (pajak/diskon/biaya) pada faktur.
3. Faktur dengan nomor sama sudah ada sebelumnya lalu tergabung (kurang cocok: selisih tidak seragam).

## Menunggu dari client (pesan sudah dikirim 2026-10-21 malam)
1. Buka salah satu dari 3 faktur di Accurate: apakah baris lebih banyak dari Excel? Baris tambahan mana & item apa? (tangkapan layar)
2. Tipe Barang master item `G021`, `C045`, `A001` (Persediaan / Non Persediaan / Jasa / **Barang Grup**)? (tangkapan layar)

## Larangan sampai penyebab jelas
- **Jangan minta pelanggan menekan Retry atau mengunggah ulang** file itu (hanya menghasilkan "Sudah ada data lain", dan mempersulit perapian).
- **Jangan melonggarkan `mapDetailIdsToRows`** menjadi sekadar "ambil N terakhir"/tebakan — merusak guard hapus faktur. Pemetaan harus terbukti aman.
- **Jangan mengubah dokumen pelanggan di Accurate** (aturan baku: hanya pengiriman yang boleh disesuaikan).

## Rencana setelah jawaban client (usulan, belum disetujui)
- Bila item Barang Grup: pemetaan id dengan **mencocokkan kode item secara berurutan** (baris komponen tambahan dilewati hanya bila terbukti milik item grup), bukan hanya menghitung jumlah; tes regresi dengan respons nyata.
- Cara **menautkan kembali 23 baris** ke faktur yang sudah ada di Accurate (isi `accurate_transaction_id` + `accurate_detail_item_id` dengan aman, SQL scoped dijalankan user, pola pemulihan seperti `docs/lessons-learned.md` 2026-10-09) — setelah perbaikan terpasang.
- Pertimbangkan log diagnostik: catat daftar `itemNo` dikirim vs dikembalikan saat jumlah tidak cocok (pola `source_doc_shape`, Fase 203), supaya kasus berikutnya langsung terlihat tanpa menebak.
- Setelah tuntas: entri `docs/lessons-learned.md`.

## Query diagnosis yang dipakai (baca-saja, dijalankan user di VPS via `docker compose … exec postgres psql`)
- Ringkasan batch SI 3 hari terakhir: `import_batch_rows` join `import_batches` (`module='sales_invoice'`), hitung total / galat `like 'Accurate mengembalikan%'` / `status='success'` per batch.
- Pesan galat per batch & rentang baris (`left(error_message,110)`, `min/max(row_number)`) untuk 2 batch di atas.
- Sampel `left(raw_data::text, 700)` baris 29–31 batch `a98b7ffa-…` (mengandung data pelanggan — jangan salin ke dokumen publik).

## Referensi
- `docs/phases/phase-198-sales-invoice-tarik-isi-dokumen-sumber.md` (asal `mapDetailIdsToRows`), `docs/architecture/architecture-sales-invoice.md`
- ADR-0031 (perlindungan duplikat), `docs/lessons-learned.md` 2026-10-09 (pola pemulihan baris)

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Penyebab selisih terbukti (data client / respons Accurate)
- [ ] Perbaikan pemetaan + tes regresi
- [ ] 23 baris Banjaran ditautkan / dipulihkan
- [ ] Type check nol error, security review
- [ ] Lessons-learned, `docs/PROGRESS.md` diupdate

## Ringkasan Hasil (isi pas fase Done)
