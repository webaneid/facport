# Fase 11 — Admin: Expired Manual per Subscription

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
`POST /admin/subscriptions` (Fase 10) selalu menghitung `endAt` otomatis
dari `plan.durationDays`, sama seperti jalur self-service checkout —
admin tidak punya cara input tanggal expired sendiri. Ini gap nyata untuk
kasus admin-provisioned yang paling butuh fleksibilitas (kontrak korporat
dengan tanggal custom, perpanjang/perpendek masa aktif tanpa bikin
subscription baru). Ditemukan lewat audit dokumentasi admin dashboard,
BUKAN revisit Known Limitation Fase 10 — genuinely belum dibangun.

## Scope
- [x] `POST /admin/subscriptions`: `endAt` jadi field wajib di body,
      hapus kalkulasi otomatis dari `plan.durationDays` (§ ADR-0016)
- [x] `PATCH /admin/subscriptions/:id` (baru): edit `endAt` subscription
      `status = "active"`, audit log (actorId, endAt lama & baru)
- [x] Validasi `endAt` harus di masa depan (POST: relatif `startAt`,
      PATCH: relatif waktu request)
- [x] UI dialog "Kelola Langganan" (`/admin/users`): input tanggal wajib
      saat assign plan baru
- [x] UI: aksi edit `endAt` untuk subscription aktif yang sudah ada
- [x] Fix dokumentasi kadaluarsa `architecture-subscription.md` §
      "Downgrade Otomatis Saat Expired" (referensi file worker terpisah
      yang tidak pernah ada — sudah diperbaiki di Langkah 1, lihat commit
      fase ini)

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md`
- ADR: `docs/decisions/adr-0016-admin-subscription-expired-manual.md`

## Keputusan Kecil Selama Eksekusi
- `ManageSubscriptionDialog`/`AddUserDialog` di `apps/web/app/admin/(protected)/users/page.tsx`
  SUDAH pakai state manual (`useState`), bukan `zod`+`react-hook-form`
  (konvensi baku di `apps/web/CLAUDE.md`) — field tanggal baru ditambah
  konsisten dengan pola manual yang SUDAH ADA di file ini, bukan refactor
  ke react-hook-form (di luar scope fase ini, berisiko regresi ke dialog
  yang sudah jalan). Kalau nanti dialog ini di-refactor total, ikutkan
  migrasi ke react-hook-form saat itu.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda (tidak ada — cuma 2 item ❓ pre-existing, bukan temuan baru fase ini, tidak perlu dicatat ulang)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `plan.durationDays` untuk paket yang cuma pernah dipakai admin-provisioned
  jadi sekadar informasi referensi di dropdown form (mis. "Pro — 30 hari"),
  BUKAN lagi diterapkan otomatis ke `endAt` — admin bertanggung jawab penuh
  input tanggal yang benar. Tidak ada pengingat/warning di UI kalau tanggal
  yang diinput jauh dari `durationDays` plan (mis. pilih paket 30 hari tapi
  isi tanggal 1 tahun) — divalidasi cuma "harus di masa depan", bukan
  "masuk akal dibanding durationDays". Bisa ditambah kalau jadi masalah nyata.
- `userId` di `POST /admin/subscriptions` masih `t.String()` tanpa
  `format: "uuid"` (pre-existing sejak Fase 10, tidak diperbaiki di fase
  ini — di luar scope).
- CSRF token untuk mutasi cookie-based endpoint admin (§
  `architecture-security.md` §5) belum diimplementasikan project-wide;
  endpoint baru fase ini mewarisi postur yang sama dengan endpoint admin
  lain yang sudah ada, bukan gap baru.

## Ringkasan Hasil (isi pas fase Done)
Admin sekarang WAJIB input tanggal expired manual (`endAt`) saat assign
paket ke user (`POST /admin/subscriptions`) — tidak lagi otomatis dihitung
dari `plan.durationDays` (§ ADR-0016). Endpoint baru `PATCH
/admin/subscriptions/:id` untuk edit `endAt` subscription `active` yang
sudah ada (perpanjang/perpendek) tanpa bikin baris baru, dicatat di
`audit_logs` (endAt lama & baru). UI dialog "Kelola Langganan"
(`/admin/users`) dapat input tanggal wajib di form assign + aksi pensil
inline untuk edit tanggal expired subscription aktif di riwayat.

Sekaligus diperbaiki dokumentasi kadaluarsa yang ditemukan lewat audit
sebelum fase ini direncanakan: `architecture-subscription.md` §
"Downgrade Otomatis Saat Expired" masih referensi file worker terpisah
(`expire-subscriptions.worker.ts`) yang TIDAK PERNAH ADA — kode asli
inline di `apps/api/src/workers/index.ts` bareng semua job lain, sudah
diselaraskan dengan `architecture-jobs.md`.

Typecheck nol error, security review 0 temuan Critical/High/Medium/Low
baru (2 item ❓ murni pre-existing, dicatat di Known Limitations di atas).
