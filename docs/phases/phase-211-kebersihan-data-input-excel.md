# Fase 211 — Kebersihan data input Excel (spasi/karakter tak terlihat, lintas modul)

**Status:** In Progress (lapis 1, 4, 2 selesai sisi kode; lapis 3 menunggu)
**Mulai:** 2026-10-27
**Selesai:** -

## Tujuan
Menutup kelas bug "karakter tak terlihat/spasi membuat Accurate tidak mengenali data" untuk SEMUA modul, bukan per kolom.

## Scope
- [x] Lapis 1: `lib/input-hygiene.ts` + dipakai di `parseExcelBuffer` dan titik muat baris job (Retry + kirim bertahap). Simpan edit baris TIDAK perlu: nilai yang disimpan dibersihkan lagi saat job memuatnya
- [x] Lapis 4: pesan "belum ada di Accurate" (customer/vendor/item) menyebut karakter non-ASCII + spasi ganda (`oddCharsHint`); `visibleChars`/`hygieneHint` tersedia untuk lapis 3
- [x] Lapis 2: `isKeyField` + `normalizeKeyColumns` (NFKC + ringkas spasi) di titik muat baris yang sama, berdasar `columnMapping` — tanpa menyentuh 25 file mapping; `normalizeAccurateNo` (Fase 210) kini memakai aturan yang sama
- [ ] Lapis 3: "Pemeriksaan Data" di Pratinjau (peringatan) + ringkasan "N sel dirapikan"
- [ ] Tes tiap lapis; dokumen ditutup

## Referensi
- `docs/architecture/architecture-input-hygiene.md`, `docs/decisions/adr-0052-kebersihan-data-input-excel.md`

## Keputusan Kecil Selama Eksekusi
- Titik pusat = satu tempat di worker (`workers/index.ts`, muat baris `pending|failed`) + `loadStagedFullGroups`. Pembersihan dilakukan saat DIMUAT (bukan hanya saat unggah) supaya baris lama dan hasil edit user ikut bersih.
- Field kunci ditentukan dari nama field internal: akhiran `No|Number|Code`, nama master (`department|dept|warehouse|branch|unit|paymentTerm|shipment|fob` + `Name`), dan `rmUnit`. DIKECUALIKAN: nomor milik dokumen sendiri/referensi bebas (`number`, `transNo`, `billNumber`, `poNumber`, `paymentNumber`, `receiptNumber`, `journalNumber`, `receiveNumber`, `pphNumber`, `taxNumber`, `chequeNo`, `itemSerialNo`, `serialNo`, `requisitionNo`). Diperiksa terhadap 240 field nyata (56 kunci).
- Risiko diterima: master Accurate yang namanya sengaja memuat spasi ganda tidak akan cocok lagi (dianggap jauh lebih jarang daripada spasi ganda tak sengaja di Excel).
- Karakter tak terlihat di file sumber ditulis sebagai escape (`\u00a0`), bukan literal — alat penulis file sempat mengubah escape menjadi karakter tak terlihat sungguhan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Typecheck + lint nol error
- [ ] Test API/web, data uji dibersihkan
- [ ] Security review
- [ ] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Karakter terlihat (en dash, kutip lengkung, homoglif) hanya diperingatkan, tidak diperbaiki otomatis (ADR-0052).
