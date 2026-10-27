# ADR-0052: Kebersihan data input Excel — otomatis hanya untuk yang tak terlihat/setara, yang terlihat cuma diperingatkan

**Status:** Accepted
**Tanggal:** 2026-10-27

## Context
Nilai sel Excel dipakai mentah-mentah sampai ke pencarian master dan payload Accurate. Spasi di ujung ("CUST IN "), NBSP, zero-width, atau karakter aneh hasil salin-tempel membuat Accurate tidak mengenali data yang sebenarnya ada (kasus nyata: Fase 210, 69 baris Sales Invoice gagal; sebelumnya header berspasi 2026-09-11). Menambal per kolom/per modul tidak berkesudahan (25 file mapping, 8 file pencarian master). Aturan produk: kita TIDAK berhak mengubah dokumen client (feedback "never alter customer documents").

## Decision
Empat lapis, satu titik pusat per lapis:
1. **Kebersihan karakter tak terlihat (otomatis, semua sel teks, saat unggah di `parseExcelBuffer`; juga saat Retry & simpan edit baris):** spasi Unicode aneh (NBSP, U+2000-200A, U+202F, U+205F, U+3000) -> spasi biasa; buang zero-width (U+200B-200D, U+2060), BOM (U+FEFF), soft hyphen (U+00AD), penanda arah bidi, karakter kontrol (kecuali tab/baris baru); pangkas ujung.
2. **Normalisasi kolom kunci (otomatis, saat membangun payload):** kode/nama master (customerNo, vendorNo, itemNo, akun, gudang, departemen, proyek, satuan, cabang, dst) — NFKC (huruf lebar penuh -> biasa) dan spasi ganda di tengah diringkas. Teks bebas (Description, Notes, nama barang baru) tidak disentuh selain lapis 1.
3. **Peringatan, BUKAN perbaikan otomatis, untuk karakter terlihat:** tanda hubung panjang, kutip lengkung, homoglif (mis. Cyrillic "С"), angka tersimpan sebagai teks, nol di depan hilang — tampil di Pratinjau sebagai "Pemeriksaan Data" sebelum kirim.
4. **Pesan galat menampakkan karakter:** nilai ditampilkan dengan penanda (`"CUST IN␠"`) + petunjuk.

Ringkasan "N sel dirapikan" ditampilkan ke user di Pratinjau (transparansi, bukan diam-diam).

## Alternatif yang Dipertimbangkan
- Tambal per kolom/modul — tidak berkesudahan, modul baru mengulang bug.
- Auto-koreksi juga karakter terlihat (en dash -> "-", dst) — bisa mengubah makna/dokumen client; dilanggar aturan produk. Hanya peringatan.
- Normalisasi di sisi pencarian saja — tidak membantu payload `save.do` dan pencocokan lain.

## Konsekuensi
- Kelas bug "spasi/karakter tak terlihat" hilang lintas SEMUA modul sekaligus.
- Isi dokumen client tidak berubah secara terlihat.
- Trade-off: karakter terlihat yang salah tetap butuh perbaikan user (hanya diperingatkan); lapis 1 mengubah `raw_data` baru (yang lama dirapikan saat Retry).
