# Fase 115 — Perbaikan UI "Kelola Langganan" Admin: Riwayat per Data Usaha (Accordion) + Auto-Suggest Tanggal Expired

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
3 temuan "prinsipil" user di kartu "Kelola Langganan" (admin `/admin/users`):
(1) belum ada layanan Tim Akses — dikonfirmasi bukan bug kode, cuma
paketnya belum dibuat; (2) "Riwayat Langganan" tidak jelas Data Usaha
mana — diubah jadi accordion default tertutup, dikelompokkan; (3)
tanggal expired tidak otomatis terhitung dari durasi paket — sekarang
di-pre-fill otomatis (tetap bisa diedit manual, tidak melanggar ADR-0016).

## Scope
- [x] `apps/web/lib/timezone.ts` — helper `todayInTimezone` +
      `addDaysToDateString`.
- [x] `ManageSubscriptionDialog` — ganti fetch riwayat ke
      `GET /admin/users/:id/subscriptions` (sudah ada, sudah JOIN Data Usaha).
- [x] `ManageSubscriptionDialog` — Riwayat Langganan jadi Accordion
      (dikelompokkan per Data Usaha, default TERTUTUP), reuse pola
      `[id]/page.tsx`.
- [x] `ManageSubscriptionDialog` — auto-suggest `endAt` dari
      `plan.durationDays` saat plan dipilih (tetap editable).
- [x] Append "Update 2026-09-14" ke ADR-0016 (klarifikasi, bukan edit
      keputusan asli).
- [x] Typecheck 0 error.
- [x] Security review (skill `security-review`, sesi utama — ≤3 file) — 0 temuan.
- [x] `bun run test` tetap 100% pass (no backend change) — 757 pass/0 fail.

## Referensi
- Plan lengkap: `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`
- Pola accordion reuse: `apps/web/app/admin/(protected)/users/[id]/page.tsx`
- Endpoint reuse: `apps/api/src/routes/admin/user-subscriptions.route.ts`
- ADR terkait: `docs/decisions/adr-0016-admin-subscription-expired-manual.md`

## Keputusan Kecil Selama Eksekusi
- Item 1 (paket Tim Akses) DIKONFIRMASI user via AskUserQuestion: bukan
  bug kode, paketnya belum pernah dibuat — TIDAK ADA perubahan kode
  untuk ini, di luar scope commit fase ini.
- Tidak ada endpoint backend baru — endpoint yang dibutuhkan (dengan
  info Data Usaha) sudah ada dari Fase 92/pembaruan 2026-09-12, cukup
  ganti fetch di frontend.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan sama sekali
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada yang perlu dicatat
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Paket "Tim Akses" (seat_addon) belum ada di production/lokal — perlu
  dibuat manual via `/admin/plans` (config, bukan bagian fase ini).
- **Deploy ke production TIDAK bagian fase ini** (instruksi eksplisit
  user: "commit -> stage develop dulu") — cuma sampai push ke `develop`.
- Tidak ada test otomatis baru ditambahkan untuk perubahan UI ini
  (konsisten konvensi project — banyak komponen admin diverifikasi
  manual/visual, bukan unit test).

## Ringkasan Hasil
2 dari 3 temuan diperbaiki lewat kode (item 1 dikonfirmasi bukan bug,
lihat § Keputusan Kecil):

- **Riwayat Langganan sekarang accordion per Data Usaha, default tertutup**
  — `ManageSubscriptionDialog` pindah sumber data ke
  `GET /admin/users/:id/subscriptions` (endpoint sudah ada sejak Fase 92,
  diperkaya info Data Usaha 2026-09-12), reuse persis pola grouping +
  Accordion dari `[id]/page.tsx` — bedanya cuma `defaultValue` dikosongkan
  supaya default tertutup (diminta eksplisit user). Kapabilitas edit
  inline `endAt` per subscription dipertahankan penuh.
- **Tanggal expired auto-terisi dari durasi paket** — `handleSelectPlan`
  baru (dipanggil dari `onChange` Combobox pilih paket, BUKAN `useEffect`
  — ketahuan lewat lint `react-hooks/set-state-in-effect`, dihitung
  langsung di event handler sesuai konvensi project) isi `endAt` dari
  `todayInTimezone(companyTimezone) + plan.durationDays hari` (2 helper
  baru di `lib/timezone.ts`). Field tetap fully-editable, backend `endAt`
  WAJIB tidak berubah (ADR-0016 di-appendix, BUKAN diedit — § "Update
  2026-09-14").
- **Item 1 (layanan Tim Akses)**: dikonfirmasi user bukan bug kode — kode
  (dropdown + backend) sudah lengkap dukung assign paket `kind:"seat_addon"`,
  tinggal paketnya belum pernah dibuat di Admin > Paket. Tidak ada
  perubahan kode untuk ini.

Tidak ada perubahan backend sama sekali — typecheck 0 error, lint 0
error, test suite tetap 757 pass/0 fail (no regresi, konsisten dengan
tidak ada logic backend yang disentuh). Security review (skill
`security-review`, sesi utama): **0 temuan** — dikonfirmasi eksplisit
pindah endpoint TIDAK mencabut akses siapa pun (endpoint baru &
halaman `/admin/users` sendiri sama-sama digerbangi `users.view`).

Sesuai instruksi eksplisit user: fase ini berhenti di commit+push ke
`develop` — **TIDAK dilanjut ke PR/deploy production**.
