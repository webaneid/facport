# ADR-0012: Retry Cerdas — Update Faktur Existing (Append Item) via `save.do`

**Status:** Accepted
**Tanggal:** 2026-08-28

## Context
Fase 06 (ADR-0011) menyelesaikan multi-item **untuk batch yang diproses
SETELAH fase itu deploy**. Batch LAMA (diproses sebelum Fase 06 ada) yang
sudah kadung menghasilkan 1 baris `success` (faktur tercipta, 1 item) + 1+
baris `failed` (ditolak Accurate sebagai "Sudah ada data lain dengan No
Form # Faktur Pembelian...", karena baris itu dulu dikirim sebagai faktur
BARU dengan nomor sama) **tidak ikut diperbaiki** — retry biasa cuma
mengambil baris `failed`/`pending`, meng-grup ulang, dan tetap mencoba
CREATE baru untuk grup itu, yang tetap ditolak Accurate dengan alasan yang
sama persis. Dikonfirmasi EMPIRIS: retry nyata terhadap batch `8b622538`
(akun `user1@fasport.com`) menghasilkan error identik pada baris 2/4/6.

Client menegaskan (2026-08-28) tujuan utama Facport adalah **memudahkan
import ribuan transaksi TANPA campur tangan manual** — kalau solusinya
"edit manual di Accurate tiap kali ketemu kasus begini", itu meniadakan
nilai produk untuk kasus yang menyangkut ratusan/ribuan faktur. Client
secara eksplisit meminta: **"tidak boleh kita yg bereskan [secara manual],
tentu harus melalui mesin yg kita bangun"** — perbaikan harus berupa fitur
di sistem, dipicu lewat tombol **Retry yang sudah ada** (bukan tombol
baru), bukan intervensi manual di data production.

ADR-0011 (§ Alternatif yang Dipertimbangkan) mencantumkan sebagai alasan
menolak pendekatan "append ke faktur existing": *"`purchase-invoice/save.do`
tidak punya mode 'append item ke faktur existing' di schema resmi — cuma
create baru dengan `detailItem[]` lengkap dalam SATU panggilan."* **Klaim
ini SALAH**, dan dikoreksi lewat riset+uji nyata di ADR ini (ADR-0011
sendiri TIDAK diedit — sudah "Accepted", sesuai konvensi immutability
project; koreksi didokumentasikan di sini).

## Riset & Bukti Empiris
Dites langsung (bukan asumsi/baca dokumentasi saja) terhadap faktur ASLI
di Data Usaha "PT Frozen Food" (akun `user1@fasport.com`, invoice
Accurate `#150`, hasil verifikasi Fase 06):

1. `GET /accurate/api/purchase-invoice/detail.do?id=150` → `detailItem`
   berisi **1 elemen** (`item.no: "100009"`).
2. `POST /accurate/api/purchase-invoice/save.do` dengan payload:
   ```json
   {
     "id": 150,
     "detailItem": [
       { "id": <id detailItem lama, dari langkah 1> },
       { "item": { "no": "100002" }, "unitPrice": ..., "quantity": ... }
     ]
   }
   ```
   (item lama direferensikan CUMA lewat `id`-nya, tanpa field lain; item
   baru dikirim tanpa `id`) → **BERHASIL**, tanpa field header lain
   (`vendorNo`, `transDate`, dst) ikut dikirim.
3. `GET detail.do?id=150` ULANG (fetch segar, bukan cache) → `detailItem`
   sekarang **2 elemen** — item lama (`100009`) TETAP ADA, item baru
   (`100002`) bertambah. Field header lain (vendor, tanggal, dst) TIDAK
   berubah.

**Kesimpulan**: `save.do` MENDUKUNG mode update/append kalau payload
menyertakan `id` di level faktur — bukan cuma create. Field yang tidak
disertakan dalam payload update dipertahankan apa adanya oleh Accurate;
`detailItem` yang dikirim ulang REPLACE seluruh array `detailItem` (bukan
merge otomatis), makanya item lama WAJIB direferensikan eksplisit lewat
`id`-nya kalau mau dipertahankan.

## Decision
Retry pada baris `failed` grup Purchase Invoice sekarang cerdas menentukan
CREATE vs UPDATE:

