# ADR-0013: Batal Import — Hapus/Susutkan Faktur Pembelian di Accurate

**Status:** Accepted
**Tanggal:** 2026-08-28

## Context
Item ke-3 dari 3 feedback client pasca-presentasi 2026-08-27, sengaja
DITUNDA (lihat `docs/PROGRESS.md`) sampai Fase 06 (multi-item per faktur,
ADR-0011) dan Fase 08 (update faktur existing via Retry, ADR-0012) solid
— keduanya sekarang `Done` dan diverifikasi nyata.

Kebutuhan: tombol "Batal Import" di tabel Riwayat Import (dashboard +
halaman arsip baru), yang begitu diklik BENERAN menghapus/melepas
transaksi terkait dari Accurate Online (bukan cuma menyembunyikan record
lokal Facport) — user eksplisit membedakan ini dari sekadar "hapus file
import".

## Riset & Temuan Kunci
Dari dokumentasi resmi Accurate (`docs/referencehtml/Purchase Invoice
(Faktur Pembelian).html`, scope `purchase_invoice_delete`) DAN verifikasi
empiris nyata (bukan asumsi — test call langsung ke Data Usaha "PT Frozen
Food", buat 1 faktur test lalu hapus lagi dalam satu proses):

1. **`/delete.do` (`HTTP DELETE`) cuma terima SATU `id` per panggilan**
   (parameter `id`: Long, atau `number`: String sebagai alternatif) —
   BUKAN bulk/array. Method ini **menghapus SELURUH faktur** (semua
   `detailItem`-nya sekaligus) — tidak ada mode hapus sebagian item di
   level API ini.
2. **Dikonfirmasi via test nyata 2026-08-28**: create test invoice →
   `save.do` respons (`r`) **BENAR mengandung `detailItem[].id`** per
   item (`id: 351` untuk item yang baru dibuat, terpisah dari `id: 350`
   milik faktur itu sendiri) — sama seperti bentuk respons `detail.do`
   yang sudah dikonfirmasi Fase 08. Ini FONDASI: tanpa id per-item ini,
   tidak mungkin tahu item mana milik batch mana dalam faktur gabungan.
3. **Dikonfirmasi via test nyata**: `delete.do` sungguhan menghapus
   record (bukan soft-delete) — `detail.do` sesudahnya mengembalikan
   `{s: false, d: ["Faktur Pembelian tidak tepat"]}` (invoice benar-benar
   tidak ada lagi). Envelope respons `delete.do` sendiri `{s, d}` — TIDAK
   ada field `r` (beda dari `save.do`), sesuai pola `parseAccurateEnvelope`
   biasa.

## Masalah Inti: Faktur Gabungan Lintas-Batch (akibat Fase 08)
Sejak Fase 08, 1 faktur Accurate BISA berisi item dari BEBERAPA batch
import berbeda (Retry Cerdas meng-append item batch B ke faktur yang
sudah dibuat batch A). Kalau "Batal Import" batch A polos memanggil
`delete.do` ke faktur itu, item batch B ikut terhapus tanpa
sepengetahuan user manapun — **tidak boleh terjadi**, ini adalah risiko
data-loss nyata yang muncul LANGSUNG dari desain Fase 08 sendiri.

## Decision
1. **Hapus vs susutkan, ditentukan otomatis per faktur**: sebelum
   memutuskan, cek SEMUA baris (lintas batch, subscription sama) yang
   pernah tercatat terhubung ke faktur itu.
   - Kalau faktur itu 100% milik batch yang sedang dibatalkan → panggil
     `delete.do` (hapus faktur utuh).
   - Kalau faktur itu gabungan (ada baris dari batch lain) → panggil
     `save.do` mode UPDATE (mekanisme SAMA dengan Fase 08, arah
     kebalikan — kirim `detailItem[]` isi item yang DIPERTAHANKAN
     [referensi `id` saja, punya batch lain], TANPA item milik batch
     yang dibatalkan) — "menyusutkan" faktur, bukan menghapusnya.
2. **Baris lama (sebelum fitur ini ada) yang TIDAK punya id per-item
   tercatat → BLOKIR, jangan tebak.** Kalau ADA satu saja baris (batch
   manapun) yang terhubung ke faktur itu tanpa `accurateDetailItemId`
   tercatat, faktur itu TIDAK bisa dibatalkan otomatis — ditandai perlu
   penanganan manual di Accurate. Alternatif "cocokkan by nilai
   (itemNo+harga+qty)" DIPERTIMBANGKAN tapi DITOLAK — berisiko salah
   kalau ada baris lain yang kebetulan nilainya identik (keputusan
   eksplisit user: aman lebih penting dari cakupan).
3. **Tracking `accurateDetailItemId` per baris ditambahkan MULAI fase
   ini** (kolom baru `import_batch_rows.accurateDetailItemId`), diisi di
   jalur CREATE (Fase 06, dari `save.do` respons) dan jalur UPDATE (Fase
   08, dari `save.do` respons setelah append) — batch yang diproses
   SEBELUM fase ini tidak mendapat tracking ini secara retroaktif (kolom
   NULL untuk baris lama), konsisten dengan aturan blokir di atas.
4. **Record lokal (batch + baris) TIDAK dihapus fisik** — status
   ditandai `cancelled`/`cancelled_partial`, tetap tersimpan sebagai
   audit trail (kapan, siapa, faktur apa saja yang terdampak, via tabel
   `audit_logs` yang sudah ada).
5. **Konfirmasi UI: type-to-confirm** (user ketik ulang nama file batch
   sebelum tombol aktif) — bukan cuma dialog Ya/Tidak, karena ini
   destructive ke data akuntansi asli client (keputusan eksplisit user).
6. **Kegagalan per-faktur (mis. Accurate tolak karena faktur sudah
   dipakai/dibayar) tidak menggagalkan seluruh proses** — faktur lain
   dalam batch yang sama tetap diproses, faktur yang gagal dicatat &
   baris terkait TETAP `success` (tidak diubah), batch berakhir
   `cancelled_partial`. Pola sama dengan penanganan error per-grup yang
   sudah ada di `IMPORT_TO_ACCURATE`.

## Alternatif yang Dipertimbangkan
- **Selalu `delete.do` faktur utuh, terlepas gabungan atau tidak** —
  DITOLAK: berisiko nyata menghapus data batch lain tanpa
  sepengetahuannya, langsung bertentangan dengan tujuan produk (aman
  untuk data akuntansi asli client).
- **Best-effort match by value untuk baris lama** — DITOLAK (lihat
  Decision #2) — client secara eksplisit memilih aman di atas cakupan.
- **Hapus fisik record lokal setelah cancel berhasil** — DITOLAK: audit
  trail (siapa membatalkan apa, kapan) harus tetap ada permanen, sesuai
  catatan kebutuhan audit yang sudah ditulis sebelum fase ini di
  `docs/PROGRESS.md`.

## Konsekuensi
- **Positif**: aman terhadap risiko data-loss lintas-batch yang
  ditimbulkan Fase 08 — faktur gabungan ditangani dengan tepat (susutkan,
  bukan hapus buta).
- **Positif**: audit trail permanen, sesuai kebutuhan compliance/akuntansi.
- **Trade-off**: batch LAMA (sebelum fase ini) tidak bisa dibatalkan
  otomatis kalau ada ketidakpastian tracking item — perlu penanganan
  manual di Accurate untuk kasus itu, dikomunikasikan jelas ke user di UI
  (bukan disembunyikan).
- **Trade-off**: jalur CREATE & UPDATE (Fase 06/08) di worker perlu
  di-refactor dari update BULK per-grup jadi update PER-BARIS (supaya tiap
  baris dapat `accurateDetailItemId` masing-masing) — perubahan struktural
  kecil tapi menyentuh kode yang sudah stabil, WAJIB dijaga test regresi.

## Referensi
- ADR-0011 (Fase 06) — grouping multi-item, akar masalah faktur gabungan.
- ADR-0012 (Fase 08) — mekanisme update `save.do` via `id`+`detailItem[]`
  yang dipakai ulang (arah kebalikan) di fase ini.
- `docs/architecture/architecture-accurate-integration.md` § 3 — detail
  request/response nyata `delete.do` dan `save.do` (`detailItem[].id`).
- `docs/phases/phase-09-batal-import.md` — eksekusi.
