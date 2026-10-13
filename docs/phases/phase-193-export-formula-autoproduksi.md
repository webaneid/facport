# Fase 193 — Export Formula AutoProduksi + Status di Import

**Status:** Done
**Mulai:** 2026-10-13
**Selesai:** 2026-10-13

## Tujuan
1. Tombol **Export Excel** di List Formula: hasilnya berformat SAMA dengan template Import Formula sehingga bisa diimpor balik (cadangan/pemulihan bila terjadi sesuatu di sisi client).
2. Export punya pilihan **sertakan Formula nonaktif** (default: hanya aktif). Kolom **Status** (Aktif/Nonaktif) ikut diekspor dan **dibaca Import**, sehingga Formula nonaktif tetap nonaktif setelah diimpor balik.
3. Hapus total klaim "duplikat Nama Resep/Formula DIBOLEHKAN" (komentar & teks yang basi) — aturan sebenarnya: nama WAJIB unik per Data Usaha (sejak permintaan client 2026-10-09).

## Informasi arsitektur (hasil riset kode)
- Import: 1 baris = 1 item, dikelompokkan per "Nama Resep/Formula"; tepat 1 baris BJ + ≥1 baris BB; Akun Perantara & Unit Cost dibaca dari baris BJ (`autoproduksi-formula.mapping.ts`).
- Import tidak punya kolom ID dan tidak pernah menimpa — selalu Formula baru (UUID & nomor F-xxx baru). Karena itu ID/No. Formula di export **hanya referensi** (kolom "No. Formula" diabaikan Import).
- Tidak ikut (tercatat sebagai batasan): Nama Akun Perantara (hanya nomor tersimpan), riwayat Input Produksi (menunjuk UUID Formula lama).

## Scope
- [x] A1 `buildFormulaExportRows` (pure) + `GET /autoproduksi/formulas/export?includeInactive=` (permission `import.create`, `moduleAccess`, hanya Formula subscription sendiri, urutan: nomor Formula; BJ dulu lalu BB sesuai `sortOrder`) + tes.
- [x] A2 Import: field `status` (kolom "Status", opsional; Aktif/Nonaktif, kosong = Aktif, nilai asing = baris gagal) dari baris BJ → `isActive`; validasi baris/grup + template guide + tes.
- [x] A3 Hapus teks "duplikat DIBOLEHKAN" (route, halaman import web, mapping produksi, worker, template guide) → ganti keterangan sebenarnya.
- [x] W1 Tombol Export + pilihan "sertakan nonaktif" di List Formula (unduh berkredensial → blob, galat toast) + tes.
- [x] W2 Import web: label field "Status", dialog edit baris.
- [x] D1 `architecture-autoproduksi.md`, PROGRESS, lessons-learned bila ada temuan.

## Di luar scope
Import yang menimpa/memperbarui Formula via ID; memulihkan riwayat Input Produksi; nama Akun Perantara.

## Checklist Sebelum Ditutup
- [x] Typecheck nol; lint bersih
- [x] Tes API + web hijau (suite penuh); data uji dibersihkan
- [x] Security review (langsung di sesi utama, ≤8 file)
- [x] Dokumen diperbarui

## Known Limitations
- **UI belum dilihat di browser** (tombol/centang di List Formula, kolom Status di pemetaan import).
- Export tidak dipaginasi dan memuat item dengan satu `IN (...)`; wajar untuk ratusan Formula per Data Usaha, perlu dipecah bila mencapai puluhan ribu.
- Memulihkan dari export selalu membuat Formula baru (UUID/nomor F-xxx baru); riwayat Input Produksi lama tidak tersambung.
- Nama Akun Perantara tidak ikut export/import.
- Komentar `REQUIRED_INTERNAL_FIELDS` di `formula-import-edit-row-dialog.tsx` masih memuat `branchName` (sisa Fase 168) — di luar scope, tidak diubah.

## Ringkasan Hasil
Tombol **Export Excel** di List Formula (opsi sertakan nonaktif; default hanya aktif) menghasilkan xlsx berformat template Import + kolom Status + No. Formula; Import kini membaca Status (Formula nonaktif tetap nonaktif). Teks "duplikat dibolehkan" dihapus dari 6 tempat. Uji round-trip export→import lulus.
**Verifikasi:** typecheck + lint bersih; API 2.367 lulus; web 567 lulus; data uji dibersihkan.
**Security review:** 0 temuan Critical/High/Medium. Endpoint ber-izin `import.create` + `moduleAccess`, terbatas subscription pemanggil, query divalidasi skema, nama file tetap, `no-store`; sel xlsx bertipe teks (bukan rumus); header Data Usaha dari cookie divalidasi UUID.
