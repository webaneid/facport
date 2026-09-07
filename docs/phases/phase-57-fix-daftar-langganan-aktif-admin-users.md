# Fase 57 — Fix: `/admin/users` Cuma Tampil 1 Langganan Aktif Padahal Ada Beberapa

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
User laporkan 2 klien production yang sebelumnya berlangganan SEMUA modul
sekarang cuma tampil 1 modul di kolom "Langganan Aktif" laman
`/admin/users`. Ditelusuri: bug murni tampilan (bukan data hilang) di
`GET /admin/users` — `subByUser` pakai `Map` 1-value-per-user, jadi kalau
user punya >1 subscription aktif (normal sejak multi-tier per modul, Fase
53), cuma yang TERAKHIR di array hasil query yang selamat, sisanya
ke-overwrite diam-diam saat konstruksi Map.

## Root Cause
`apps/api/src/routes/admin/users.route.ts` (sebelum fix):
```ts
const subByUser = new Map(subRows.map((s) => [s.userId, s]));
```
`new Map()` dari array `[key, value]` — kalau ada 2+ entry dengan `key`
(userId) yang sama, entry TERAKHIR menang, yang lain hilang dari Map (bukan
dari database). Field response `activeSubscription` (singular, nullable)
otomatis cuma bisa tampung 1 subscription per user, walau user itu
sebenarnya punya banyak subscription `status: "active"` sekaligus (1 per
modul, sudah jadi kondisi normal sejak Fase 53 multi-tier billing).

Frontend (`apps/web/app/admin/(protected)/users/page.tsx`) merender 1
`<Badge>` dari `activeSubscription.planName` — konsisten dengan bug
backend di atas, bukan bug terpisah.

## Scope
- [x] `apps/api/src/routes/admin/users.route.ts` — `subByUser` diubah dari
  `Map<userId, subscription>` jadi `Map<userId, subscription[]>`, response
  field diubah nama jadi `activeSubscriptions` (array, default `[]`)
- [x] `apps/web/app/admin/(protected)/users/page.tsx` — tipe
  `activeSubscriptions: ActiveSubscription[]`, kolom "Langganan Aktif"
  render SEMUA badge (flex-wrap), bukan cuma 1

## Referensi
- Ditemukan lewat laporan user, bukan dari monitoring otomatis (gap dicatat
  di Known Limitations)
- Terkait `docs/architecture/architecture-subscription.md` § Multi-Tier per
  Sub-Modul (Fase 53) — kondisi "1 user punya banyak subscription aktif
  sekaligus" jadi NORMAL sejak fase itu, endpoint listing ini yang belum
  disesuaikan

## Keputusan Kecil Selama Eksekusi
- Rename field response `activeSubscription` → `activeSubscriptions`
  (breaking shape, bukan cuma nullable→array) — dicek dulu, field ini CUMA
  dipakai 1 tempat di frontend (`apps/web/app/admin/(protected)/users/page.tsx`),
  aman diganti sekaligus tanpa backward-compat shim.
- Tidak menambah dedupe/agregasi per modul (mis. gabung nama modul jadi 1
  badge) — 1 badge per subscription plan sudah cukup jelas dan konsisten
  dengan cara `plan.name` ditampilkan di tempat lain (mis. riwayat
  langganan customer).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web)
- [x] Security review dijalankan (inline, 2 file) — 0 temuan: tidak ada
  field baru yang bocor (`planName`/`status`/`endAt` sama seperti
  sebelumnya, cuma bentuk array), permission endpoint (`users.view`) tidak
  berubah, tidak ada input client baru
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
- [x] Temuan Medium/Low dicatat — lihat Known Limitations
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Bug ini sudah ada sejak listing subscription admin dibuat (Fase 10),
  cuma BARU KETAHUAN sekarang karena baru ada customer real dengan >1
  modul aktif sekaligus (setelah Fase 53 multi-tier per modul jadi umum).
  Tidak ada test regresi otomatis yang mendeteksi kondisi "2+ user punya
  subscription lebih dari 1 sebelumnya" — ditambahkan test baru di fase
  ini untuk mencegah regresi ke depan (`users.route.test.ts`).
- Tidak ada monitoring/alert otomatis untuk mendeteksi kelas bug serupa
  (agregasi `Map` yang diam-diam overwrite) di endpoint listing admin lain
  — kalau relevan, perlu audit terpisah code review pola `new Map(rows.map(...))`
  di seluruh `routes/admin/*.ts`, di luar scope fix reaktif ini.

## Ringkasan Hasil
Bug tampilan (bukan data hilang) di `GET /admin/users`: `Map` 1-value-per-
user diam-diam overwrite subscription lama tiap ada duplikat `userId` di
hasil query, jadi user dengan >1 modul aktif cuma tampil 1 badge di admin.
Fix: `subByUser` jadi `Map<userId, subscription[]>`, response field
`activeSubscriptions` (array), frontend render semua badge. Test baru
verifikasi user dengan 2 subscription aktif (modul beda) SEMUA muncul di
response.

Full suite `apps/api` 416 pass/0 fail (1 baru). Typecheck 0 error (api+web).
Build `apps/web` sukses. Security review inline: 0 temuan.
