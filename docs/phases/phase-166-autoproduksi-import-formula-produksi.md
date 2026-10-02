# Fase 166 — AutoProduksi: Import Formula & Import Produksi (Excel)

**Status:** Done
**Mulai:** 2026-10-02
**Selesai:** 2026-10-02

## Tujuan
"Kirim Dengan Excel" — ditandai `Planned` sejak Fase 160 (GitHub #79).
Client kirim 2 file Excel nyata (`Autoproduksi_Formula Produksi.xlsx`,
`Autoproduksi_Barang Jadi.xlsx`) sebagai spesifikasi konkret. User minta
direncanakan matang dulu (Plan Mode) sebelum eksekusi, dengan syarat
eksplisit: tidak crash dengan flow manual yang sudah ada.

## Scope
- [x] Riset: bongkar 2 file Excel client (openpyxl, termasuk comment sel)
- [x] Riset: cek spec `item-adjustment/save.do` resmi untuk
      `projectNo`/`departmentName` (field baru ditemukan dari kolom Excel client)
- [x] Plan Mode — desain lengkap, 1 pertanyaan eksplisit ke user (perilaku
      duplikat Nama Resep/Formula)
- [x] Migrasi 0036 — `finishedGoodProjectNo`/`finishedGoodDepartmentName`
      (formulas), `projectNo`/`departmentName` (formula_items)
- [x] `lib/autoproduksi.ts` — wire field baru + fix bug lama (`standardCost`
      tidak pernah dikirim sebagai `unitCost`)
- [x] Import Formula — modul BARU `autoproduksi_formula`, SYNCHRONOUS
      (satu-satunya di Facport), tanpa Cancel
- [x] Import Produksi — reuse module key `autoproduksi_production`, ASYNC,
      reuse 100% `buildProductionEntryPayload`/`saveInventoryAdjustment`
- [x] Manual form (`formulas/page.tsx`) — parity 2 field baru
- [x] Sidebar, module-import-routes, import-batch-table, admin batch-view
- [x] Test: 2 mapping test file, 2 route test file (termasuk verifikasi
      DB nyata: Formula+Item tersimpan, retry tidak duplikat grup sukses)

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md` § "Import Formula & Import Produksi (Excel)"
- Plan file (arsip Plan Mode): `.claude/plans/wild-mixing-sedgewick.md` (lokal, tidak di-commit)

## Keputusan Kecil Selama Eksekusi
- **Duplikat Nama Resep/Formula DIBOLEHKAN** (ditanya eksplisit ke user,
  AskUserQuestion) — setiap grup valid selalu insert Formula baru, bukan
  update. Konsekuensi didesain eksplisit: Import Produksi menolak baris
  dengan nama Formula ganda (tidak menebak), retry Import Formula cuma
  proses ulang baris pending/failed (tidak reprocess grup yang sudah sukses).
- `autoproduksi_formula` SENGAJA TIDAK didaftarkan ke `module-catalog.ts`
  — bukan SKU terpisah (moduleAccess tetap `autoproduksi_production`),
  menghindari muncul sebagai opsi jual terpisah di dropdown admin/plans.
  Label tampilan lewat `MODULE_DISPLAY_LABEL_OVERRIDES` kecil di
  `module-import-routes.ts`, bukan duplikasi "daftar produk" (beda kelas
  masalah dari bug `requiresAccurate` hari ini — ini murni label kosmetik).
- Import Produksi reuse `import_batches.module = "autoproduksi_production"`
  (SAMA dengan moduleAccess) — key ini belum pernah dipakai `import_batches`
  sebelumnya (flow manual tidak lewat situ), jadi aman first-time registration.
- `standardCost` → `unitCost` di `buildProductionEntryPayload` adalah bug
  lama (Fase 159) yang ditemukan SAAT memetakan kolom "Unit Cost" Excel
  client — dibundel fix-nya di fase ini (terkait langsung, bukan scope creep).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api & web
- [x] Security review dijalankan — subagent `security-auditor`: 0
      Critical, 0 High, 1 Medium (varchar length — sudah diperbaiki
      sebelum laporan selesai), 1 Low BARU (gerbang multi-Data-Usaha
      path-matching — diperbaiki langsung), detail §
      `docs/lessons-learned.md` 2026-10-02 "Security review Fase 166"
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan kategori ini)
- [x] Temuan Medium/Low — KEDUANYA diperbaiki langsung (bukan ditunda)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Batal Import untuk Import Produksi sengaja belum ada (flow manual juga
  belum punya) — follow-up terpisah kalau diminta.
- Verifikasi end-to-end lewat browser TIDAK dilakukan sesi ini — dev
  server API (`localhost:3001`) tidak merespons saat dicoba (proses `bun
  run dev:api` ada tapi tidak bind port, kemungkinan crash sebelum sesi
  ini mulai) — tidak di-restart tanpa izin eksplisit karena berpotensi
  mengganggu sesi dev user yang sedang berjalan. Verifikasi mengandalkan
  test otomatis (unit function + route test yang BENERAN query Postgres
  dev, bukan mock) — upload 2 file Excel asli client lewat browser tetap
  disarankan sebagai langkah verifikasi terakhir sebelum deploy.

## Ringkasan Hasil
2 flow Excel baru untuk AutoProduksi: Import Formula (synchronous, tanpa
Accurate) dan Import Produksi (async, reuse 100% logic manual). 4 field
baru (`projectNo`/`departmentName` × 2 tabel) + fix bug `standardCost`
yang tidak pernah terkirim. Typecheck 0 error (api+web), lint bersih, API
test 1839 pass (+63 baru: 2 file mapping + 2 file route), web test 304
pass (0 fail). Dev DB dibersihkan via scratchpad cleanup script.
