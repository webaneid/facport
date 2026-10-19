# Fase 196 — Penautan baris dokumen sumber otomatis (generalisasi "pengganti VLOOKUP")

**Status:** Planned — DITUNDA (2026-10-16) menunggu akses akun/database Accurate dari client (untuk Discovery uji nyata)
**Mulai:** -
**Selesai:** -

## Tujuan
Client bertanya (2026-10-16) apakah pengganti VLOOKUP sudah ada di Sales Order, Delivery Order, Sales Invoice, Purchase Order, Receive Item, Purchase Invoice. Saat ini **hanya Delivery Order ← Sales Order** (Fase 158/171). Fase ini membuktikan relasi lain mana yang benar-benar berisiko salah-tautan lalu menggeneralisasi resolver agar pengguna tidak perlu VLOOKUP/kolom ID baris manual. Rasional dan peta relasi: `docs/architecture/architecture-source-line-resolution.md`.

## Mode kerja
Besar dan berisiko (menyentuh jalur kirim ke Accurate, scope baru) → bertahap, DISCOVERY dulu (uji nyata di Accurate demo), baru implementasi per relasi; ADR-0049 ditulis SETELAH Discovery (field nyata, perilaku Accurate, keputusan scope).

## Scope
**Tahap A — Discovery (tanpa mengubah kode produksi)**
- [ ] A1 Matriks uji per relasi (8 baris di arsitektur § 3): di Retail Demo buat dokumen sumber dengan Item No kembar; kirim dokumen turunan (a) hanya nomor, (b) nomor + `<sumber>DetailId`; catat baris mana yang tertaut, apakah field tak-terdokumentasi diterima, dan bentuk respons `<sumber>/detail.do` (id baris, item.no, charField1, CLS).
- [ ] A2 Minta konfirmasi tertulis Accurate Support (nama field + perilaku) untuk relasi yang lolos A1.
- [ ] A3 Kumpulkan contoh data asli client per relasi (kolom pembeda baris kembar).
- [ ] A4 Putuskan relasi mana yang dibangun + tulis ADR-0049.
**Tahap B — Inti umum**
- [ ] B1 Registri relasi + `resolveSourceDetailId` + orkestrator umum; DO dimigrasikan ke inti umum; seluruh tes Fase 158/171 tetap hijau.
**Tahap C — Rollout per relasi** (urutan: Purchase Invoice ← Receive Item dulu; sisanya sesuai hasil A)
- [ ] C1 PI ← Receive Item (+ endpoint registry/scope, fetcher `receive-item/detail.do`, tes, panduan template, UI)
- [ ] C2..Cn relasi lain yang terbukti berisiko.
**Tahap D — Penutup**
- [ ] D1 Dokumen (arsitektur per modul, template guide), lessons-learned, security review, typecheck, suite penuh.

## Di luar scope
Mengubah cara pelanggan mengisi nomor dokumen sumber; "tarik isi dokumen sumber" (Fase 169/170) yang sudah ada; pecah-otomatis transaksi besar (Fase 195 tingkat 2).

## Temuan Discovery sementara (2026-10-16, read-only)
- Akun dev `kurikulum.fac@gmail.com` (Data Usaha "Webane Indonesia", db "Retail Demo" id 2905935): token masih aktif (kedaluwarsa 2026-10-21) TAPI `open-db.do` → "Data Usaha tidak tepat" dan `db-list.do` → kosong: **akun ini sudah tidak punya database** (trial habis/dihapus). Uji nyata (A1) belum bisa dijalankan. Tidak ada uji tulis yang dilakukan.
- Scope baca token dev: ada `sales_order_view`, `sales_quotation_view`, `sales_invoice_view`, `purchase_invoice_view`; **belum ada** `receive_item_view`, `purchase_order_view`, `delivery_order_view`, `purchase_requisition_view` (snapshot scope mengonfirmasi `GET <x>/detail.do` butuh scope itu). Artinya PI ← Receive Item (prioritas 1) butuh scope baru → pelanggan memperbarui izin Accurate setelah rilis.
- Spesifikasi resmi (`docs/referencehtml/accurate-openapi.json`) TIDAK memuat field `*DetailId` apa pun di `save.do`; hanya tautan via nomor.

## Cara melanjutkan (sesi berikutnya)
1. Butuh SALAH SATU/KEDUANYA: (A) database Accurate yang bisa dipakai uji (trial baru/milik FAC) dihubungkan lewat halaman Koneksi Accurate di Facport dev → baru jalankan matriks A1 (izin uji tulis di demo TETAP diminta eksplisit saat itu); (B) konfirmasi client/Accurate Support: nama field ID baris per relasi + perilaku saat Item No kembar.
2. Contoh file asli client per relasi + kolom pembeda baris kembar (Week/catatan/harga/qty), dan relasi mana yang paling sering terkena (prioritas).
3. Setelah itu: A4 (putuskan relasi + ADR-0049) → B (inti umum) → C (rollout, PI ← Receive Item dulu).

## Pertanyaan terbuka (jawaban diperlukan sebelum/selama Tahap A)
1. Izin menjalankan uji tulis di Accurate **Retail Demo** (membuat dokumen uji + dokumen turunan; bisa dihapus setelahnya)?
2. Dari enam fitur, mana yang paling sering memakai dokumen sumber dengan Item No kembar (prioritas)?
3. Contoh file/dokumen asli client per relasi dan kolom pembeda yang mereka pakai (Week, catatan, harga, qty?).
4. Siapa yang menghubungi Accurate Support (client atau kita) untuk konfirmasi nama field?

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error
- [ ] Security review
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
(isi saat Done)

## Ringkasan Hasil
(isi saat Done)
