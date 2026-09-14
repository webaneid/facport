# Fase 117 — Peta Struktur Produk: Facport sebagai Super-App (Facport + Konverter + AutoProduksi)

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
Client FAC Institute ingin menggabung 3 produk terpisah (Facport, Konverter,
AutoProduksi) jadi 1 aplikasi bernama Facport, dengan satu pintu pendaftaran
dan satu jalur transaksi/billing. Fase ini MEMETAKAN struktur arsitektur yang
dibutuhkan (ADR + dokumentasi + scaffolding schema/katalog ringan, non-breaking)
SEBELUM lanjut membangun modul-modul lain dari 21 modul katalog Facport
(6 sudah dikerjakan) atau mulai membangun Konverter/AutoProduksi sungguhan —
permintaan eksplisit user supaya fondasi taksonomi produk benar dari awal,
bukan ditambal belakangan setelah puluhan modul baru ditambahkan.

## Scope
- [x] ADR baru `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`
- [x] Architecture doc baru `docs/architecture/architecture-product-lines.md`
- [x] Update `docs/glossary.md` (Brand/Produk/Varian, disambiguasi "Modul")
- [x] Update `docs/architecture/architecture-overview.md`
- [x] Update `docs/architecture/architecture-subscription.md`
- [x] Update `docs/architecture/architecture-database.md`
- [x] Update `docs/architecture/architecture-jobs.md`
- [x] Update root `CLAUDE.md` Peta Dokumen
- [x] Kolom baru `plans.productLine` (varchar20, NOT NULL DEFAULT 'facport')
- [x] Kolom baru `invoiceItems.productLine` (varchar20, NOT NULL DEFAULT 'facport')
- [x] File baru `apps/api/src/lib/module-catalog.ts` (source of truth katalog)
- [x] `apps/web/lib/module-options.ts` jadi re-export dari file di atas
- [x] Test guard subset `accurate-scopes.ts` vs `module-catalog.ts`
- [x] Test guard drift `plans.route.ts` union vs `module-catalog.ts`
- [x] `NavGroup.productLine?` opsional di `sidebar.tsx` (tanpa ubah renderer)
- [x] Migration lokal (`db:generate` + review manual + `db:migrate`)

## Referensi
- Architecture doc: `docs/architecture/architecture-product-lines.md` (baru)
- ADR: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md` (baru,
  extend `adr-0019-gating-per-sub-modul-dan-katalog-plan.md`)
- Plan lengkap (riset + rekomendasi): `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- Framing dokumentasi WAJIB pakai istilah "Brand → Produk → Varian" (bukan
  "product line"/sub-brand) — koreksi eksplisit dari user saat review plan,
  lihat memory `feedback_brand_produk_varian_terminology`.
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api & apps/web.
- [x] Security review dijalankan (skill `security-review`, sesi utama —
      file diubah sedikit & low-risk, 0 endpoint/gating baru).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
      temuan sama sekali.
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      — tidak ada yang ditunda (0 temuan).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada UI/tool Konverter (upload→SheetJS→download XML) — 0 Varian
  Konverter ditulis di `module-catalog.ts`, sengaja ditunda ke fase build.
- Belum ada schema formula/BOM AutoProduksi (resep, ledger stok) — domain
  model baru, perlu riset/desain sendiri pas fasenya.
- Tabel `conversion_logs` (riwayat Konverter) DIDESAIN di ADR-0033 tapi
  BELUM DIBUAT — dibuat pas fase build Konverter nanti.
- Belum ada job type `pg-boss` baru untuk AutoProduksi — dikonfirmasi murah
  ditambah nanti (pola sama job non-Accurate existing), tidak perlu
  pre-create.
- Migrasi 34 user lama Konverter (akun PHP, JSON file) ke `user` Better
  Auth Facport — open question, SENGAJA belum dijawab (ADR-0033 § open
  question), menunggu fase migrasi Konverter yang sesungguhnya.
- Redesign landing page/UI admin `/admin/plans` untuk Produk — belum
  dikerjakan (cuma model data katalog yang disiapkan, `productLine` belum
  muncul di UI manapun untuk fase ini).
- Render clustering sidebar per Produk (`NavGroup.productLine`) — TIPE
  sudah siap, logic render sengaja ditunda sampai ada item nav
  Konverter/AutoProduksi nyata untuk divalidasi terhadapnya.

## Ringkasan Hasil
Fase ini murni PEMETAAN ARSITEKTUR (bukan fitur baru yang terlihat
customer) — sesuai permintaan eksplisit user untuk memetakan struktur
"Brand → Produk → Varian" (Facport/Konverter/AutoProduksi di bawah 1 brand
"Facport", 1 pendaftaran/billing) SEBELUM lanjut membangun modul lain.

Riset menyeluruh (3 subagent Explore paralel + 1 Plan agent validasi, semua
grounded ke kode nyata via pembacaan file penuh, bukan tebakan) menemukan
fondasi Data Usaha/subscription/job-queue Facport sudah cukup lentur untuk
Produk baru (koneksi Accurate sudah opsional by design, gate `moduleAccess()`
cuma string-membership check, job queue generik) — TIDAK perlu rombak
arsitektur besar. Yang genuinely baru: dimensi "Produk" (kolom
`productLine`, ortogonal terhadap `modules`/`kind`) di tabel `plans` &
`invoiceItems`, source-of-truth katalog baru (`module-catalog.ts`,
menggantikan duplikasi manual 7 module-key di ≥4 tempat), dan desain
(bukan implementasi) untuk riwayat Konverter yang TIDAK cocok pola
`import_batches` existing.

ADR-0033 ditulis untuk mengunci 6 keputusan struktural (lokasi dimensi
Produk, katalog 3-tingkat Produk→Kategori→Varian, konsolidasi
module-key, checkout/invoice tetap flat + 1 kolom denormalisasi, desain
`conversion_logs` Konverter yang ditunda, evolusi tipe sidebar). Draf
plan sempat DITOLAK user sekali di `ExitPlanMode` pertama karena istilah
"product line" terkesan seperti 3 sub-brand terpisah — dikoreksi jadi
kerangka "Brand → Produk → Varian" (analogi toko jual kaos/ban mobil/jasa
web di 1 nama toko) sebelum disetujui; koreksi ini disimpan ke memory
(`feedback_brand_produk_varian_terminology`) supaya konsisten di sesi
berikutnya.

Perubahan kode: 2 kolom baru (migration `0025_big_sally_floyd.sql`, murni
`ADD COLUMN NOT NULL DEFAULT`, tanpa backfill manual), file baru
`module-catalog.ts` (leaf file, 0 import), `module-options.ts` jadi
re-export (field `group`→`category`, 1 consumer disesuaikan), denormalisasi
`productLine` di `invoice-order.ts` (dikonfirmasi per-item benar, bukan
hardcode), field opsional `NavGroup.productLine?` di sidebar (belum dipakai
render). 2 test guard baru mengunci konsolidasi katalog: subset-check
`accurate-scopes.ts` vs `module-catalog.ts`, drift-check union hand-written
`plans.route.ts` vs `module-catalog.ts` (union TIDAK diubah — ada temuan
terdokumentasi 2026-09-04 bahwa generate otomatis merusak inferensi Eden
Treaty).

**Hasil verifikasi**: `bun run typecheck` 0 error (apps/api & apps/web),
`bun run test` 781 pass/0 fail (3 baru), `bun run lint` (apps/web) 0
error/0 warning, security review (sesi utama) 0 temuan. Tidak ada
verifikasi browser manual (tidak ada UI baru yang terlihat customer, 2
kolom DEFAULT identik untuk semua data existing).
