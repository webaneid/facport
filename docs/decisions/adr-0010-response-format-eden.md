# ADR-0010: Format Response API — Bare Payload, Bukan `{data,error}` Manual

**Status:** Accepted
**Tanggal:** 2026-08-19

## Context
`architecture-api.md` (dari template awal) mendokumentasikan konvensi
response HTTP `{ data, error }` untuk SEMUA endpoint `apps/api`, dan
setiap route yang ditulis di Fase 00 & awal Fase 01 mengikuti ini secara
manual: `return { data: payload, error: null }` untuk sukses,
`return { data: null, error: { code } }` untuk gagal.

Project ini JUGA pakai Eden Treaty (`@elysia/eden`) sebagai client
type-safe (§ ADR-0001) — dan Eden Treaty **punya wrapper `{data,error}`
sendiri di level client**, ditentukan dari HTTP status response (2xx →
body masuk `res.data`, non-2xx → body masuk `res.error` sebagai
`{status, value}`), independen dari bentuk body itu sendiri.

Akibatnya: kalau route SERVER return body `{data: payload, error: null}`,
maka `res.data` di CLIENT jadi `{data: payload, error: null}` juga
(objek respons server MASUK UTUH ke dalam `res.data`) — payload asli ada di
`res.data.data`, bukan `res.data`. Ini **double-wrap**, ditemukan pas
`app/landing/page.tsx` (Fase 01, M6) gagal runtime `plans.map is not a
function` — `res.data` ternyata `{data: [...], error: null}`, bukan array
langsung.

**Koreksi catatan sebelumnya**: Fase 00/awal Fase 01 sempat mencatat ini
sebagai "Eden Treaty gagal narrow union type dengan benar" (lihat
`docs/phases/phase-00-fondasi.md` & `phase-01-fondasi-produk.md` §
Keputusan Kecil, sudah dikoreksi juga di file itu) — diagnosis itu **salah**.
Bukan bug Eden, tapi konflik desain: dua lapis `{data,error}` bertumpuk.
TypeScript-nya memang gagal infer, tapi root cause-nya double-wrap, bukan
limitasi Eden untuk union narrowing secara umum (satu limitasi Eden yang
SUNGGUHAN & sempit tetap ada, khusus route `t.File()`/multipart — lihat
Konsekuensi).

## Decision
- **Route `apps/api` return PAYLOAD BARE** (langsung `plan`, `[...]`,
  `{ updated: n }`, dst) untuk sukses — TIDAK ADA manual
  `{ data: ..., error: null }` lagi.
- **Route return bare error object** (`{ code: "X", message?: "..." }`)
  untuk gagal, via `set.status = N; return {...}` atau `status(N, {...})`
  helper (macro) — TIDAK ADA manual `{ data: null, error: {...} }`.
- **Eden Treaty di client TETAP satu-satunya sumber envelope `{data,error}`**
  — `const { data, error } = await api.x.get()`, `data` = payload asli
  langsung kalau sukses, `error` = `{ status, value }` (`value` = body bare
  yang route kirim) kalau gagal.
- `app.onError()` (global, `app.ts`) ikut aturan sama — return bare
  `{ message, code }`, bukan `{data:null, error:{...}}}`.
- Untuk klien NON-Eden (curl, Postman, dst): body sukses = payload
  langsung, body gagal = `{code, message?}` langsung + HTTP status yang
  benar (401/403/404/409/422/500/dst) — status code ITU SENDIRI yang jadi
  penanda sukses/gagal, bukan field `error` di body.

## Alternatif yang Dipertimbangkan
- **Tetap manual `{data,error}` di server, unwrap manual di SETIAP
  consumer client** (`res.data.data`) — ditolak, ini yang menyebabkan bug
  ditemukan, dan kalau dibiarkan tiap file frontend baru rawan lupa unwrap
  ganda (persis kelas bug yang baru saja terjadi).
- **Matikan wrapper Eden, pertahankan wrapper manual** — tidak memungkinkan,
  wrapper `{data,error}` Eden adalah bagian inti cara kerja `treaty()`,
  bukan opsi yang bisa dimatikan.

## Konsekuensi
- SEMUA route yang sudah ditulis (Fase 00 & Fase 01) diperbaiki dalam sesi
  yang sama ADR ini ditulis: `settings.route.ts`, `media.route.ts`,
  `plans.route.ts`, `subscriptions.route.ts`, `admin/plans.route.ts`,
  `admin/users.route.ts`, `admin/subscriptions.route.ts`,
  `accurate.route.ts`, `lib/subscription-gate.ts`, `app.ts` (`onError`).
  Konsumen frontend (`media-library-modal.tsx`, `app/app/accurate/page.tsx`,
  `app/landing/page.tsx`) ikut diperbaiki, `as unknown as` yang tadinya
  dikira "workaround Eden bug" DIHAPUS (ternyata cuma nutupin double-wrap).
- `docs/architecture/architecture-api.md` § "Response Format" ditulis ulang
  — contoh lama (`{data,error}` manual di server) SALAH, diganti pola bare.
- `apps/api/CLAUDE.md` baris "Response selalu konsisten: `{ data, error }`
  — jangan return raw object tanpa wrapper" DIKOREKSI — justru SEBALIKNYA,
  return raw/bare object, wrapper `{data,error}` itu tanggung jawab Eden di
  client.
- **Satu limitasi Eden yang SUNGGUHAN & tetap ada** (bukan double-wrap):
  untuk route dengan body `t.File()` (multipart, `POST /media/upload`),
  Eden infer tipe sukses jadi `{}` kosong, walau body sukses SUDAH bare
  (diverifikasi: route JSON biasa seperti `GET /plans`, `POST /accurate/connect`
  infer BENAR tanpa perlu cast apa pun). Type assertion (`as`, SETELAH cek
  `res.error`) dipertahankan HANYA di titik ini, dengan komentar jelas kenapa
  — jangan generalisasi ke route lain.
- Fase 02 (Modul Pembelian) dan seterusnya WAJIB ikut pola bare payload ini
  sejak awal, jangan balik ke `{data,error}` manual.

## Referensi
- Detail teknis pola & contoh kode → `docs/architecture/architecture-api.md`
- ADR-0001 (kenapa Elysia+Eden dipilih) → `docs/decisions/adr-0001-pilih-stack.md`
