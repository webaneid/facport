# Fase 224 — Job Costing: pisahkan Penambahan Bahan Baku jadi modul sendiri

**Status:** Done sisi kode (2026-11-18, belum dirilis). DIPERSEMPIT atas keputusan user: HANYA hapus pembuatan otomatis Penambahan Bahan Baku dari Job Costing. Modul upload Penambahan Bahan Baku terpisah TIDAK dibuat (client mengerjakannya manual di Accurate); jadi fase berikutnya bila client meminta.
**Dicatat:** 2026-11-18

## Keluhan client (2026-11-18)
"Tim upload fitur pekerjaan pesanan, namun data masuk ke 2 fitur: pekerjaan pesanan dan penambahan bahan baku." Penjelasan lanjutan client: alur mereka = Pekerjaan Pesanan (JC) → Penambahan Bahan Baku → Penyelesaian (Roll Over), masing-masing langkah sendiri. Upload Pekerjaan Pesanan seharusnya CUKUP membuat Pekerjaan Pesanan.

## Diagnosis (terbukti dari kode, bukan dugaan)
`processJobCostingGroup` (`apps/api/src/workers/index.ts` ~baris 2343) SELALU menjalankan 2 panggilan per grup:
1. `saveJobOrder` → `job-order/save.do`; `detailItem[]`-nya diisi dari baris bahan baku (fix 2026-10-02, supaya tidak ditolak "Detail dari transaksi belum diisi!").
2. `saveMaterialAdjustment` → `material-adjustment/save.do` (ITEM_PICK) dari baris bahan baku yang SAMA, tanpa opsi menonaktifkan.
Akibat: 1 upload = 2 dokumen Accurate, dan bahan baku muncul di dua tempat. Asumsi "Penambahan Bahan Baku harus ikut otomatis" berasal dari desain Fase 136/139, BUKAN permintaan eksplisit client. Dokumen desain: `docs/architecture/architecture-job-costing.md` § "RESOLVED: 2 Endpoint".

## Keputusan user (2026-11-18)
**Opsi A**: Job Costing hanya mengirim Pekerjaan Pesanan; Penambahan Bahan Baku menjadi modul upload TERPISAH. (Opsi B = saklar di Job Costing, ditolak.) Tanya client dulu soal Excel sebelum eksekusi.

## Pertanyaan terbuka untuk client (BLOKIR eksekusi)
Kolom gudang & serial number di Excel Job Costing sekarang hanya terpakai oleh Penambahan Bahan Baku. Bila Job Costing berhenti membuatnya, kolom itu tak terpakai. Perlu dijawab:
1. Apakah client punya Excel terpisah untuk Penambahan Bahan Baku (nomor Pekerjaan Pesanan + barang + qty + gudang + serial), atau memakai file Excel yang sama dua kali?
2. Saat upload Pekerjaan Pesanan, apakah baris bahan baku tetap boleh tampil di dokumen Pekerjaan Pesanan (estimasi di `detailItem[]`), atau sebaiknya kosong? (Accurate menolak bila `detailItem` DAN `detailExpense` sama-sama kosong; jadi Excel tanpa biaya tambahan butuh bahan baku di `detailItem` agar lolos.)
3. Dokumen Penambahan Bahan Baku yang sudah terbuat otomatis di Accurate mereka: dihapus manual oleh mereka, atau minta dibantu?

## Draf pesan WhatsApp ke client
"Terima kasih infonya, Ust. Betul, saat ini upload Pekerjaan Pesanan di Facport otomatis ikut membuat dokumen Penambahan Bahan Baku. Kami akan pisahkan: upload Pekerjaan Pesanan hanya membuat Pekerjaan Pesanan, dan Penambahan Bahan Baku jadi menu upload sendiri. Supaya tepat, mohon info: (1) apakah tim punya file Excel terpisah untuk Penambahan Bahan Baku, atau memakai file yang sama dengan Pekerjaan Pesanan? (2) pada Pekerjaan Pesanan, apakah baris bahan baku tetap perlu tampil di dokumennya, atau dikosongkan? (3) dokumen Penambahan Bahan Baku yang sudah terlanjur terbuat, mau dihapus sendiri atau dibantu? Kami belum mengubah apa pun sampai ada jawaban."

