# ADR-0032: Model Seat "User Tambahan" — Akses Seluruh Data Usaha, Bukan Granular Per-Modul

**Status:** Accepted
**Tanggal:** 2026-09-11

## Context

ADR-0008 (2026-08-19) mencatat "per-seat pricing" sebagai kemungkinan model
masa depan tanpa detail, ditunda ke ADR terpisah. Riset arsitektur awal
`architecture-user-tambahan.md` sempat mengusulkan skema akses **granular**:
tabel `member_module_grants` terpisah yang memetakan tiap seat ke daftar
modul spesifik yang boleh diakses (mis. member A cuma boleh modul Purchase
Invoice, member B boleh Purchase Invoice + Sales Invoice, walau Data Usaha
yang sama berlangganan 3 modul).

Sebelum eksekusi Fase 110, client dikonfirmasi ulang secara eksplisit soal
model bisnis nyata yang mereka mau (bukan asumsi dari riset awal):
1. 1 seat = terkunci PERMANEN ke 1 Data Usaha (tidak bisa pindah).
2. **Akses seat = SEMUA fitur yang SEDANG AKTIF di Data Usaha itu** — kalau
   Data Usaha berlangganan 3 modul, seat itu otomatis dapat akses ke
   ketiganya, bukan dipilih satu-satu oleh pemilik.
3. Seat reassignable (revoke → invite orang baru ke slot sama, durasi ikut
   slot bukan ikut orang).
4. 1 orang boleh jadi seat di banyak Data Usaha berbeda (skenario akuntan
   pegang banyak klien).

Poin 2 ini yang menghapus kebutuhan `member_module_grants` — client secara
eksplisit TIDAK meminta kontrol granular per-modul untuk seat.

## Decision

- **TIDAK ADA tabel `member_module_grants` atau kolom grant per-modul apa
  pun.** Akses seat murni fungsi dari `member_seats.dataUsahaId` +
  `status = 'active'` — begitu Data Usaha itu berlangganan modul baru,
  SEMUA seat aktifnya otomatis ikut dapat akses tanpa aksi tambahan dari
  pemilik (tidak perlu re-grant per modul per seat).
- **Tabel `member_seats`** (bukan tabel grant): `dataUsahaId` (NOT NULL,
  terkunci permanen), `seatSubscriptionId` (1:1 ke subscription
  `seat_addon` yang mengaktifkan slot — expiry seat otomatis ikut expiry
  subscription ini via job `EXPIRE_SUBSCRIPTIONS` yang sudah ada, tidak
  perlu job baru), `memberUserId` nullable (diisi setelah invite accepted),
  `status`: `available | invited | active`.
- **Query akses** (`lib/subscription-gate.ts`
  `getAccessibleSubscriptionsWithPlans`): UNION subscription yang
  Data-Usaha-nya DIMILIKI user (`getOwnedSubscriptionsWithPlans`) dengan
  subscription di Data Usaha tempat user punya seat `active`. Member yang
  sama otomatis kehilangan akses ke SEMUA modul begitu seat-nya di-revoke
  (bukan modul-per-modul).
- **Owned vs Accessible dipisah jadi 2 fungsi** (bukan 1 fungsi lama
  `getActiveSubscriptionsWithPlans` yang di-union naif) — `getOwnedSubscriptionsWithPlans`
  dipakai untuk keputusan OTORISASI/MUTASI (mis. `accurate.route.ts`
  `POST /connect`/`POST /reuse`, checkout, trial), `getAccessibleSubscriptionsWithPlans`
  untuk keputusan AKSES/TAMPILAN (`moduleAccess` macro, `/me/subscriptions`,
  `GET /accurate/subscriptions`). Ini BUKAN bagian dari model bisnis seat
  itu sendiri, tapi konsekuensi teknis wajib supaya seat tidak jadi jalur
  privilege escalation (member bisa hijack konfigurasi Accurate) — detail
  di `docs/phases/phase-110-user-tambahan-seat.md` § "Keputusan Kecil".
- **Gating akses SEKARANG baca kepemilikan Data Usaha SAAT INI
  (`data_usaha.userId`), bukan `subscriptions.userId`** — perbaikan pondasi
  yang sengaja dilakukan di fase ini (bukan ditunda ke Fase 111 transfer
  kepemilikan) supaya begitu `data_usaha.userId` jadi mutable (transfer),
  gating akses otomatis ikut benar tanpa migrasi ulang logic.

## Alternatif yang Dipertimbangkan

- **Grant granular per-modul per-seat** (`member_module_grants`) — ditolak.
  Client eksplisit tidak butuh ini; menambah 1 tabel + 1 lapis query join
  ekstra ke SETIAP pengecekan akses tanpa nilai bisnis nyata saat ini. Kalau
  kebutuhan ini muncul nanti (mis. seat "read-only" atau seat dibatasi 1
  modul saja), révisit lewat ADR baru — jangan retrofit diam-diam ke skema
  `member_seats` yang sudah Accepted.
- **Seat bisa pindah Data Usaha** — ditolak, client eksplisit minta
  permanen. Kalau mau akses Data Usaha lain, itu seat/invite terpisah (1
  orang boleh py banyak seat di banyak Data Usaha berbeda, ini yang DIPAKAI
  untuk skenario akuntan multi-klien, bukan 1 seat yang berpindah-pindah).
- **1 fungsi query gabungan (Owned ∪ Accessible langsung)** — ditolak
  setelah ditemukan celah privilege escalation konkret: `accurate.route.ts`
  `POST /connect`/`POST /reuse` memakai fungsi lama untuk OTORISASI MUTASI;
  kalau di-union naif dengan akses-via-seat, member bisa kirim
  `subscriptionId` Data Usaha tempat dia numpang dan mengambil-alih/mengubah
  koneksi Accurate Data Usaha itu — padahal seat cuma untuk PAKAI modul,
  bukan kelola integrasi. Dipisah jadi 2 fungsi bernama eksplisit.

## Konsekuensi

- Skema baru: `plans.kind` (`module | seat_addon`), tabel `member_seats`
  (lihat `docs/architecture/architecture-user-tambahan.md` untuk detail
  kolom lengkap).
- `seat_addon` adalah SKU biasa di tabel `plans` yang sudah ada (bukan
  konsep pricing terpisah) — dibeli lewat jalur checkout yang sama (`planIds`
  array, quantity N seat = planId yang sama dikirim N kali), TIDAK PERNAH
  lewat jalur trial (`plans.trialEligible` dipaksa `false` untuk `kind ===
  "seat_addon"`, dicek juga eksplisit di endpoint trial sebagai
  defense-in-depth).
- Revoke TIDAK menghapus baris `member_seats` — reset ke `available`,
  histori (`revokedAt`/`revokedBy`) tetap ada, slot siap di-invite ulang ke
  orang baru dengan `seatSubscriptionId` yang SAMA (sisa durasi ikut slot).
- Kalau nanti ada kebutuhan akses granular per-modul untuk seat (bukan
  "semua fitur Data Usaha"), itu PERUBAHAN MODEL BISNIS yang butuh ADR baru
  (supersede ADR ini), bukan tambahan kolom diam-diam ke `member_seats`.

## Referensi
- Detail skema & flow lengkap → `docs/architecture/architecture-user-tambahan.md`
- Model langganan dasar → `docs/decisions/adr-0008-model-langganan.md`
- Rewrite gating akses (Owned vs Accessible) → `docs/phases/phase-110-user-tambahan-seat.md`
