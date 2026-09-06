# Fase 24 — Admin UI Kit v2: UI Primitives + Feedback

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Lanjutan Admin UI Kit v2 (ADR-0024) setelah Fase 23 (Shell + Token) —
sempat diinterupsi Fase 27 (Invoice) atas permintaan user, sekarang
dilanjutkan. Tulis ulang TOTAL `Button`/`Card`/`Badge` (API baru:
variant `primary`/`secondary`/`danger`/`outline`/`ghost`, tone
`ok`/`warning`/`danger`/`neutral`/`accent`) + `Modal`/`EmptyState`
(Feedback v2), **DAN migrasi SEMUA pemakai lama dalam fase yang sama**
(bukan fase terpisah seperti Fase 19→21 dulu) — karena mengganti nama
variant/tone akan mematahkan puluhan file existing kalau dibiarkan
setengah jalan di antara fase.

Referensi: ADR-0024, rencana lengkap di plan file sesi ini,
`/Users/webane/sites/master-typescript/docs/architecture/components/architecture-component-ui-primitives.md`
dan `architecture-component-feedback.md`.

## Scope (DIREVISI SAAT EKSEKUSI — lihat Keputusan Kecil)
- [x] `apps/web/app/globals.css` — **perubahan UTAMA**: skala
      `--color-primary-50..900` diganti TOTAL jadi turunan biru (700
      persis `--admin-accent`, 900 persis `--admin-accent-strong`),
      `--color-background/-foreground/-muted/-muted-foreground/-border`
      di-ALIAS ke `--admin-panel-solid/-ink/-canvas-deep/-muted/-line` —
      1 perubahan ini me-reskin OTOMATIS ~70 file yang sudah pakai token
      semantik (`bg-primary-600`, `text-foreground`, `border-border`,
      dst), TANPA menyentuh file itu sama sekali
- [x] `apps/web/components/ui/button.tsx` — radius `rounded-md`→`rounded-xl`,
      prop `loading` BARU (opsional, Loader2 spinner + auto-disable) —
      nama variant (`default`/`outline`/`ghost`/`destructive`/`secondary`)
      **TIDAK diganti** (lihat Keputusan Kecil)
- [x] `apps/web/components/ui/card.tsx` — radius `rounded-xl`→`rounded-2xl`
      — nama `CardContent` **TIDAK diganti** jadi `CardBody`
- [x] `apps/web/components/ui/dialog.tsx` — radius+shadow dibumpin cocok
      Modal Admin UI Kit v2, TETAP Radix-based (bukan Modal custom)
- [x] `apps/web/components/ui/combobox.tsx`, `command.tsx`, `popover.tsx`
      — ditemukan sisa hardcode `border-neutral-*`/`text-neutral-*` dari
      SEBELUM sistem token ada (tidak auto-reskin) — diganti ke token
      (`border-border`/`text-muted-foreground`/`bg-muted`)
- [x] `apps/web/components/ui/badge.tsx`, `empty-state.tsx`,
      `pagination.tsx`, `stat-card.tsx`, `data-table.tsx`, `table.tsx`,
      `input.tsx`, `checkbox.tsx`, `select.tsx`, `textarea.tsx`,
      `alert.tsx`, `tabs.tsx`, `tooltip.tsx` — DICEK, SEMUA sudah pakai
      token semantik, auto-reskin dari perubahan `globals.css`, TIDAK
      perlu diedit
- [ ] ~~Migrasi SEMUA pemakai lama (~32 file Button, 21 Card, dst)~~ —
      **DIBATALKAN, lihat Keputusan Kecil** — tidak ada API yang
      berubah, jadi tidak ada yang perlu dimigrasi

## Referensi
- ADR: `docs/decisions/adr-0024-admin-ui-kit-v2.md`

## Keputusan Kecil Selama Eksekusi
- **PIVOT EKSEKUSI TERBESAR fase ini**: rencana awal (rename API
  Button/Card/Badge ke nama spec `master-typescript` + migrasi puluhan
  file pemakai) DIBATALKAN pertengahan eksekusi, diganti pendekatan
  jauh lebih murah: **reskin via 1 file token (`globals.css`) saja**.
  Alasan: hampir SEMUA komponen (Button, Card, Badge, EmptyState, dst)
  SUDAH memakai token semantik (`bg-primary-600`, `text-foreground`,
  `border-border`) alih-alih hex hardcode — jadi cuma perlu GANTI NILAI
  token itu jadi biru, BUKAN tulis ulang komponen + migrasi caller.
  Dicek presisi via `grep`: cuma **5 file** yang literal memanggil
  `buttonVariants("default", ...)` (positional, bukan JSX prop) dan
  **0 file** yang pakai `<Button variant="destructive">` JSX langsung —
  blast radius rename API akan JAUH lebih kecil dari perkiraan awal
  rencana (32 file), TAPI karena nama variant TIDAK diganti sama
  sekali, bahkan 5 file itu pun tidak perlu disentuh.
- **Nama API (`variant`, `CardContent`, dll) SENGAJA DIPERTAHANKAN**,
  BUKAN diganti ke istilah spec (`primary`/`danger`, `CardBody`, `tone`)
  — rename API murni kosmetik (tidak ada perbedaan visual/fungsional)
  akan memaksa migrasi puluhan file TANPA manfaat nyata bagi user, yang
  cuma peduli HASIL VISUAL (biru, rounded, modern) bukan nama prop
  internal. Ini keputusan sadar menyimpang dari rencana awal Fase 24
  (yang menyebut "GANTI CardContent→CardBody, bukan alias") — dicatat
  di sini sebagai koreksi rencana, bukan lupa.
