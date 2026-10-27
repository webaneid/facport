# Fase 211 — Kebersihan data input Excel (spasi/karakter tak terlihat, lintas modul)

**Status:** Planned (2026-10-27; keputusan user: setuju rancangan 4 lapis)
**Mulai:** -
**Selesai:** -

## Tujuan
Menutup kelas bug "karakter tak terlihat/spasi membuat Accurate tidak mengenali data" untuk SEMUA modul, bukan per kolom.

## Scope
- [ ] Lapis 1: `lib/input-hygiene.ts` + dipakai di `parseExcelBuffer`, Retry (worker), simpan edit baris
- [ ] Lapis 4: pesan galat pencarian master menampakkan karakter (`visibleChars`)
- [ ] Lapis 2: perluas `normalizeAccurateNo` (NFKC, spasi ganda) ke field kunci semua modul
- [ ] Lapis 3: "Pemeriksaan Data" di Pratinjau (peringatan) + ringkasan "N sel dirapikan"
- [ ] Tes tiap lapis; dokumen ditutup

## Referensi
- `docs/architecture/architecture-input-hygiene.md`, `docs/decisions/adr-0052-kebersihan-data-input-excel.md`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Typecheck + lint nol error
- [ ] Test API/web, data uji dibersihkan
- [ ] Security review
- [ ] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Karakter terlihat (en dash, kutip lengkung, homoglif) hanya diperingatkan, tidak diperbaiki otomatis (ADR-0052).
