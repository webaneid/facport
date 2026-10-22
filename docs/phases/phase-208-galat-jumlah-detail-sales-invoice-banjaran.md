# Fase 208 — Galat "Accurate mengembalikan N baris detail, padahal M dikirim" (Sales Invoice, client Banjaran)

**Status:** Planned — INVESTIGASI TERBUKA, menunggu balasan client (belum ada kode)
**Ditemukan:** 2026-10-21 (v2.43.0 di produksi)
**Selesai:** -

> **Baca ini kalau kamu melanjutkan topik "Banjaran" / galat 10-vs-9 baris.**
> Semua yang sudah diketahui, sudah dicoba, dan yang belum diketahui ada di sini.

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
