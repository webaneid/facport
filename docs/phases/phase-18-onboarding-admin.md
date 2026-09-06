# Fase 18 — Unifikasi Onboarding Admin

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase TERAKHIR dari rencana 5-fase (14-18) penguatan fondasi komersial.
Admin bikin user baru sekarang bisa SEKALIAN pilih sub-modul, dengan 2
hasil akhir: "Kirim Invoice" (customer bayar sendiri lewat alur manual
Fase 16) atau "Tandai Sudah Dibayar" (aktivasi langsung, kontrak
korporat/transfer di luar sistem). Email selamat datang otomatis lewat
job queue, gantikan relay password manual admin yang terjadi sekarang.

Referensi: `docs/architecture/architecture-subscription.md` §
"Admin-Provisioned" (diupdate fase ini), `docs/decisions/adr-0022-payment-manual-qris-transfer.md`.

## Scope
- [x] `apps/api/src/lib/invoice-order.ts` (baru) — ekstrak logic bikin
      invoice+items+order dari `subscriptions.route.ts` (checkout, Fase
      16), dipakai ULANG di `admin/users.route.ts` ("Kirim Invoice")
- [x] `apps/api/src/lib/manual-subscription.ts` (baru) — versi BATCH dari
      pola admin-provisioned (`admin/subscriptions.route.ts`, Fase 01/11)
      — endAt DIHITUNG OTOMATIS dari `plan.durationDays` (bukan input
      manual), dipakai "Tandai Sudah Dibayar"
- [x] `apps/api/src/routes/admin/users.route.ts` — `POST /admin/users`
      terima `planIds?: uuid[]`, `markAsPaid?: boolean` opsional. Validasi
      plan SEBELUM bikin user (cegah user "yatim" kalau planId salah).
      Email selamat datang (kredensial + link relevan) lewat job queue
      `SEND_EMAIL` (pola sama `lib/auth.ts` `sendVerificationEmail`)
- [x] `apps/web/app/admin/(protected)/users/page.tsx` — `AddUserDialog`
      tambah step centang sub-modul (fetch `GET /admin/plans`) + toggle
      "Tandai Sudah Dibayar", hasil akhir tampilkan invoiceId/orderId
      ATAU jumlah subscription yang langsung aktif
