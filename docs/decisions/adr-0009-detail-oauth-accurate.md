# ADR-0009: Detail Alur OAuth Accurate & Batasan 1 Subscription = 1 Akun

**Status:** Accepted
**Tanggal:** 2026-08-19

## Context
ADR-0006 menetapkan bahwa Facport WAJIB integrasi OAuth ke Accurate Online,
tapi menuliskan asumsi generik "tukar authorization code → access token
server-to-server". User memberi contoh alur nyata & contoh URL otorisasi
Accurate:
```
https://account.accurate.id/oauth/login.do
https://account.accurate.id/oauth/authorize?response_type=token&client_id=...
  &redirect_uri=https://facport.com/aol-integration/auth/callback/{id}
  &scope=item_view item_save item_category_view ...
```
Parameter `response_type=token` (bukan `response_type=code`) mengindikasikan
Accurate mungkin pakai **OAuth Implicit Grant**, bukan Authorization Code
Grant seperti diasumsikan ADR-0006 — ini beda signifikan secara teknis
(token dikembalikan langsung di redirect, kemungkinan tanpa refresh token).
User juga menegaskan **satu subscription Facport cuma boleh terhubung ke
satu akun Accurate**, dan bahwa detail exact tetap **harus diverifikasi ke
dokumentasi resmi developer Accurate** sebelum implementasi — contoh yang
diberikan bukan spesifikasi final.

Ini bukan membatalkan ADR-0006 (integrasi OAuth + background job import
tetap keputusan yang benar), tapi **meralat/mempertajam detail teknis** dan
menambah **satu batasan bisnis baru** yang tidak ada di ADR-0006 — cukup
signifikan untuk dicatat sebagai ADR sendiri, bukan diam-diam edit ADR-0006
yang sudah Accepted.

## Decision
1. **Grant type tetap harus diverifikasi ke docs resmi sebelum coding** —
   TIDAK diasumsikan implicit grant murni hanya dari satu contoh URL. Kalau
   Accurate menyediakan pilihan `response_type=code` (authorization code
   grant), **itu yang dipilih** (lebih aman, token tidak lewat browser).
   Implicit grant (`response_type=token`) cuma dipakai kalau memang
   satu-satunya opsi yang didukung Accurate.
2. **Desain callback route mendukung kedua kemungkinan**: token bisa datang
   sebagai URL fragment (butuh halaman client-side yang baca
   `window.location.hash` lalu POST ke backend) atau query param (server
   baca langsung). Detail lengkap → `architecture-accurate-integration.md` § 1.
3. **1 subscription = 1 akun Accurate** — `accurate_connections` di-relasikan
   ke `subscriptions.id` dengan **unique constraint**, BUKAN ke `users.id`
   langsung. User yang butuh kelola >1 company Accurate WAJIB punya >1
   subscription (masing-masing subscription dibayar terpisah).
4. **Scope OAuth yang diminta mengikuti modul di paket langganan** —
   `plans.modules` menentukan scope apa yang di-request saat inisiasi OAuth
   (prinsip least-privilege), bukan minta semua scope yang tersedia secara
   default.
5. **State token WAJIB digenerate Facport sendiri** untuk CSRF protection &
   korelasi callback ↔ subscription yang menginisiasi — terlepas dari
   identifier apa pun yang mungkin sudah ada di pola redirect URI Accurate.

## Alternatif yang Dipertimbangkan
- **Asumsikan langsung implicit grant dari satu contoh URL, mulai coding
  tanpa verifikasi** — ditolak, user eksplisit bilang "semua tergantung
  tutorial developer di Accurate... ini hanya alur contoh". Membangun di
  atas asumsi yang belum diverifikasi berisiko rework besar di Fase 01.
- **1 subscription boleh terhubung ke banyak akun Accurate** — ditolak,
  bertentangan langsung dengan constraint yang diberikan user dan dengan
  cara kerja akun Accurate sendiri (1 akun = 1 company/1 user internal).

## Konsekuensi
- `docs/architecture/architecture-accurate-integration.md` § 1 ditulis
  ulang total dengan hedging eksplisit ("verifikasi ke docs resmi") dan
  skema `accurateConnections.subscriptionId` (unique) menggantikan
  `userId`.
- `import_batches` nambah kolom `subscriptionId` (menentukan koneksi
  Accurate mana yang dipakai untuk batch itu).
- Setup OAuth (`accurate_connections` + skeleton connect) **dipindah dari
  Fase 00 ke Fase 01** (`docs/phases/phase-01-fondasi-produk.md`) karena
  sekarang secara struktural bergantung pada `subscriptions` (konsep Fase
  01), bukan lagi berdiri sendiri di fondasi teknis.
- Sebelum mulai coding OAuth di Fase 01: WAJIB baca ulang
  https://account.accurate.id/developer/api-docs.do dan konfirmasi
  grant type + format response sebenarnya — checklist ini ditambahkan ke
  `docs/phases/phase-01-fondasi-produk.md`.

## Referensi
- ADR-0006 (integrasi Accurate secara umum, masih berlaku) →
  `docs/decisions/adr-0006-integrasi-accurate-api.md`
- Detail teknis lengkap → `docs/architecture/architecture-accurate-integration.md`
- Model langganan & scope per plan → `docs/architecture/architecture-subscription.md`
