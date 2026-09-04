# ADR-0016: Admin-Provisioned Subscription — Expired Manual, Bukan Auto dari Plan Duration

**Status:** Accepted
**Tanggal:** 2026-09-04

## Context
ADR-0008 mendefinisikan dua jalur subscription: self-service (checkout →
`endAt` = `startAt + plan.durationDays`) dan admin-provisioned (admin buat
user + assign plan manual, tanpa payment). Implementasi jalur
admin-provisioned (`POST /admin/subscriptions`, Fase 10) SELALU menghitung
`endAt` otomatis dari `plan.durationDays` yang sama seperti self-service —
admin tidak punya cara memasukkan tanggal expired sendiri.

Ini jadi masalah nyata untuk kasus admin-provisioned yang justru paling
butuh fleksibilitas: klien korporat dengan kontrak di luar kelipatan
`durationDays` standar (mis. kontrak berakhir tanggal tertentu sesuai PO,
bukan "30 hari dari hari ini"), atau admin perlu memperpanjang/memperpendek
masa aktif subscription yang sudah berjalan tanpa membuat baris subscription
baru. Gap ini ditemukan lewat audit dokumentasi admin dashboard — tidak
tercatat sebagai keterbatasan sengaja di manapun (bukan revisit Known
Limitation Fase 10), murni belum dibangun.

## Decision
- **`POST /admin/subscriptions`**: `endAt` jadi field **wajib diisi manual**
  di body request (bukan lagi dihitung dari `plan.durationDays`). Admin
  input tanggal expired eksplisit tiap kali assign paket ke user.
  `plan.durationDays` TETAP dipakai apa adanya untuk jalur self-service
  (`architecture-subscription.md` § "Dua Jalur Registrasi" tidak berubah).
- **`PATCH /admin/subscriptions/:id`** (baru): edit `endAt` subscription
  yang `status = "active"` tanpa membuat baris baru — untuk kasus
  perpanjang/perpendek masa aktif. Dicatat di `audit_logs` (actorId,
  `endAt` lama & baru).
- Validasi: `endAt` WAJIB tanggal di masa depan relatif terhadap `startAt`
  (POST) atau terhadap waktu request (PATCH) — cegah admin salah input
  tanggal yang sudah lewat (subscription langsung expired begitu dibuat).
- UI `/admin/users` dialog "Kelola Langganan": tambah input tanggal wajib
  saat assign plan baru, plus aksi terpisah untuk edit `endAt` subscription
  aktif yang sudah ada.

## Alternatif yang Dipertimbangkan
- **Tetap auto dari `durationDays`, tambah field override opsional** —
  ditolak: dua sumber kebenaran (auto vs override) untuk hal yang sama
  bikin bingung admin mana yang berlaku, dan tidak menyelesaikan kasus
  kontrak yang tanggal awalnya sendiri sudah custom.
- **Buat subscription baru tiap kali perlu ubah `endAt`** (bukan endpoint
  PATCH) — ditolak: riwayat subscription (`GET /admin/subscriptions?userId=`)
  jadi penuh baris "koreksi tanggal" yang bukan pergantian paket sungguhan,
  menyulitkan audit riwayat langganan asli.

## Konsekuensi
- `plan.durationDays` untuk paket yang HANYA pernah dipakai admin-provisioned
  (tidak pernah lewat checkout) jadi sekadar informasi referensi di form
  admin (mis. hint "paket ini biasanya 30 hari"), bukan lagi otomatis
  diterapkan — admin bertanggung jawab penuh atas `endAt` yang diinput.
- Endpoint admin bertambah satu (`PATCH /admin/subscriptions/:id`), perlu
  permission `subscriptions.manage` yang sama dengan `POST`/`GET`.
- Job `EXPIRE_SUBSCRIPTIONS` (§ `architecture-jobs.md`) tidak berubah — tetap
  cek `endAt` yang lewat dari `subscriptions` apa adanya, tidak peduli
  asalnya dari checkout atau admin manual.

## Referensi
- Basis awal → `docs/decisions/adr-0008-model-langganan.md`
- Detail skema & endpoint → `docs/architecture/architecture-subscription.md`
- Phase doc → `docs/phases/phase-11-admin-subscription-expired-manual.md`