1. Sebelum memproses grup (hasil `groupPurchaseInvoiceRows`), cari apakah
   Bill No grup itu SUDAH PERNAH sukses jadi faktur di subscription yang
   sama (query lintas-batch ke `import_batch_rows`, bukan cuma batch
   sekarang — kasus nyata: baris sukses ada di batch LAMA, baris gagal
   coba diperbaiki lewat retry di batch itu juga, tapi mekanismenya harus
   general untuk kasus lintas-batch mana pun).
2. **Ketemu** → jalur UPDATE: ambil detail faktur existing
   (`detail.do`), **safety check vendor** (`detail.vendor.no` HARUS sama
   dengan `vendorNo` grup — kalau beda, gagal dengan pesan jelas, JANGAN
   append ke faktur vendor lain walau Bill No kebetulan sama), lalu
   **duplicate-guard** per item (skip item yang sudah identik persis
   `itemNo`+`unitPrice`+`quantity` di faktur existing — mencegah dobel
   kalau retry diklik berkali-kali atau item itu memang sudah pernah
   ke-append). Item yang genuinely baru di-`save.do` dengan
   `id`+`detailItem[]` (existing direferensikan via `id`, baru tanpa
   `id`).
3. **Tidak ketemu** → jalur CREATE seperti sebelumnya (Fase 06, tidak
   berubah).
4. Trigger TETAP tombol **Retry existing** — tidak ada tombol/endpoint
   baru. Endpoint retry sendiri tidak berubah (sama seperti temuan Fase
   06: logic pintar cukup ditaruh di worker, bukan di endpoint).

## Alternatif yang Dipertimbangkan
- **Tombol baru "Perbaiki Faktur"/"Update"** — TIDAK dipilih, sesuai
  instruksi eksplisit user: Retry yang familiar harus jadi pintar
  otomatis, user tidak perlu belajar tombol baru atau memutuskan sendiri
  create-vs-update.
- **Selalu tanya konfirmasi user sebelum update (bukan otomatis)** —
  TIDAK dipilih untuk versi pertama: safety check vendor-match +
  duplicate-guard dianggap cukup untuk mencegah kesalahan tanpa gesekan
  UX tambahan; bisa direvisit kalau ada insiden nyata.
- **Hapus dulu faktur lama, create ulang gabungan (bukan append)** —
  TIDAK dipilih: faktur yang sudah tercipta bisa sudah "dipakai" di
  Accurate (dibayar/direferensikan transaksi lain — lihat catatan
  "Batal Import" di `docs/PROGRESS.md`), `delete.do` kemungkinan besar
  ditolak; append jauh lebih aman (tidak pernah menghapus data yang sudah
  ada).

## Konsekuensi
- **Positif**: retry existing/lama SEKARANG bisa memperbaiki kasus
  duplikat-invoice tanpa intervensi manual — sejalan dengan tujuan produk
  (skala ribuan transaksi).
- **Positif**: tidak ada perubahan UI wajib, tidak ada endpoint/tombol
  baru — perubahan murni di worker.
- **Trade-off**: pencarian "apakah Bill No ini sudah sukses" HARUS
  lintas-batch (bukan cuma dalam batch yang sama), nambah 1 query per
  grup sebelum proses.
- **Trade-off**: `detailItem` di-REPLACE (bukan merge) tiap kali update —
  worker WAJIB selalu fetch detail terbaru dulu (`detail.do`) sebelum
  susun payload update, TIDAK BOLEH asumsi state lama dari cache/DB lokal
  (DB lokal Facport tidak menyimpan struktur `detailItem` faktur Accurate
  sama sekali).
- **Risiko diterima**: kalau vendor DIUBAH manual di Accurate langsung
  (di luar Facport) antara faktur dibuat dan retry di-klik, safety check
  vendor-match akan menolak retry (fail-safe, bukan fail-silent) —
  dianggap perilaku benar (lebih aman gagal jelas daripada salah append).

## Referensi
- ADR-0011 (Fase 06) — grouping berbasis Bill No, klaim yang dikoreksi ADR ini.
- `docs/architecture/architecture-accurate-integration.md` § 3 — detail
  request/response nyata `save.do` mode update.
- `docs/phases/phase-08-purchase-invoice-update-existing.md` — eksekusi.
- Insiden nyata: batch `8b622538`, baris 2/4/6, akun `user1@fasport.com`,
  Data Usaha "PT Frozen Food", faktur Accurate `#150`.
