# ADR-0018: Sidebar Nav & Dashboard Difilter oleh Modul Langganan (Bukan Statis)

**Status:** Accepted
**Tanggal:** 2026-09-04

## Context
Sampai Fase 12, `apps/web` cuma punya 1 modul transaksi aktif (Purchase
Invoice) — sidebar nav (`NAV_ITEMS_BY_SURFACE.app`,
`components/app-shell/sidebar.tsx`) dan dashboard home
(`app/app/(protected)/page.tsx`, widget "Import Terakhir") keduanya
**hardcoded statis** ke Purchase Invoice, tidak peduli modul apa yang
sebenarnya tercakup di plan langganan customer.

Client sekarang minta 5 sub-modul aktif (Sales Invoice, Purchase Invoice,
Customer/Sales Receipt, Purchase Payment, Jurnal Umum) — dan model bisnis
langganan **per-modul** (1 harga = 1 modul = 1 user, dikonfirmasi user
2026-09-04): customer BEDA bisa saja cuma berlangganan sebagian modul,
bukan semua. Nav statis yang menampilkan SEMUA menu ke SEMUA customer
(padahal cuma sebagian yang benar-benar bisa dipakai — sisanya bakal
ditolak `moduleAccess` gate begitu diklik) jadi UX yang membingungkan dan
tidak scalable begitu jumlah modul bertambah dari 1 ke 5.

## Decision
- **Tiap modul transaksi (Sales Invoice, Purchase Invoice, dst) dapat
  MENU SENDIRI** di sidebar (bukan digabung jadi satu widget/tabel lintas
  modul) — konsisten dengan cara customer mikirnya ("saya langganan
  modul X", bukan "saya langganan 1 dashboard gabungan").
- **`NavItem` dapat field baru `moduleKey?: string`** (§
  `components/app-shell/sidebar.tsx`) — item TANPA `moduleKey` (Dashboard,
  Koneksi Accurate, item admin) selalu tampil; item DENGAN `moduleKey`
  cuma tampil kalau `moduleKey` ada di `plan.modules` subscription AKTIF
  customer.
- **`app/app/(protected)/layout.tsx`** (Server Component) sekarang ikut
  fetch `/me/subscription` (sebelumnya cuma `/me` buat cek role), extract
  `plan.modules`, oper sebagai prop baru `subscriptionModules: string[]`
  ke `AppShell` → `Sidebar`.
- **Dashboard home** (`app/app/(protected)/page.tsx`) — tiap widget
  "Import Terakhir per modul" (Purchase Invoice, Sales Invoice, dst)
  render KONDISIONAL berdasarkan `subscriptionModules`, BUKAN selalu
  tampil. Purchase Invoice yang SEBELUMNYA unconditional ikut digating
  juga (retroaktif) — konsistensi, bukan cuma modul baru yang di-gate.
- Customer TANPA subscription aktif sama sekali (`subscriptionModules`
  kosong) TIDAK melihat menu modul transaksi apa pun — cuma Dashboard
  (kosong/empty-state "belum berlangganan") + Koneksi Accurate.

## Alternatif yang Dipertimbangkan
- **1 widget/tabel "Import Terakhir" gabungan lintas modul** (kolom
  "Modul" pembeda) — ditolak eksplisit oleh user: model bisnis per-modul
  bikin tiap modul lebih pas diperlakukan sebagai area fitur TERPISAH
  (menu sendiri), bukan satu pandangan gabungan.
- **Nav tetap statis, cuma andalkan `moduleAccess` 403 saat submit** —
  ditolak: customer akan lihat & klik menu yang ternyata tidak bisa
  dipakai sama sekali (baru tahu setelah gagal), UX buruk terutama makin
  banyak modul yang di-listing tapi tidak relevan buat mayoritas customer.

## Konsekuensi
- Setiap modul baru (Purchase Payment, Sales/Customer Receipt, Jurnal
  Umum — direncanakan fase-fase berikutnya) WAJIB daftarkan `moduleKey`
  di nav item-nya sejak awal, bukan ditunda — pola ini jadi konvensi
  baku, bukan kasus khusus Sales Invoice.
- `layout.tsx` app surface nambah 1 fetch lagi ke `/me/subscription` per
  page load (Server Component, tidak nambah round-trip browser) — biaya
  kecil, konsisten dengan pola fetch server-side yang sudah ada di layout
  yang sama untuk `/me`.
- Dashboard home jadi py lebih banyak percabangan kondisional (1 blok
  per modul aktif) — diterima, alternatifnya (satu tabel gabungan)
  sudah ditolak eksplisit di atas.

## Referensi
- Phase doc → `docs/phases/phase-13-sales-invoice.md`
- Pola modul & gating → `docs/architecture/architecture-subscription.md`
  § "Gating Akses Modul"
