# ADR-0011: Faktur Pembelian Multi-Item — Grouping Baris Excel via "Bill No"

**Status:** Accepted
**Tanggal:** 2026-08-28

## Context
Fase 02 (Purchase Invoice) sengaja di-scope MVP: **1 baris Excel = 1 Faktur
Pembelian dengan TEPAT 1 `detailItem`** — dicatat eksplisit sebagai Known
Limitation di `docs/phases/phase-02-modul-pembelian-purchase-invoice.md`,
bukan kelupaan. Client, lewat feedback pasca-presentasi 2026-08-27, minta
1 faktur bisa punya banyak item (kasus nyata: 1 faktur pembelian beli 3
jenis barang sekaligus).

Batasan ini BUKAN cuma keterbatasan fitur — dia aktif MERUSAK data kalau
dipaksa dipakai untuk kasus multi-item:
- Kalau user isi kolom **"Trans No"** (nomor faktur Accurate) sama persis
  di beberapa baris (mencoba menandai "baris-baris ini 1 faktur yang
  sama") → Accurate MENOLAK baris ke-2 dst dengan error nomor duplikat
  (persis yang terjadi di demo 2026-08-27: `"Sudah ada data lain dengan
  No Form # Faktur Pembelian ..."`).
- Kalau **"Trans No" dikosongkan** (default, auto-number) → Accurate JUSTRU
  tidak menolak, tapi membuat **N faktur terpisah** (silent wrong data —
  lebih berbahaya dari sekadar error, karena tidak ada tanda apa pun ke
  user bahwa hasilnya salah).

## Decision
Baris Excel dikelompokkan jadi 1 payload `save.do` (1 faktur, banyak
`detailItem`) berdasarkan kolom **"Bill No"** (field internal
`billNumber` — sudah ada di mapping sejak Fase 02, "nomor referensi
tagihan dari vendor").

Aturan grouping:
1. Baris dengan **"Bill No" sama** (dan trim+case-insensitive sama) di
   dalam 1 batch import → digabung jadi 1 faktur, `detailItem` diisi dari
   tiap baris dalam grup (urutan sesuai row number).
2. Baris dengan **"Bill No" kosong** → tetap dianggap 1 grup sendiri
   (grup isi 1 baris) — perilaku SAMA PERSIS dengan sebelum ADR ini,
   supaya user yang sudah biasa 1-baris-1-faktur (tanpa isi Bill No) TIDAK
   kena breaking change.
3. Field HEADER faktur (`transDate`, `vendorNo`, `branchName`,
   `description`, `currencyCode`, `paymentTermName`, `taxable`, dst) —
   diambil dari baris **PERTAMA** dalam grup. Baris lain dalam grup yang
   ngisi field header beda TIDAK dibaca ulang (bukan error, cuma
   diabaikan) — dianggap user cuma perlu isi field header itu di baris
   pertama grup.
4. **Validasi wajib sebelum kirim**: semua baris dalam 1 grup Bill No
   WAJIB punya `vendorNo` yang SAMA. Kalau beda → grup itu digagalkan
   SELURUHNYA (bukan proses sebagian), error jelas "Bill No X dipakai
   untuk vendor berbeda-beda, cek ulang Excel".
5. **Tracking hasil**: TIDAK ada kolom/tabel baru di `import_batch_rows`.
   Worker proses per-GRUP (bukan per-baris) — hasil (`accurateTransactionId`,
   `status`, `errorMessage`) dari 1 panggilan `save.do` grup itu
   di-apply ke **SEMUA baris `import_batch_rows`** dalam grup itu
   (nilai sama persis di semua baris anggota grup). User tetap lihat 1
   baris = 1 baris Excel asli (traceability row number tidak hilang),
   tapi baris-baris satu faktur akan tampil dengan
   `accurateTransactionId` yang SAMA, menandakan mereka "gabungan".

## Alternatif yang Dipertimbangkan
- **Kolom Excel baru khusus grouping** (mis. "No Urut Faktur", terpisah
  dari Bill No) — TIDAK dipilih: nambah 1 kolom lagi yang harus dipahami
  user, padahal "Bill No" (nomor faktur vendor asli) SECARA ALAMI sudah
  jadi identitas unik 1 dokumen faktur di dunia nyata — tidak ada
  informasi baru yang perlu diminta dari user.
- **Grouping berdasarkan "Trans No"** — TIDAK dipilih: field ini memang
  DIMAKSUDKAN dikosongkan (auto-number Accurate) di kasus normal, jadi
  tidak reliable jadi kunci grouping (kosong = tidak bisa dibedakan antar
  faktur).
- **Field baru `groupKey`/`invoiceGroupId` di `import_batch_rows`** —
  TIDAK dipilih (untuk sekarang): hasil grouping bisa diturunkan ulang
  dari `accurateTransactionId` yang sama tanpa kolom tambahan. Kalau nanti
  UI butuh tampilkan "3 baris digabung jadi 1 faktur" secara eksplisit
  sebelum submit (bukan cuma setelah hasil), field ini bisa ditambah
  belakangan — tidak blocking untuk versi pertama fitur ini.
- **Tetap `save.do` per-baris, gabungkan di sisi Accurate pakai endpoint
  lain (update/append item ke faktur yang sudah ada)** — TIDAK dipilih:
  `purchase-invoice/save.do` tidak punya mode "append item ke faktur
  existing" di schema resmi (§ architecture-accurate-integration.md § 3)
  — cuma create baru dengan `detailItem[]` lengkap dalam SATU panggilan.

## Konsekuensi
- **Positif**: kasus penggunaan client (faktur multi-item) langsung
  terselesaikan dengan kolom yang SUDAH ADA (Bill No), tidak perlu ubah
  format template Excel yang sudah didistribusikan.
- **Positif**: default behavior (Bill No kosong) sama persis dengan
  sebelumnya — non-breaking untuk user existing.
- **Trade-off**: worker JADI HARUS baca semua baris `pending`/`failed`
  DULU sebelum mulai proses (buat bentuk grup), bukan bisa langsung proses
  1 baris begitu ketemu seperti sekarang — perubahan struktur loop di
  `workers/index.ts`, bukan sekadar tambah parameter.
- **Trade-off**: retry per-baris (`import_batch_rows` retry individual)
  jadi tidak masuk akal lagi untuk baris yang bagian dari grup gagal —
  retry WAJIB retry SELURUH grup (semua baris dengan Bill No yang sama),
  bukan 1 baris saja. Perlu dipastikan endpoint retry existing menghormati
  ini (cek ulang saat implementasi, bukan asumsi otomatis benar).
- **Risiko diterima**: kalau user TIDAK SENGAJA isi Bill No sama untuk 2
  faktur yang sebenarnya beda (typo/copy-paste) → 2 faktur itu bakal
  DIGABUNG jadi 1 tanpa peringatan eksplisit sebelumnya (cuma pesan error
  vendor mismatch kalau vendor-nya kebetulan beda; kalau vendor SAMA,
  tidak ada sinyal apa pun). Mitigasi: UI konfirmasi mapping (langkah yang
  sudah ada) perlu ditambah preview "N baris akan digabung jadi M faktur"
  sebelum submit — dicatat sebagai scope di phase doc, bukan diabaikan.
