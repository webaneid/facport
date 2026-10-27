# Architecture — Kebersihan Data Input Excel (Fase 211)

Keputusan & alasan → `docs/decisions/adr-0052-kebersihan-data-input-excel.md`. Latar → Fase 210 (`docs/phases/phase-210-customer-no-spasi-ujung.md`).

## Titik pusat
| Lapis | Tempat | Catatan |
|---|---|---|
| 1 Karakter tak terlihat | `lib/excel.ts` `parseExcelBuffer` (semua route import) + helper bersama `lib/input-hygiene.ts` `cleanCell`/`cleanRawData` dipakai saat Retry (worker memuat baris) dan simpan edit baris (PUT rows/:rowId, ada di tiap route modul) | Satu helper, dipanggil dari titik pusat — bukan disalin per modul |
| 2 Kolom kunci | `normalizeKeyColumns(rawData, columnMapping)` di `lib/input-hygiene.ts`, dipanggil di titik muat baris worker (bersama lapis 1). `isKeyField(field)` menentukan field kunci dari NAMA field internal (akhiran No/Number/Code, nama master, `rmUnit`) dikurangi nomor milik dokumen sendiri | Modul BARU otomatis ikut bila field-nya mengikuti konvensi nama; nama field kunci yang menyimpang harus ditambahkan ke `EXTRA_KEY_FIELDS`, nomor milik dokumen ke `OWN_OR_FREE_NUMBER_FIELDS` (tes `isKeyField` menjaga ini) |
| 3 Peringatan | Langkah Pratinjau (web) + endpoint pratinjau API | Hanya peringatan, tidak mengubah data |
| 4 Pesan galat | helper `visibleChars(value)` dipakai di pesan galat pencarian master (customer/vendor/item/dst) | |

## Urutan eksekusi (Fase 211)
1. Lapis 1 + 4 (paling murah, dampak terbesar). 2. Lapis 2 (lebur Fase 210). 3. Lapis 3 + ringkasan "N sel dirapikan" di Pratinjau.

## Aturan uji
Tiap lapis: tes unit helper (spasi biasa, NBSP, zero-width, BOM, bidi, kontrol; nilai angka/tanggal tak berubah; teks bebas tidak dikolaps) + tes jalur (parse, Retry, edit baris).
