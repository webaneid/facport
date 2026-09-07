# Fase 58 — Fix: URL Notifikasi Admin Double-Prefix (`/admin/admin/...`)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
User laporkan link notifikasi di admin (`https://admin.facinstitute.id/admin/orders`)
salah — seharusnya `https://admin.facinstitute.id/orders`.

## Root Cause
`apps/web/proxy.ts` (baris 50) SUDAH rewrite `pathname` jadi
`/${surface}${pathname}` untuk SEMUA request ke subdomain admin/app —
artinya href yang dipakai di kode HARUS bare path (mis. `/orders`), proxy
sendiri yang nambah prefix `/admin` secara internal untuk resolve ke
folder route Next.js (`app/admin/(protected)/orders/page.tsx`). Konvensi
ini sudah benar dipakai di sidebar admin (`components/app-shell/sidebar.tsx`
→ `href: "/orders"`, bukan `/admin/orders`).

`apps/web/lib/notification-routes.ts` (Fase 45/46) TIDAK ikuti konvensi
ini — 3 return value untuk surface admin sudah menyertakan prefix
`/admin` secara manual:
- `"admin_payment_proof_submitted"` → `"/admin/orders"`
- `"announcement"` (surface admin) → `"/admin/announcements"`
- default (surface admin) → `"/admin"`

Akibatnya proxy rewrite JADI double-prefix: `/admin/orders` →
`/admin/admin/orders` — TIDAK ADA folder route itu, jadi ini bukan
sekadar "URL kelihatan aneh", tapi link yang benar-benar 404/rusak
begitu diklik.

## Scope
- [x] `apps/web/lib/notification-routes.ts` — hapus prefix `/admin` dari
  3 return value (`admin_payment_proof_submitted`, `announcement`,
  default) untuk surface admin
- [x] Test baru `apps/web/lib/notification-routes.test.ts` — assert
  SEMUA tipe notifikasi utk surface admin TIDAK PERNAH menghasilkan
  link berawalan `/admin`

## Referensi
- `apps/web/proxy.ts` § rewrite `/${surface}${pathname}`
- `components/app-shell/sidebar.tsx` — konvensi bare path yang sudah benar
- `docs/architecture/architecture-domain-routing.md` — resolusi surface
  dari subdomain

## Keputusan Kecil Selama Eksekusi
- Tidak menyentuh case lain (`/billing`, `/subscribe`, `/accurate`,
  `/notifications`) — ini semua untuk surface "app" (customer), bukan
  admin, jadi tidak kena bug prefix ini (sudah bare path dari awal,
  memang tidak pernah dicabang per-surface).
- Tidak ada perubahan skema/endpoint backend — murni string path statis
  di frontend.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline, 1 file diubah + 1 test baru) —
  0 temuan, tidak ada input user/endpoint baru
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
- [x] Temuan Medium/Low dicatat — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada test end-to-end yang benar-benar klik notifikasi di browser
  admin sungguhan — verifikasi lewat unit test pure-function
  (`notificationLink()`) + code reading `proxy.ts` rewrite rule, cukup
  untuk membuktikan root cause & fix karena fungsi ini SATU sumber
  kebenaran (tidak ada logic serupa di tempat lain).

## Ringkasan Hasil
Link notifikasi admin (jenis `admin_payment_proof_submitted`,
`announcement`, dan default/tidak dikenal) sebelumnya menyertakan prefix
`/admin` secara manual, padahal `proxy.ts` SUDAH menambah prefix itu
sendiri lewat rewrite `/${surface}${pathname}` — hasilnya double-prefix
`/admin/admin/...` yang 404 saat diklik. Fix: hapus prefix manual,
konsisten dengan konvensi bare-path yang sudah dipakai sidebar admin.

Typecheck 0 error. Full suite `apps/web` 27 pass/0 fail (6 baru). Build
sukses. Security review inline: 0 temuan.
