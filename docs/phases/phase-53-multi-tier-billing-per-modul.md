# Fase 53 — Multi-Tier Billing per Sub-Modul (Bulanan/Tahunan dalam 1 Kartu)

**Status:** Done
**Mulai:** 2026-09-07
**Selesai:** 2026-09-07

## Tujuan
1 sub-modul (mis. "Purchase Invoice") sekarang bisa punya beberapa opsi
durasi/harga (mis. Bulanan Rp X vs Tahunan Rp Y) yang dipilih customer
sebelum checkout, tampil sebagai SATU kartu (bukan 2 kartu modul
terpisah yang membingungkan). Diminta user eksplisit karena solusi naif
("bikin 2 paket") tidak user-friendly.

Rencana lengkap (riset arsitektur, keputusan desain) ada di plan file
Plan Mode sesi ini — diringkas ke sini poin pentingnya.

## Scope
- [x] `apps/web/lib/use-grouped-plans.ts` (baru) — hook grouping-by-module + state tier-picker, dipakai landing & subscribe
- [x] `apps/web/app/landing/module-features.tsx` — render grup (pill tier kalau >1), reuse `moduleLabel()`/`formatDuration()` yang sudah ada
- [x] `apps/web/app/app/(protected)/subscribe/page.tsx` — sama, plus interaksi active/trial-per-tier
- [x] `apps/api/src/routes/subscriptions.route.ts` — guard baru `DUPLICATE_MODULE_IN_CART` (defense-in-depth)
- [x] Admin `PlanFormDialog` — helper text soal penamaan tier + sort tabel by modul

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md` § "Multi-Tier per Sub-Modul (Fase 53)" (baru)
- Plan Mode file sesi ini: riset lengkap kenapa backend TIDAK perlu diubah skema

## Keputusan Kecil Selama Eksekusi
- Grouping logic di HOOK bersama (bukan diduplikasi 2x di landing+subscribe) — rendering tetap terpisah karena konteks beda (landing simpel, subscribe ada state active/trial).
- Default tier aktif = durasi TERPENDEK (biasanya bulanan) — pola umum SaaS, bukan diminta eksplisit tapi masuk akal sebagai default.
- `trialEligible` TETAP per baris plan (tidak dipindah ke level modul) — trial hilang/muncul otomatis mengikuti tier yang sedang dipilih, ini disengaja bukan bug.
- Kartu klik diganti dari `<button>` jadi `<div role="button">` (landing & subscribe) — pill tier di dalamnya butuh `<button>` sungguhan, nested `<button>` invalid HTML/a11y.
- `renderHook`/`act` dari `@testing-library/react` v16 (bawaan, tidak perlu tambah `@testing-library/react-hooks`) dipakai untuk unit test hook.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — api+web)
- [x] Security review dijalankan (inline — perubahan presentasi + 1 guard validasi tambahan, tidak ada endpoint/data baru terekspos)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada badge "hemat X%" otomatis di tier durasi lebih panjang meski
  per-hari lebih murah — admin isi harga bebas per tier, UI tidak
  menghitung/menampilkan persentase hemat. Bisa ditambah kalau diminta,
  di luar scope diminta sesi ini.
- Tidak ada fitur upgrade/downgrade tier untuk subscription yang SUDAH
  aktif (mis. pindah dari bulanan ke tahunan di tengah masa aktif) —
  customer beli tier baru lewat jalur checkout normal seperti modul
  baru, TIDAK ada pro-rata/kredit sisa masa aktif tier lama. Gap
  pre-existing sistem subscription secara umum (bukan spesifik fase
  ini), di luar scope.

## Ringkasan Hasil
1 sub-modul sekarang bisa punya beberapa tier durasi/harga (mis.
Bulanan/Tahunan), tampil sebagai SATU kartu di landing dan `/subscribe`
dengan pill pemilih tier — bukan 2 kartu modul terpisah yang
membingungkan. **Backend TIDAK diubah skemanya sama sekali** — riset
menemukan checkout sudah plan-id-based dan guard modul sudah
module-key-based sejak Fase 16, jadi 2+ baris `plans` dengan `modules`
sama otomatis bekerja benar (endAt per tier, guard modul-sudah-aktif,
trial per modul) tanpa migration apa pun. Grouping murni di
`apps/web/lib/use-grouped-plans.ts` (hook shared landing+subscribe).
Tambahan 1 guard backend `DUPLICATE_MODULE_IN_CART` (defense-in-depth,
menolak 1 checkout dengan 2 tier modul sama — seharusnya mustahil lewat
UI resmi). Admin dapat helper text penamaan tier + sort tabel by modul
(kosmetik, endpoint admin tidak berubah).

**Iterasi UX pasca-draft awal** (feedback user langsung, beberapa putaran):
kartu final urutannya Icon+Judul → Deskripsi → border pemisah → Harga →
"Pilih Periode" (pill Bulanan/Tahunan) → "Pilih Paket" (tombol
Berlangganan + Coba Gratis, border 1px warna primary, radius kecil
`rounded-[3px]` — beda dari pill Periode yang tetap bulat penuh). Klik
badan kartu di `/subscribe` DIHAPUS (dulu ambigu begitu ada 2 aksi
berbeda) — semua aksi eksplisit lewat pill "Paket". Landing TETAP bisa
diklik badan kartu (beda kebutuhan dari subscribe, tidak ada trial
sungguhan untuk dieksekusi di situ) DITAMBAH tombol "Coba Gratis" yang
redirect ke login (trial sungguhan cuma bisa dieksekusi di `/subscribe`
yang sudah punya sesi, landing tidak punya akses sesi customer).

Test baru: 6 unit test `use-grouped-plans.test.ts` + 1 test route
`DUPLICATE_MODULE_IN_CART`. Full suite: `apps/api` 413 pass/0 fail,
`apps/web` 21 pass/0 fail. Typecheck+lint 0 error (api+web). Production
build sukses (`/landing` tetap static, `/app/subscribe` tetap dynamic —
tidak ada regresi klasifikasi render). Security review inline: 0 temuan.