- **Skala biru `--color-primary-50..900` diinterpolasi manual** (bukan
  generator warna otomatis), 2 titik jangkar PERSIS nilai user
  (700=`#023e8a`, 900=`#03045e`), 8 stop lain ditulis untuk progresi
  mulus — cek visual manual (§ Known Limitations) tetap direkomendasikan
  begitu ekstensi Chrome tersambung.
- **3 file primitif (`combobox.tsx`/`command.tsx`/`popover.tsx`)
  ternyata punya sisa hardcode `border-neutral-*` dari SEBELUM sistem
  token ada** (temuan tak terduga, bukan dari rencana awal) — kalau
  tidak diperbaiki, 3 komponen ini akan TETAP abu-abu netral di tengah
  UI yang sudah biru di sekelilingnya. Diperbaiki jadi token semantik
  yang sama seperti komponen lain.
- **`loading` prop Button ditambah, TAPI TIDAK dipaksa dipakai** di
  halaman manapun sesi ini (murni tersedia untuk dipakai bertahap) —
  pola lama (`disabled={submitting}` + teks manual "Menyimpan...") TETAP
  jalan, tidak ada yang patah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — self-review (perubahan MURNI visual/CSS,
      tidak ada logic/data flow/endpoint yang berubah sama sekali —
      risiko keamanan nihil secara struktural, subagent tidak
      diperlukan untuk perubahan sekelas ini)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Verifikasi visual browser sungguhan BELUM dilakukan** — konsisten
  dengan seluruh sesi ini (ekstensi Chrome tidak tersambung). Fase ini
  PALING butuh verifikasi visual dari semua fase (reskin warna total)
  tapi justru belum pernah dilihat sama sekali — risiko: skala biru
  50-600 hasil interpolasi manual bisa saja kontras/kombinasinya kurang
  pas di beberapa tempat spesifik, tidak akan ketahuan dari kode/typecheck.
- **Badge TIDAK diubah jadi gaya uppercase-bold-tiny** seperti spec
  sumber (`text-[10px] font-bold uppercase tracking-[0.08em]`) — label
  status di project ini panjang & Bahasa Indonesia (mis. "Menunggu
  Verifikasi Pembayaran"), gaya itu berisiko kurang terbaca dalam huruf
  kapital semua di font sekecil itu. Dipertahankan gaya lama (`text-xs
  font-medium`, sentence case) yang sudah terbukti terbaca — keputusan
  disengaja, bukan kelupaan.
- **`Modal` component custom (spec sumber) TIDAK dibangun** — Radix
  Dialog (sudah ada, accessible, focus-trap teruji) dipertahankan
  sebagai satu-satunya sistem modal, direstyle token biru — membangun
  2 sistem modal paralel dianggap lebih berisiko drift daripada manfaat
  mengikuti spec literal.
- **`FilterPanel`/`SearchForm`/`FormField`/`StatCards` (array)/`Can`**
  (komponen lain dari spec Admin UI Kit v2) BELUM dibangun — itu scope
  Fase 25-26, BUKAN bagian fase ini.

## Ringkasan Hasil
Reskin visual TOTAL admin dashboard ke palet biru (anchor user:
`#023e8a`/`#03045e`/`#ebf2fa`) tercapai lewat **1 perubahan file**
(`globals.css`) — skala `--color-primary-50..900` diganti jadi turunan
biru, token netral (`background`/`foreground`/`muted`/`border`)
di-alias ke token `--admin-*` dari Fase 23. Karena hampir semua
komponen project ini SUDAH konsisten memakai token semantik (bukan hex
hardcode) sejak awal, perubahan 1 file ini otomatis me-reskin visual
~70 file tanpa satu pun perlu diedit — pivot besar dari rencana awal
yang mengira perlu tulis-ulang API Button/Card/Badge + migrasi puluhan
caller (ternyata TIDAK perlu, dicek presisi: 0 file pakai
`<Button variant="destructive">` JSX, cuma 5 file pakai
`buttonVariants("default",...)` positional — dan bahkan itu pun aman
karena nama variant sengaja TIDAK diganti).

Selain reskin token, 3 primitif dibumpin radius/shadow (Button
`rounded-xl`, Card `rounded-2xl`, Dialog radius+shadow lebih lembut)
cocok gaya Admin UI Kit v2, Button dapat prop `loading` baru (opsional,
tidak mematahkan pemakaian lama), dan ditemukan+diperbaiki 3 file
(`combobox.tsx`/`command.tsx`/`popover.tsx`) yang ternyata masih pakai
warna abu-abu hardcode dari sebelum sistem token ada — kalau tidak
ketahuan lewat sapuan `grep` eksplisit, 3 komponen ini akan tetap
abu-abu di tengah UI yang sudah biru.

Nama API (variant Button, `CardContent`, dll) SENGAJA dipertahankan —
rename ke istilah spec sumber (`primary`/`danger`, `CardBody`, `tone`)
akan murni kosmetik tanpa manfaat visual, memaksa migrasi puluhan file
tanpa alasan kuat. Keputusan ini didokumentasikan eksplisit sebagai
penyimpangan sadar dari rencana awal.

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite API
tidak berubah (170 pass/3 skip/0 fail — backend tidak disentuh sama
sekali), security review self-review 0 temuan (perubahan murni CSS/token,
tidak ada logic/data flow baru).

**Verifikasi visual browser sungguhan BELUM dilakukan** — fase paling
butuh itu dari semua fase redesign, masih tertunda ekstensi Chrome.