## Rencana kasar (setelah jawaban client)
- [ ] Hapus panggilan `saveMaterialAdjustment` dari `processJobCostingGroup`; pertahankan `detailItem[]` Job Order sesuai jawaban #2.
- [ ] Modul baru "Penambahan Bahan Baku" (checklist registrasi modul: `architecture-accurate-integration.md` § 3b, jalankan diff-verification) + docs arsitektur + scope `material_adjustment_save` sudah ada di registri.
- [ ] Perhatikan batch Job Costing lama yang Retry: logika retry membaca `accurateTransactionId` (nomor Job Order) — pastikan Retry tidak lagi membuat Penambahan Bahan Baku.
- [ ] Jangan ubah bentuk/nomor dokumen client (lihat aturan "never alter customer documents"); uji nyata di akun Accurate dev (bebas dipakai), hapus dokumen uji setelahnya.
- [ ] Tes, typecheck, security review, `docs/lessons-learned.md`, ADR bila ada keputusan arsitektur (modul baru).
- [ ] Uji double-count: bahan baku di `detailItem` Job Order + Penambahan Bahan Baku — belum terbukti apakah Accurate menghitung dobel nilai.

## Hasil eksekusi (2026-11-18) — versi dipersempit
- `processJobCostingGroup` (`apps/api/src/workers/index.ts`) hanya memanggil `saveJobOrder`; `saveMaterialAdjustment` tidak lagi dipanggil. `detailItem[]` bahan baku tetap dikirim di Job Order (mencegah penolakan "Detail dari transaksi belum diisi!" untuk Excel tanpa biaya tambahan).
- Retry: baris lama yang sudah punya `accurateTransactionId` (Job Order sudah ada) tidak membuat Job Order baru, dan sekarang tidak membuat Penambahan Bahan Baku. Batch lama yang gagal di tahap bahan baku akan jadi sukses saat Retry tanpa membuatnya.
- Di luar kode: dokumen Penambahan Bahan Baku yang terlanjur dibuat otomatis di Accurate client harus dihapus client sendiri (stok mereka kelebihan keluar); Facport tidak mengubah dokumen pelanggan.
- Kolom gudang/serial di Excel Job Costing kini tak terpakai oleh Job Costing (tetap diterima, diteruskan ke `detailItem` Job Order bila ada).
- `saveMaterialAdjustment` di `lib/accurate-job-costing.ts` dibiarkan untuk modul Penambahan Bahan Baku kelak.
- Typecheck nol error; tes job-costing 40 lulus. 
## Uji nyata Accurate dev (2026-11-18) — database demo "Data Sample" (koneksi dev, scope hanya `job_order_save` + `material_adjustment_save`, tanpa view/delete)
- Payload dari `buildJobOrderPayload` (hanya bahan baku BENCH-INV1 qty 1, tanpa Expense, akun 110403) DITERIMA `job-order/save.do`: Job Order `JC.2026.11.00002` (id 100, status "Sedang diproses", ada `journalId`). Jalur tanpa Penambahan Bahan Baku valid.
- **TEMUAN KOREKSI:** `detailItem` Job Order BUKAN sekadar estimasi — saldo stok BENCH-INV1 turun 1 per Job Order (0 → -1 → -2, `item/detail.do` `balance`). Jadi Job Order itu sendiri sudah mengeluarkan stok bahan (1x); sebelum Fase 224 bahan yang sama dikeluarkan lagi oleh Penambahan Bahan Baku otomatis (2x). Setelah Fase 224 tinggal 1x dari Job Order. Apakah angka 1x ini sesuai alur akuntansi client (Job Order tanpa bahan lalu Penambahan Bahan Baku manual?) BELUM dikonfirmasi client — pertanyaan #2 (bahan baku tampil di Pekerjaan Pesanan atau dikosongkan) kembali terbuka dan bisa memengaruhi stok mereka.
- Tidak bisa diverifikasi lewat API: ada/tidaknya Penambahan Bahan Baku (scope `material_adjustment_view` tidak ada); hanya terbukti lewat kode bahwa panggilannya dihapus.
- Sisa uji di demo (tidak bisa dihapus lewat API, scope delete tidak ada): 2 Job Order uji (JC.2026.11.00001 dari percobaan pertama, JC.2026.11.00002), stok BENCH-INV1 -2. Hapus lewat UI Accurate bila perlu.