- [x] `docs/architecture/architecture-subscription.md` § "Admin-Provisioned"
      — update, sekalian koreksi bagian yang sudah stale (alur "kirim
      email undangan set-password vs set password langsung" yang
      sebenarnya TIDAK PERNAH diimplementasikan begitu — password SELALU
      digenerate+dikembalikan di response sejak Fase 01)

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md`,
  `docs/architecture/architecture-payment.md`
- ADR: tidak ada ADR baru fase ini — reuse pola invoice (ADR-0021) dan
  admin-provisioned (ADR-0016) yang sudah ada, tidak ada keputusan
  arsitektur besar baru

## Keputusan Kecil Selama Eksekusi
- **`markAsPaid` divalidasi permission `subscriptions.manage` SEBELUM
  write apa pun** (bukan cuma `users.manage`) — ditemukan security review
  sebagai gap High: role custom yang punya `users.manage` tapi bukan
  `subscriptions.manage` bisa mengaktifkan subscription gratis lewat
  jalur admin/users, melewati batas otorisasi yang sengaja ditegakkan
  `POST /admin/subscriptions` (ADR-0016). Dicek paling awal di handler,
  SEBELUM user dibuat, supaya gagal-cepat tanpa efek samping.
- **Logic invoice+order diekstrak ke `lib/invoice-order.ts`** (dipakai
  checkout customer Fase 16 DAN admin route ini) — `billToName` jadi
  parameter (bukan selalu baca dari tabel `user`), karena versi admin
  butuh nama yang baru diinput admin (user belum ada saat invoice mulai
  dibuat), sedangkan versi customer baca dari user yang sudah login.
- **`createManualSubscriptions` (jalur "Tandai Sudah Dibayar") TIDAK
  reuse endpoint `POST /admin/subscriptions` yang sudah ada** — endpoint
  itu minta `endAt` manual per-request (cocok untuk 1 subscription
  ad-hoc), sedangkan jalur ini perlu N subscription sekaligus dengan
  `endAt` OTOMATIS dari `plan.durationDays` masing-masing (durasi beda
  per plan). Dibuat helper batch terpisah `lib/manual-subscription.ts`,
  endpoint lama `POST /admin/subscriptions` TIDAK diubah/dihapus (dipakai
  kasus "tambah 1 subscription ke user existing dengan endAt custom").
- **Password tetap digenerate+dikembalikan di response** (bukan flow
  "set password sendiri lewat email") — sesuai pola yang sudah ada sejak
  Fase 01 (diverifikasi dari kode nyata, bukan asumsi rencana awal yang
  menyebut "email undangan set-password"). Email selamat datang HANYA
  menambah pengiriman otomatis kredensial ini lewat job queue,
  menggantikan relay password manual admin — tidak mengubah mekanisme
  perolehan password itu sendiri.
- **`lib/email.ts` ditambah flag `sensitive`** — ditemukan security
  review sebagai gap Medium: dev-no-op fallback (RESEND_API_KEY kosong)
  sebelumnya log seluruh `html` termasuk temp password plaintext. Flag
  ini membuat fallback dev cuma log `to`/`subject` untuk email sensitif.
- **`escapeHtml()` ditambah untuk nama user/plan di template email** —
  gap Medium security review: `body.name` (input admin bebas) di-inject
  langsung ke HTML tanpa escape, celah HTML injection di email.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — via subagent `security-auditor`
      (route admin + 2 lib baru + refactor checkout, lintas modul)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 1
      High (bypass permission `markAsPaid`) diperbaiki langsung
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — 2 Medium (HTML injection email, password plaintext di
      log dev) diperbaiki langsung, dicatat di lessons-learned sebagai
      referensi pola untuk fase mendatang
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Force-change-password di login pertama BELUM diimplementasi** —
  password sementara tetap berlaku sampai user ganti manual sendiri
  (gap sejak Fase 01, TIDAK diselesaikan fase ini, di luar scope).
- **Verifikasi UI browser sungguhan BELUM dilakukan** (ekstensi Chrome
  tidak tersedia sesi ini, sama seperti Fase 14-17).
- **Email selamat datang belum dites kirim SUNGGUHAN** (RESEND_API_KEY
  kosong di dev = no-op log, § `lib/email.ts`) — isi HTML/link
  diverifikasi lewat kode + test (job payload benar), BUKAN preview
  email nyata di inbox.

## Ringkasan Hasil
`POST /admin/users` sekarang jadi jalur onboarding tunggal: admin bisa
bikin user SEKALIGUS pilih sub-modul (`planIds`), dengan 2 hasil akhir
yang mutually-exclusive — "Kirim Invoice" (default, `markAsPaid` tidak
diisi/`false`) membuat 1 invoice + N invoice item + 1 order berstatus
normal (`unpaid`/`pending`), customer login lalu bayar sendiri lewat alur
manual Fase 16 yang sudah ada (`/billing/{orderId}/pay`) — TIDAK ada
subscription yang dibuat sampai admin/customer konfirmasi bayar; "Tandai
Sudah Dibayar" (`markAsPaid: true`, kontrak korporat/transfer di luar
sistem) langsung membuat N subscription `active` dengan `endAt` dihitung
otomatis per plan (`durationDays` masing-masing bisa beda), TANPA invoice
atau order sama sekali.

Logic pembuatan invoice+order diekstrak dari checkout customer (Fase 16)
ke `lib/invoice-order.ts` (`createInvoiceAndOrder`), dipakai ulang oleh
admin route dengan `billToName` sebagai parameter (bukan selalu dari
tabel `user`) karena user baru belum ada saat invoice mulai dibuat.
Jalur "Tandai Sudah Dibayar" pakai helper batch baru
`lib/manual-subscription.ts` (`createManualSubscriptions`), BUKAN reuse
`POST /admin/subscriptions` existing (endpoint itu didesain untuk 1
subscription dengan `endAt` manual, bukan N subscription dengan durasi
per-plan) — endpoint lama tetap ada tak berubah untuk kasus tambah 1
subscription ke user existing.

Security review (subagent `security-auditor`) menemukan 1 High: jalur
`markAsPaid` cuma dijaga permission `users.manage`, padahal ini pada
dasarnya mengaktifkan akses berbayar secara gratis — celah bagi role
custom (mis. "staf onboarding") yang punya `users.manage` tapi bukan
`subscriptions.manage`, melewati batas otorisasi yang sengaja ditegakkan
ADR-0016 di `POST /admin/subscriptions`. Diperbaiki dengan menambah cek
`subscriptions.manage` di awal handler, SEBELUM user dibuat — regression
test khusus ditambahkan (role custom dengan `users.manage` saja ditolak
403 `FORBIDDEN_MARK_AS_PAID`, user target TIDAK ikut terbuat). 2 Medium
juga ditemukan & diperbaiki: HTML injection di email selamat datang
(nama user/plan tidak di-escape) — fix `escapeHtml()`; dan potensi
plaintext temp password ikut ter-log di fallback dev `lib/email.ts` saat
`RESEND_API_KEY` kosong — fix flag `sensitive` yang menyembunyikan `html`
dari log untuk email sensitif.

`architecture-subscription.md` § "Admin-Provisioned" diperbaiki
sekaligus dari deskripsi yang sudah stale — dokumen lama menyebut alur
"email undangan set-password vs set password langsung" yang ternyata
TIDAK PERNAH diimplementasikan seperti itu (password SELALU digenerate
+dikembalikan di response sejak Fase 01, diverifikasi dari kode
langsung sebelum menulis ulang bagian ini, bukan diasumsikan dari
rencana awal).

Test: 7 test baru di `admin/users.route.test.ts` (perilaku lama tanpa
planIds tidak berubah, `PLAN_NOT_FOUND` mencegah user yatim, jalur Kirim
Invoice, jalur Tandai Sudah Dibayar dengan durasi berbeda per plan, 403
non-admin, regression bypass permission, markAsPaid tetap jalan normal
untuk role dengan permission lengkap). Suite penuh apps/api setelah fix:
151 pass, 2 skip (gap environment MinIO lokal dari Fase 16, bukan bug
fase ini), 0 fail. Typecheck 0 error (apps/api & apps/web).

**Fase 14-18 (rencana 5-fase penguatan fondasi komersial) SELESAI
SEMUA** — belum ada Fase 19 di rencana yang disetujui; lanjut ke modul
baru (Sales Receipt/Purchase Payment/Journal Voucher) atau fase lain
butuh instruksi baru dari user.
