# Fase 218 — Hapus & arsip Data Usaha oleh pemilik

**Status:** Planned (menunggu persetujuan rencana)
**Mulai:** —
**Selesai:** —

## Tujuan
Pemilik dapat merapikan daftar di `/pilih-usaha`: Data Usaha kosong dihapus bersih, yang punya riwayat diarsipkan (bisa dipulihkan). Keputusan: ADR-0055. Rancangan: `docs/architecture/architecture-data-usaha-archive.md`.

## Scope
- [ ] Migrasi `data_usaha.archived_at`
- [ ] `lib/data-usaha-lifecycle.ts`: klasifikasi (delete/archive/blocked) dan penghalang; tes unit
- [ ] Endpoint lifecycle, delete, archive, restore, daftar terarsip (pemilik saja, transaksi + kunci baris, audit, laju)
- [ ] Pengecualian terarsip di `ownsDataUsaha`, `hasAccessToDataUsaha`, akses seat, default Data Usaha; cek semua pemakai
- [ ] Pesan `DATABASE_ALREADY_USED` mengarahkan ke Pulihkan
- [ ] UI `/pilih-usaha`: menu aksi, dialog, bagian Diarsipkan + Pulihkan; penanda di admin
- [ ] Tes rute + web; typecheck nol; audit keamanan; bersihkan DB dev; docs

## Di Luar Scope
Aksi admin atas nama pelanggan; purge otomatis arsip; hapus permanen yang punya riwayat; aksi massal.

## Keputusan yang Perlu Dikonfirmasi
1. Data Usaha kosong tetapi sudah terhubung Accurate (tanpa import): boleh dihapus (hanya pointer dibuang, koneksi akun tetap)?
2. User Tambahan aktif: menghalangi arsip (usulan), bukan ikut dicabut otomatis.
3. Arsip disimpan tanpa batas waktu.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error
- [ ] Security review dijalankan
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat di lessons-learned bila ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
Lihat `architecture-data-usaha-archive.md` § 8.

## Ringkasan Hasil (isi pas fase Done)
