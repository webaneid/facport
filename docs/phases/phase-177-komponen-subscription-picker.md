# Fase 177 — Komponen SubscriptionPicker

**Status:** Done · **Mulai:** 2026-10-07 · **Selesai:** 2026-10-07 · ADR-0041

## Tujuan
Satu komponen reusable untuk memilih paket langganan: banyak fitur sekaligus (3, 4, 10+), filter per Produk, SATU periode (bulanan/tahunan) untuk semua, pratinjau tanggal+jam akhir yang akurat (WIB), mode Perpanjang. Dipakai di dialog Tambah User dan Kelola Langganan (/users); dirancang bisa dipakai ulang di app pelanggan.

## Scope
- [x] Logika murni `lib/subscription-picker.ts` (+16 tes): fitur→paket menurut periode, "tidak tersedia", filter/cari/hitung, pratinjau baru/perpanjang/ganti-trial, ringkasan, pruning saat ganti periode
- [x] Komponen `components/subscription/subscription-picker.tsx` (+7 tes): periode, chip Produk berhitung, pencarian, pilih semua hasil filter, daftar per Kategori, pratinjau per baris + ringkasan, `startsAt` exact/on-approval
- [x] API: `POST /admin/subscriptions/bulk` (atomik, satu `now`, `lib/admin-assign.ts` dipakai juga `POST /` — refactor tanpa ubah perilaku) + `GET /admin/users/:id/subscriptions` membawa `interval/isTrial/periodAnchorAt/periodMonths`
- [x] Dialog Tambah User: picker + jalur invoice (`on-approval`) / "sudah dibayar" (`exact`)
- [x] Dialog Kelola Langganan: pilih Data Usaha → picker (mode Perpanjang dari langganan aktif Data Usaha itu) → satu permintaan bulk; override tanggal+jam opsional untuk semua
- [x] Bersih-bersih kode mati yang digantikan: `lib/available-plans.ts` (+tes), helper lama `classify-plans` (`planOptionLabel`, `sortPlansByCatalog`, `filterPlansByProduct`, `countPlansByFilter`, `summarizeHiddenPlans`)
- [ ] DITUNDA: dipakai ulang di app pelanggan (/subscribe masih memakai kartu per-fitur + tombol Perpanjang Fase 176); seat lebih dari 1 per permintaan (Tambah User & bulk men-dedup paket yang sama)

## Keputusan Kecil Selama Eksekusi
- Paket per fitur+periode = termurah (deterministik) bila ada beberapa paket aktif yang sama; fitur tanpa paket di periode itu TIDAK diganti diam-diam.
- Dua paket modul sama dalam satu permintaan bulk ditolak (`DUPLICATE_MODULE_IN_REQUEST`); seat (tanpa modul) boleh.
- Override tanggal+jam di Kelola Langganan = mengganti (bukan memperpanjang) langganan aktif fitur yang sama — alur lama dipertahankan, ditulis di UI.
- Nama aksesibel checkbox memuat Produk (modul bernama sama di Facport & Konverter).
- Tambah User tidak punya override tanggal (hanya paket → periode); admin bisa mengubahnya setelah user dibuat.

## Ringkasan Hasil
API 2026 tes lulus (+8 bulk/riwayat), web 361 lulus (+23 picker), typecheck & lint bersih.

## Known Limitations
- Belum dilihat di browser (UI dialog baru). Daftar fitur di picker bisa panjang di layar kecil (area scroll 18rem). Migrasi 0042–0043 + endpoint bulk belum di production.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual): `POST /admin/subscriptions/bulk` digerbangi `subscriptions.manage`, body divalidasi (array UUID 1–60, `endAt` date-time), kepemilikan Data Usaha divalidasi, paket nonaktif/tidak ada ditolak, atomik dalam satu transaksi, tanpa raw SQL
- [x] Temuan Medium/Low dicatat bila ditunda (lihat di atas)
- [x] `docs/PROGRESS.md` diupdate
