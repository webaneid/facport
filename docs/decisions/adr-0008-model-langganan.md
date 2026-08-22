# ADR-0008: Model Langganan (Subscription) — Self-Service + Admin-Provisioned

**Status:** Accepted
**Tanggal:** 2026-08-19

## Context
Facport bukan aplikasi gratis — akses ke modul impor (Penjualan, Pembelian,
dst) ditentukan oleh paket langganan yang aktif. Ada dua jalur user masuk
ke sistem:
1. **Self-service**: user daftar sendiri lewat `app.facport.com/register`
   → pilih paket → bayar → langganan aktif.
2. **Admin-provisioned**: tim FAC Institute buat akun user langsung dari
   admin dashboard (mis. untuk klien korporat yang deal-nya di luar flow
   self-service) — tanpa perlu user isi form registrasi sendiri.

Paket (`plan`) membedakan modul apa saja yang bisa diakses (mis. paket
"Penjualan" cuma boleh akses modul Penjualan, paket "Semua Modul" akses
penuh) dan harga/durasi berbeda-beda.

## Decision
- **Tabel `plans`**: nama, harga (integer Rupiah), durasi (hari), daftar
  modul yang termasuk (`["penjualan", "pembelian", ...]`), status aktif.
  Dikelola dari admin dashboard (CRUD), bukan hardcode di kode.
- **Tabel `subscriptions`**: relasi user ↔ plan, status
  (`pending_payment` | `active` | `expired` | `cancelled`), `startAt`/`endAt`,
  terhubung ke `orders` (§ `architecture-payment.md`) lewat `orderId`.
- **Registrasi ganda**: self-register (WAJIB verifikasi email sebelum bisa
  checkout) ATAU dibuat admin (`status` user langsung `verified`, admin yang
  bertanggung jawab atas validitas data — dicatat siapa admin yang buat via
  `audit_logs`, § `architecture-security.md` §11).
- **Gating akses modul**: middleware `requireModuleAccess(moduleKey)` di
  tiap endpoint import (Fase 01 dst) — cek subscription user berstatus
  `active` DAN `moduleKey` ada di `plan.modules`. Ini LAPISAN TERPISAH dari
  RBAC permission (§ `architecture-auth.md`) — permission jawab "kamu boleh
  ngapain di sistem", subscription gate jawab "paket kamu termasuk modul
  ini atau tidak". Keduanya WAJIB lolos, bukan salah satu.
- **Downgrade otomatis saat expired**: job terjadwal harian (§
  `architecture-jobs.md`) cek `subscriptions.endAt` yang sudah lewat, ubah
  status jadi `expired` — bukan cuma dicek real-time saat request masuk
  (supaya status konsisten di database, ketahuan juga dari admin dashboard
  tanpa perlu ada request aktif dari user itu).

## Alternatif yang Dipertimbangkan
- **Per-seat pricing** (harga per user, bukan per-paket/modul) — belum
  dibutuhkan di scope awal, dicatat sebagai kemungkinan model masa depan,
  TIDAK diimplementasikan sekarang (kalau nanti dibutuhkan, ADR baru).
- **Auto-renew otomatis** (charge otomatis pakai kartu/VA tersimpan) —
  ditunda, nambah kompleksitas (simpan payment method token, PCI-scope
  considerations). Fase awal: subscription expired → user checkout ulang
  manual. Revisit lewat ADR baru kalau dibutuhkan.
- **Trial gratis otomatis** — tidak disebutkan user, tidak diasumsikan;
  kalau dibutuhkan nanti, tambahkan sebagai field `plans.trialDays` lewat
  keputusan terpisah.

## Konsekuensi
- Skema baru Fase 00: `plans`, `subscriptions` (lihat
  `docs/architecture/architecture-subscription.md` untuk detail kolom).
- Endpoint admin: CRUD `plans`, create user manual (lihat §
  `architecture-domain-routing.md` untuk guard `admin.facport.com`).
- Endpoint app: checkout (pilih plan → create order → redirect payment),
  webhook payment update `subscriptions.status` jadi `active` (§
  `architecture-payment.md`).
- Job terjadwal baru: `EXPIRE_SUBSCRIPTIONS` (§ `architecture-jobs.md`).
- Provider payment (Ipaymu/Xendit) masih belum final (§
  `architecture-payment.md`) — flow checkout di atas menunggu keputusan itu
  sebelum endpoint payment beneran diimplementasi, tapi skema `plans`/
  `subscriptions` tidak bergantung pada provider mana yang dipilih.

## Referensi
- Detail skema & flow lengkap → `docs/architecture/architecture-subscription.md`
- Payment & orders → `docs/architecture/architecture-payment.md`
- Surface app.facport.com → `docs/architecture/architecture-domain-routing.md`
- RBAC vs subscription gate → `docs/architecture/architecture-auth.md`
