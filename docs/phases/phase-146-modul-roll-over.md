# Fase 146 — Modul Roll Over (Penyelesaian Pesanan)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Bangun modul import Roll Over end-to-end sesuai `docs/architecture/architecture-roll-over.md` (Fase 136): dokumen "penutup" Job Costing yang
mengonversi biaya Job Order menjadi Finished Good (`rollOverType=ITEM`) atau alokasi biaya ke akun (`ACCOUNT`), 1 panggilan
`POST roll-over/save.do`. Sub-modul ke-4 dari 5 rencana Fase 136; dependensi Job Costing (Fase 139) sudah live. Kategori "Manufacture".

## Scope (task)
- [x] T1 `apps/api/src/lib/import-mapping/roll-over.mapping.ts` (+ tes): field, dictionary tipe (Akun/Barang), grouping by "No Trans", percabangan detailItem/detailExpense per tipe, validasi baris & konsistensi grup
- [x] T2 `apps/api/src/lib/accurate-roll-over.ts` (`saveRollOver`)
- [x] T3 `apps/api/src/routes/roll-over-import.route.ts` (+ tes), termasuk pengecekan scope (`checkSubscriptionScopes`)
- [x] T4 Registri endpoint & scope: entry `roll_over` di `accurate-endpoint-registry.ts` (`POST roll-over/save.do` + Kategori Keuangan); `bun run scopes:sync` bila perlu
- [x] T5 `processRollOverGroup` + `ensureRollOverDataClassifications` + dispatch di `workers/index.ts`
- [x] T6 Titik registrasi checklist § 3b (template-guide, module-catalog, plans.route, app.ts, landing-content, sidebar, module-import-routes, import-batch-table, halaman admin batch-detail)
- [x] T7 Web: 3 halaman (`import`, `import/[batchId]`, `import/riwayat`) + `delete-import-dialog` + `edit-row-dialog`
- [x] T8 Typecheck + lint + tes penuh; trik verifikasi § 3b; security review; dokumen (architecture, lessons-learned, PROGRESS)

## Keputusan yang sudah ditetapkan (dari dokumen arsitektur + preseden Fase 138/139)
- TIDAK auto-create item (Excel tidak punya kolom nama barang; `findOrCreateItem` mewajibkan nama) → scope `item_save` tidak dibutuhkan.
- TIDAK ada lookup akun GL → `glaccount_view` tidak dibutuhkan. Scope modul: `roll_over_save` + `data_classification_view/save` (Kategori Keuangan 10 slot).
- `rollOverType` per DOKUMEN (baris pertama grup), semua baris grup wajib bertipe sama; ITEM → baris masuk `detailItem[]`, ACCOUNT → `detailExpense[]`.
- Kolom expense (Expense Acc No/Amount/Name/Note) = perluasan Facport (tidak ada di Excel client) supaya `ACCOUNT` bisa dipakai; opsional.
- Cabang WAJIB (preseden Fase 90).

## Di luar scope
Work Order (Fase 147). Batal Import (Accurate tidak punya API hapus yang dipakai modul lain untuk kategori ini).

## Keputusan Kecil (isi saat eksekusi)
- `itemNo`/`quantity` (Barang) dan `accountNo`/`expenseAmount` (Akun) wajib BERSYARAT per baris lewat `rollOverRowError`, bukan di `requiredFields` mapping (yang hanya: tanggal, cabang, Job Order, tipe). Tes route mengunci ini.
- Tipe Penyesuaian tidak dikenali → baris ditolak (`rollOverType`), tidak ada default diam-diam.
- Project No hanya dikirim di `detailItem`, tidak di `detailExpense` (spec expense tidak punya `projectNo`).
- `accurate-scopes.test.ts`: asersi "registri == daftar lama" diubah jadi "⊇" karena modul pasca-Fase 142 tidak punya daftar lama.

## Known Limitations
- Belum diuji ke Accurate sungguhan (DEV Retail Demo): payload dibangun dari spec OpenAPI + sheet client; uji end-to-end dengan Job Order nyata dijadwalkan sebelum rilis.
- Kolom Expense (Acc No/Amount/Name/Note) adalah perluasan Facport, belum ada di Excel client; perlu konfirmasi client sebelum dipromosikan.
- Tanpa Batal Import.

## Ringkasan Hasil
Modul Roll Over lengkap: mapping (+20 tes), client `saveRollOver`, route (+22 tes) dengan `checkSubscriptionScopes` di confirm/retry, worker (`processRollOverGroup`), registri scope (`roll_over_save` + Kategori Keuangan), 11 titik registrasi §3b (diverifikasi dengan diff), 5 berkas web. Typecheck 0 error, lint bersih, API 1484 pass, web 97 pass; data tes dibersihkan. Security review: guard/`moduleAccess`/validasi `t.Object`/scope check setara route referensi Inventory Adjustment; tidak ada temuan.
