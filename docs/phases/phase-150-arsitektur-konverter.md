# Fase 150 — Arsitektur Produk Konverter (Fondasi, Belum Ada Tipe Transaksi)

**Status:** Planned
**Mulai:** —
**Selesai:** —

## Tujuan
Bangun FONDASI Produk Konverter (Excel→XML client-side untuk Accurate Desktop) — SEBELUM porting tipe transaksi
apa pun. Fase ini murni infrastruktur: katalog modul, skema DB `conversion_logs`, helper klien (download file,
shared XML helpers), pendaftaran union TypeBox admin, dan sidebar clustering multi-Produk (pertama kali benar-benar
dites). TIDAK ada tipe transaksi yang diimplementasi penuh di fase ini (menyusul Fase 151+, per kelompok kecil).

## Scope (task)
- [ ] T1 `docs/decisions/adr-0038-produk-konverter.md` (SUDAH ditulis) + `docs/architecture/architecture-konverter.md`
      (SUDAH ditulis) — verifikasi ulang isinya masih akurat sebelum eksekusi kode dimulai.
- [ ] T2 Migration: tabel `conversion_logs` (skema § ADR-0038 poin 4) di `apps/api/src/db/schema/*.ts`
- [ ] T3 `apps/api/src/lib/module-catalog.ts` — 16 entry `MODULE_CATALOG` (`productLine: "konverter"`) + kategori
      baru "Master Data" di `MODULE_CATEGORIES`
- [ ] T4 `apps/api/src/routes/admin/plans.route.ts` — 16 `t.Literal` union TypeBox baru
- [ ] T5 `POST /me/conversion-logs` + `GET /me/conversion-logs` (route baru, Elysia)
- [ ] T6 `apps/web/lib/converter/shared.ts` — port helper generik (`escapeXml`/`str`/`flag1`/`num`/`normDate`/
      `reserved`/`envelope`) dari `tool.html` app lama
- [ ] T7 `apps/web/lib/download-file.ts` — helper `downloadTextFile()` baru (Blob+`<a download>`)
- [ ] T8 Tambah dependency `xlsx` ke `apps/web/package.json` (versi CDN sama `apps/api`), verifikasi `dynamic
      import()` bekerja tanpa masuk bundle global
- [ ] T9 `apps/web/components/app-shell/sidebar.tsx` — `NavGroup` baru `productLine: "konverter"`, TES nyata
      berjalan bersamaan dengan grup "Facport" (buat 1 Plan dummy dev berisi 1 moduleKey Konverter, subscribe,
      cek sidebar tampil benar tanpa merusak nav Facport)
- [ ] T10 Halaman "Riwayat Konversi" (ringkas, baca `conversion_logs`) — boleh MVP sederhana, detail penuh menyusul
- [ ] T11 Typecheck + lint + tes penuh; security review; dokumen (lessons-learned kalau ada temuan, PROGRESS.md)

## Referensi
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Architecture doc: `docs/architecture/architecture-konverter.md`
- Sumber app lama: `/Users/webane/sites/konverter` (di luar repo)

## Keputusan Kecil Selama Eksekusi
(isi saat eksekusi)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada satu pun tipe transaksi yang benar-benar bisa dipakai user di akhir fase ini — fase ini murni fondasi.
  16 Varian sudah terdaftar di katalog (admin BISA mulai setup Plan) tapi halaman konversi sungguhannya belum ada.
- Migrasi 34 user app lama sengaja tidak masuk scope (keputusan user, § ADR-0038 poin 9).

## Ringkasan Hasil (isi pas fase Done)
