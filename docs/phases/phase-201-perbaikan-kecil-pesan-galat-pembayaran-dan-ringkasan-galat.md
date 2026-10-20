# Fase 201 — Perbaikan kecil: pesan galat pembayaran dengan nomor faktur Excel + ringkasan galat di halaman hasil

**Status:** Done (2026-10-20, belum dirilis — sengaja ditahan atas permintaan user)
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20

## Tujuan
Dua temuan dari penyelidikan production 2026-10-19 (Purchase Payment): (1) pesan Accurate "Pembayaran faktur \"351-09061110\" melebihi nilai utang" menyebut faktur dengan nomor LAIN dari Excel (Excel: `PIN-2606-172`), sehingga pelanggan tidak bisa mencocokkan; (2) pelanggan mengunggah/Retry file yang sama ±5–20 kali pada galat yang tidak bisa pulih tanpa memperbaiki data (PPh ID salah teks; pembayaran melebihi sisa tagihan).

## Scope
- [x] `lib/payment-error-context.ts` `annotatePaymentFailure`: untuk galat "melebihi nilai utang/piutang" dan "tidak ditemukan atau sudah dihapus", pesan asli Accurate (tetap utuh di depan) ditambah daftar faktur MENURUT EXCEL (nomor + Payment; angka sama ditampilkan sekali, berbeda dijumlahkan; maks 15 + "dan N faktur lain"). Dipasang di loop Purchase Payment dan Sales Receipt (fallback akhir). Tanpa panggilan Accurate baru; galat lain tidak disentuh.
- [x] Ringkasan galat di halaman hasil (22 halaman per modul): `lib/import-error-summary.ts` (pengelompokan dengan normalisasi id/teks berkutip/angka; lampiran daftar faktur dipotong agar kelompok tetap satu; 5 kelompok teratas + sisa) + komponen `ImportErrorSummary` (jumlah baris, contoh pesan, saran bahasa awam, dan label aksi: "Perbaiki data dulu — Retry tanpa perbaikan akan gagal lagi" / "Periksa Accurate dulu" / "Boleh Retry"). Saran untuk: PPh tidak ditemukan, melebihi nilai utang/piutang, faktur tidak ditemukan, kolom wajib, timeout, batas request.
- [x] Panduan template Purchase Payment "PPh ID": teks harus sama persis dengan Deskripsi Master Pajak (bisa bahasa Inggris, mis. "Income Tax Art. 23 - 2%"; "Ps. 23" dengan spasi salah).
- [x] Tes: 7 (anotasi, memakai data nyata), 10 (pengelompokan/saran, pesan nyata production), 3 (komponen).

## Keputusan Kecil Selama Eksekusi
- Tidak memanggil `purchase-invoice/detail.do` untuk memetakan nomor Accurate → nomor Excel dan menampilkan sisa utang: butuh scope baca baru (pelanggan Perbarui Izin) dan bentuk respons belum terverifikasi — terlalu besar untuk "perbaikan kecil". Daftar faktur menurut Excel sudah cukup agar pelanggan mencocokkan sendiri; kandidat fase lanjutan.
- Ringkasan dihitung di klien dari baris yang SUDAH dimuat halaman (tanpa endpoint baru).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api + web)
- [x] Suite API 2491 & web 580 hijau; data uji dibersihkan
- [x] Security review inline: teks pesan dirender sebagai teks React (tanpa HTML mentah); tanpa endpoint/query/secret baru; data hanya dari baris milik batch yang sudah diotorisasi halaman itu
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Saran dipetakan dari pola teks pesan; galat tak dikenal tampil tanpa saran. Pola baru perlu ditambah di `ERROR_HINTS`.
- Pesan lama (sebelum rilis) tidak punya lampiran daftar faktur.

## Ringkasan Hasil
Pelanggan kini melihat daftar faktur menurut Excel di pesan galat pembayaran dan ringkasan galat per jenis dengan saran + penanda apakah Retry berguna.
