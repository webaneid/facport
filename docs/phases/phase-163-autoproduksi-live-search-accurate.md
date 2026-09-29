# Fase 163 — AutoProduksi: Live-Search Accurate (Item/Bahan Baku/Akun Perantara)

**Status:** Done (test call nyata menyusul post-deploy, § Known Limitations)
**Mulai:** 2026-09-29
**Selesai:** 2026-09-29

## Tujuan
Bagian 2 dari evaluasi client AutoProduksi (Bagian 1 = Fase 162, quick-win
UI). Poin #1/#2/#3: search-as-you-type ke Accurate langsung dari form
Formula (Barang Jadi, Bahan Baku, Akun Perantara), autofill kode+satuan+nama
begitu dipilih. Pola PERTAMA di Facport — panggilan Accurate SINKRON dari
HTTP route (bukan job worker), sengaja ditunda sampai Fase 162 selesai &
ditutup rapi (SOP "bertahap").

Rencana lengkap (Plan Mode, disetujui user 2026-09-29): `.claude/plans/ancient-floating-glacier.md`.

## Scope
- [x] ADR baru: `docs/decisions/adr-0039-live-search-accurate-dari-route.md`
- [x] Migration: `autoproduksiFormulas.finishedGoodItemName`/`adjustmentAccountName`, `autoproduksiFormulaItems.itemName` (`0035_right_madame_masque.sql`)
- [x] Endpoint baru `GET /accurate/items/search`, `GET /accurate/glaccounts/search` (`accurate-lookup.route.ts`) + daftar `GET glaccount/list.do` di `accurate-endpoint-registry.ts` (rate limit reuse `/accurate` prefix yang sudah ada)
- [x] Frontend: `Combobox` (reuse komponen yang sudah ada, TIDAK diubah) ganti 3 `<Input>` di Formula form + fungsi murni `lib/accurate-combobox-options.ts` (testable)
- [ ] **Test call NYATA ke Accurate sandbox — DITUNDA ke post-deploy** (§ Known Limitations, keputusan eksplisit user 2026-09-29: rilis dulu, verifikasi pakai akun Webane Indonesia/Retail Demo yang sudah terhubung di production, bukan di sesi ini — tidak ada kredensial sandbox nyata di dev lokal)
- [x] Security review (skill `security-review`) — 0 temuan
- [ ] Browser-test manual end-to-end — SEBAGIAN (guard/error path ditest otomatis; alur search→pilih→autofill NYATA baru bisa dites setelah test call nyata di atas, sama alasan)
- [x] Docs + `docs/PROGRESS.md` status Done (dengan catatan di atas)

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md`
- Rencana lengkap (Plan Mode): `.claude/plans/ancient-floating-glacier.md`
- Fase sebelumnya (Bagian 1): `docs/phases/phase-162-autoproduksi-quick-win-formulas-ui.md`

## Keputusan Kecil Selama Eksekusi
- **`item/list.do` dipakai untuk Barang Jadi MAUPUN Bahan Baku** (endpoint
  sama, "Item" di Accurate mencakup keduanya) — 1 fungsi
  `searchAccurateItems()`/`itemComboboxOptions()` dipakai ulang di 2
  konteks form, bukan 2 fungsi terpisah.
- **Endpoint search dirancang generic** (`/accurate/items/search`, bukan
  `/autoproduksi/accurate/items/search`) — reusable modul form-based lain
  di masa depan, TIDAK terikat `moduleAccess` 1 modul, cukup cek
  ownership/seat Data Usaha (§ ADR-0039).
- **Satuan jadi `disabled` (bukan dihapus)** — tetap ditampilkan biar user
  lihat hasil autofill, tapi tidak bisa diketik manual lagi (mencegah
  satuan tidak sinkron dengan Barang/Bahan Baku yang dipilih).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web 0 error
- [x] Lint bersih (`bun run lint`)
- [x] Test: api 1719 pass/0 fail (+7 baru), web 304 pass/0 fail (+5 baru)
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Test call nyata ke Accurate sandbox BELUM dilakukan** — ditunda
  eksplisit ke post-deploy (keputusan user 2026-09-29: rilis dulu karena
  perubahan read-only + additive, verifikasi pakai akun Webane Indonesia
  nyata di production, bukan tunggu kredensial sandbox di dev lokal).
  Mapping field respons (`no`/`name`/`unit.name`) di `accurate-lookup.route.ts`
  masih ASUMSI dari OpenAPI spec (yang TIDAK punya contoh body respons sama
  sekali) — kalau field aslinya beda, perbaikannya cuma ubah mapping di 1
  fungsi (`fetchAccurateList` mapper), TIDAK ada perubahan skema/kontrak
  lain yang bergantung padanya.
- Harga Beli bahan baku otomatis dari Accurate — masih di luar scope (§
  architecture-autoproduksi.md).

## Ringkasan Hasil
Form Formula AutoProduksi sekarang pakai live-search Accurate (bukan ketik
manual) untuk Barang Jadi, Bahan Baku, dan Akun Perantara — kode+satuan+nama
otomatis terisi begitu dipilih dari `Combobox` (komponen yang sudah ada,
TIDAK diubah). Ini pola PERTAMA di Facport yang panggil Accurate SINKRON
dari HTTP route (bukan job worker), didokumentasikan sebagai ADR-0039 —
dibatasi READ-ONLY murni (search, tidak pernah menulis), dengan timeout +
rate limit (reuse limiter `/accurate` yang sudah ada).

2 endpoint baru (`GET /accurate/items/search`, `GET /accurate/glaccounts/search`),
1 migration additive (3 kolom nama nullable), 1 file frontend diperbarui.
Guard IDOR (ownership Data Usaha dari header `X-Data-Usaha-Id`) divalidasi
SEBELUM kode sempat menyentuh Accurate — dites otomatis (7 test baru, semua
jalur error: tanpa login, tanpa header, header bukan UUID, Data Usaha bukan
milik user, belum connect Accurate, database belum dipilih, query kosong).

**Test call nyata ke Accurate sandbox DITUNDA ke post-deploy** (keputusan
eksplisit user) — perubahan dinilai aman untuk dirilis dulu (read-only,
additive) baru diverifikasi pakai akun asli di production, alih-alih
menunggu kredensial sandbox yang tidak tersedia di sesi ini.

Typecheck 0 error (api+web), lint bersih, test api 1719 pass + web 304
pass/0 fail. Security review: 0 temuan.
