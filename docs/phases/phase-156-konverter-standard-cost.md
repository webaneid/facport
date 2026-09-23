# Fase 156 — Konverter: Standard Cost (Master Data) — PENUTUP Seluruh 16 Varian

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port tipe TERAKHIR dari 16 Varian Konverter: `stdcost` (Update Harga Pokok Standar & Harga Jual, kategori
"Master Data"). SATU-SATUNYA tipe yang BUKAN transaksi (update data master barang existing) dan SATU-SATUNYA
yang pakai struktur `items` flat (bukan `order`/`groups` per dokumen seperti 15 tipe lain) — semua baris masuk
1 transaksi `MATERIALSTANDARDCOST` tunggal. Menyelesaikan SELURUH 16 Varian Konverter (Fase 151-156).

## Scope
- [x] `lib/converter/types/standard-cost.ts` — port VERBATIM `TYPES.stdcost` (`tool.html` 560-593)
- [x] 1 halaman baru + sidebar wiring (kategori Master Data PERTAMA punya isi, seluruh 16 Varian SELESAI)
- [x] **Fix regresi ditemukan saat porting**: `converterHasData()` (`converter-type.ts`) — mirror `hasData` legacy
      (`ctx.order.length||ctx.items.length`) yang TIDAK PERNAH diporting ke `ConverterTypeView` sejak Fase 151.
      Tanpa fix ini, upload file KOSONG (0 baris) akan lolos sebagai "0 error = valid" dan tombol Download aktif
      dengan XML envelope kosong — retroaktif memperbaiki celah ini untuk SEMUA 16 tipe sekaligus (bukan hanya
      `stdcost`), karena `ConverterTypeView` dipakai semua halaman.
- [x] Test: `standard-cost.test.ts` (XML exact-string-match + struktur `items` flat) + `converter-type.test.ts`
      baru (regression test `converterHasData` untuk KEDUA bentuk Ctx — `order`-based via `requisitionType`,
      `items`-based via `standardCostType`)
- [x] Typecheck + lint + test penuh

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase sebelumnya: `docs/phases/phase-155-konverter-sales.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 560-593 (`TYPES.stdcost`), 1409 (`hasData` di
  `render()` — sumber logic `converterHasData`)

## Keputusan Kecil Selama Eksekusi
- **Fix `converterHasData` diterapkan RETROAKTIF ke 15 tipe existing**, bukan cuma `stdcost` — karena diletakkan
  di `ConverterTypeView` (component generik dipakai SEMUA halaman `/konverter/{tipe}`), 1 perubahan menutup gap
  yang sama untuk seluruh 16 Varian sekaligus. Tidak perlu menyentuh 15 file `types/*.ts` yang sudah ada.
  Ditemukan justru karena `stdcost` PERTAMA yang pakai bentuk `items` (bukan `order`) — memaksa duck-typing
  eksplisit yang langsung mengekspos bahwa check ini belum pernah ada sama sekali sejak Fase 151.
- Icon sidebar baru `Tag` (lucide-react) untuk Standard Cost — kategori "Master Data" belum punya modul apa pun
  sebelumnya (baik di Facport maupun Konverter), jadi tidak ada icon yang bisa dipinjam.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak diulang penuh (1 tipe baru pure client logic + 1 fix di component generik yang
      sudah direview arsitekturnya Fase 151, tidak ada permukaan baru: `converterHasData` murni client-side,
      tidak menyentuh network/DB/auth sama sekali).
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada (fix `converterHasData` sendiri MENUTUP gap correctness, bukan menambah).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **SELURUH 16 Varian Konverter SELESAI diporting.** Produk siap untuk verifikasi manual end-to-end (upload
  Excel real dari client → bandingkan XML output dengan app lama untuk input yang SAMA) sebelum rilis — ini
  BELUM dilakukan di fase-fase 151-156 (semua verifikasi sejauh ini via unit test dengan fixture dari `examples`
  legacy, bukan file Excel asli dari `/Users/webane/sites/konverter` yang benar-benar dijalankan lewat app lama).
- Web Worker masih belum ada — 16 tipe transaksi sudah selesai TANPA pernah jadi masalah nyata (belum ada uji
  file besar ribuan baris), tapi belum divalidasi untuk kasus ekstrem.
- Migrasi 34 user app lama tetap di luar scope (keputusan user, ADR-0038 poin 9) — TIDAK berubah oleh selesainya
  porting ini.
- User menyebut belum bisa membuat Plan Konverter di halaman `/plans` (2026-09-23). Dicek cepat saat menutup
  fase ini: `app/admin/(protected)/plans/page.tsx` sudah GENERIK (radio pemilihan modul di-render dari
  `MODULE_GROUPS`/`MODULE_OPTIONS`, § `lib/module-options.ts`, yang otomatis include 16 modul Konverter sejak
  Fase 150) — TIDAK ada kode yang secara eksplisit menyaring keluar `productLine: "konverter"`. Kemungkinan
  besar cuma soal kode ini belum ter-deploy ke environment yang user pakai (semua commit Fase 150-156 baru
  masuk `develop` hari ini) — BUKAN bug baru. Tetap dicatat di sini supaya diverifikasi ulang setelah deploy
  sebelum dianggap tuntas.

## Ringkasan Hasil
Tipe TERAKHIR (`stdcost`, Master Data) diporting dengan fidelity terverifikasi (XML exact-string-match). SELURUH
16 Varian Konverter (Fase 151-156) SELESAI diporting: 15 tipe transaksi + 1 update data master, semua dengan
halaman UI, sidebar wiring, dan test lengkap. Ditemukan & diperbaiki 1 regresi generik (`converterHasData`,
gerbang "file kosong ≠ valid") yang menutup gap untuk seluruh 16 tipe sekaligus. 171 test lolos akumulatif di
`lib/converter/`. Suite penuh 1636 (api) + 268 (web) pass, 0 fail. typecheck+lint bersih. Siap lanjut ke
verifikasi manual end-to-end (bandingkan output riil dengan app lama) sebelum rilis — per instruksi eksplisit
user di awal rangkaian fase ini.
