# Fase 222 — Multi satuan Barang Jadi/Bahan Baku (keandalan)

**Status:** Done sisi kode 2026-11-17 (belum commit/rilis); format field Accurate terverifikasi nyata
**Rencana induk:** `docs/phases/evaluasi-client-2026-11-16-rencana.md` (butir 5)

## Temuan discovery (akun uji dev, barang uji 3 satuan dibuat lalu dihapus)
- Dugaan 1 (nama field baca salah) **TERBANTAH**: `unit2/unit3` objek nested, `ratio2/ratio3` angka — `extractItemUnits` sudah benar (ditambah tes dengan respons nyata).
- Dugaan 2 (gagal diam-diam) **TERBUKTI di kode**: fallback ke `unit1` hanya `logger.warn`.
- Dugaan 3 (satuan tersimpan tidak termuat) **SEBAGIAN**: sudah ada pemuatan saat edit, tetapi lewat pencarian kata kunci per-barang (meleset/halaman pertama/429) dan gagal diam-diam.
- Penemuan: `filter.no.op=EQUAL` + beberapa `filter.no.val[n]` mengambil banyak barang per kode dalam 1 panggilan.

## Scope
- [x] `parseItemNos` + `GET /accurate/items/units` (auth, Data Usaha dicek, batas 20 kode, tes guard)
- [x] `GET /accurate/items/search`: `unitsLoaded` eksplisit
- [x] Form Formula: muat satuan tersimpan per kode (1 panggilan); petunjuk jelas saat daftar tidak dapat dimuat
- [x] Tes: respons nyata, `parseItemNos`, guard rute; typecheck api+web nol; eslint halaman lulus; data uji dev dibersihkan
- [ ] Verifikasi visual di browser (pilihan satuan muncul saat edit Formula berbarang multi-satuan) + konfirmasi client bahwa keluhan teratasi
- [ ] Bila client masih menginginkan saklar tampil/sembunyi satuan → fase tersendiri (tanya client apa maksud "opsi")

## Keamanan
Rute baru di belakang `auth: true`, Data Usaha dicek kepemilikan/akses (`resolveDataUsahaOrError`), input divalidasi skema + `parseItemNos` (maks 20 kode, 100 karakter), diteruskan sebagai parameter query ter-encode (`URLSearchParams`), lewat pembatas laju Accurate.
