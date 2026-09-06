# Fase 25 — Admin UI Kit v2: Data Table Kit + Form Controls

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Lanjutan Admin UI Kit v2 setelah Fase 24 (reskin token, selesai lewat
1 file `globals.css` — jauh lebih murah dari rencana awal). Fase ini
menilai ULANG scope asli (StatCards array, FilterPanel, SearchForm,
FormField) terhadap kebutuhan KONKRET yang benar-benar ada di project
ini sekarang — bukan membangun semua komponen di spec sumber
`master-typescript` demi kelengkapan, konsisten dengan pelajaran Fase 24
(jangan reka kebutuhan hipotetis).

Referensi: ADR-0024, `master-typescript`
`architecture-component-data-table.md` §
"Filter Panel"/"Search Form" dan `architecture-component-form-controls.md`.

## Scope (dinilai ulang sebelum eksekusi)
- [x] `apps/web/components/ui/search-form.tsx` (baru) — debounced
      (350ms). **Alasan konkret**: `admin/users/page.tsx` search box
      SEBELUMNYA fetch API tiap keystroke (`onChange` langsung
      `setSearch` yang jadi dependency `useEffect`, tanpa debounce sama
      sekali) — bug performa nyata, dikonfirmasi lewat baca kode
      langsung, bukan hipotetis. Dipasang di halaman itu (GANTI `Input`
      polos). URL query param state SENGAJA TIDAK dibangun (§ Keputusan
      Kecil).
- [x] `apps/web/components/ui/form-field.tsx` (baru) — wrapper
      label+error+hint+required. Dipasang di 2 form —
      `CreateInvoiceDialog` (Fase 27) & `ProfileSettings` (Fase 22,
      SEMUA 3 field form — nama+password+konfirmasi) — cukup buktikan
      pola bekerja & dipakai ≥2 tempat (§ ADR-0024 prinsip "primitif
      baru wajib dipakai ≥2 halaman"), TIDAK migrasi paksa semua form.
- [x] Bonus kecil: `Button` prop `loading` (Fase 24) akhirnya DIPAKAI
      nyata di 3 tombol submit (`ProfileSettings` x2, `CreateInvoiceDialog`)
      — GANTI pola manual `disabled={submitting}` + teks
      "Menyimpan..."/"Membuat..." hardcode.
- [ ] ~~`StatCards` (versi array, ganti `StatCard` tunggal)~~ —
      **DITUNDA, bukan gap konkret**: `StatCard` tunggal (Fase 19) sudah
      cukup untuk kebutuhan sekarang (admin dashboard 3 kartu manual).
      Ganti API tanpa manfaat nyata = ceremony tanpa nilai (pelajaran
      Fase 24).
- [ ] ~~`FilterPanel` (collapsible, state URL)~~ — **DITUNDA**: satu-satunya
      kandidat pemakaian (`admin/orders` status) SUDAH tertangani baik
      oleh `Tabs` (Fase 20/21) — set queue kecil & mutually-exclusive,
      `Tabs` cocok, `FilterPanel` justru dirancang untuk MULTI-KRITERIA
      simultan yang belum ada di halaman manapun sekarang. Revisit kalau
      ada halaman butuh filter gabungan (tanggal+status+dst) beneran.
- [ ] `apps/web/components/ui/data-table.tsx` — TIDAK diubah (v9 native
      sudah benar sejak Fase 19, row-selection TETAP tidak diaktifkan —
      belum ada use case bulk-action nyata)

## Referensi
- ADR: `docs/decisions/adr-0024-admin-ui-kit-v2.md`

## Keputusan Kecil Selama Eksekusi
- **`SearchForm` TIDAK sinkron ke URL query param** — nilai tambahnya
  (search bisa di-bookmark/share) kecil dibanding kompleksitas tambahan
  (`useSearchParams` mensyaratkan Suspense boundary, pola sudah ada di
  `login-form.tsx` tapi nambah lapisan di halaman list yang sekarang
  sudah punya banyak state lokal `page`/`search`). Fokus fase ini pada
  masalah KONKRET (tidak ada debounce), bukan menambah kapabilitas yang
  belum diminta.
- **`FilterPanel` dan `StatCards` (array) DITUNDA total** — dinilai
  ulang SEBELUM eksekusi (bukan pertengahan seperti Fase 24): tidak ada
  halaman dengan kebutuhan MULTI-KRITERIA filter simultan (`Tabs`
  existing sudah pas untuk switch queue tunggal), dan `StatCard`
  tunggal sudah cukup untuk 1 use case (admin dashboard). Membangun
  komponen tanpa pemakai konkret persis pelajaran yang baru dipetik
  Fase 24 (jangan reka kebutuhan hipotetis) — diterapkan LEBIH AWAL kali
  ini (sebelum menulis kode, bukan setelah).
- **`FormField` dipasang di form yang PALING BARU/masih diingat
  strukturnya** (`CreateInvoiceDialog` Fase 27, `ProfileSettings` Fase
  22) — bukan form tertua, supaya adopsi terasa alami di kode yang baru
  ditulis, bukan sekadar comply checklist di file acak.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — self-review (2 komponen baru murni
      presentasi/UX, 1 fix bug performa existing — tidak ada
      logic/data flow/endpoint baru)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **`SearchForm` belum dipakai di halaman list LAIN** (cuma
  `admin/users`) — halaman list lain (`admin/plans`, `admin/orders`,
  `admin/invoices`) belum punya search box sama sekali di UI-nya
  sekarang (bukan gap fase ini, memang belum pernah ada) — kalau nanti
  ditambah, `SearchForm` sudah siap dipakai ulang.
- **`FormField` belum dipasang di form LAIN** (`AddUserDialog`,
  `ManageSubscriptionDialog`, `PlanFormDialog`, Settings) — sengaja,
  lihat § Keputusan Kecil ADR-0024 (adopsi bertahap, bukan migrasi paksa).
- **Verifikasi visual browser sungguhan BELUM dilakukan** — konsisten
  seluruh sesi ini.

## Ringkasan Hasil
Dinilai ulang SEBELUM eksekusi (bukan pertengahan seperti Fase 24):
dari 4 komponen di rencana asli (`StatCards` array, `FilterPanel`,
`SearchForm`, `FormField`), cuma 2 yang punya kebutuhan KONKRET saat
ini di project — `FilterPanel`/`StatCards` array ditunda total (tidak
ada halaman butuh multi-kriteria filter simultan, `StatCard` tunggal
sudah cukup).

`SearchForm` (debounced 350ms) dibangun untuk memperbaiki bug performa
nyata: `admin/users/page.tsx` sebelumnya fetch API tiap keystroke tanpa
debounce sama sekali. `FormField` (label+error+hint+required seragam)
dipasang di 2 form (`CreateInvoiceDialog`, `ProfileSettings`) — cukup
membuktikan pola bekerja tanpa memaksa migrasi semua form existing.
Sebagai bonus, prop `loading` Button (dibangun tapi belum dipakai di
Fase 24) akhirnya dipakai nyata di 3 tombol submit.

Typecheck 0 error, lint 0 error, test suite API tidak berubah (170
pass/3 skip/0 fail — backend tidak disentuh), security review
self-review 0 temuan.
