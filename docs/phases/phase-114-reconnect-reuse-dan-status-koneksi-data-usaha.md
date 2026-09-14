# Fase 114 — Reconnect Bisa Reuse Koneksi + Status "Terhubung Accurate" di /pilih-usaha Dibetulkan

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
Ditemukan saat debugging 2 customer production nyata (Untung Suroto, Eka —
detail `docs/lessons-learned.md` entri 2026-09-14): tombol "Hubungkan
Ulang" di halaman Koneksi Accurate selalu OAuth penuh baru, tidak pernah
menawarkan reuse koneksi yang sudah ada untuk Data Usaha yang sama —
membuat koneksi Accurate customer numpuk (5-17 koneksi terpisah ke company
yang SAMA). Terpisah, gerbang `/pilih-usaha` sering salah lapor "Belum
terhubung Accurate" karena baca kolom `data_usaha.accurate_connection_id`
yang sudah mati sejak Fase 14 (pointer koneksi sebenarnya sudah pindah ke
`subscriptions.accurateConnectionId`).

## Scope
- [x] Backend `POST /accurate/reuse` — terima `reconnect` opsional, bypass
      guard 409 kalau true (pola sama `/accurate/connect`).
- [x] Backend `GET /me/data-usaha` — hitung status "connected" dari JOIN
      live `subscriptions`→`accurateConnections`, bukan baca kolom mati
      `dataUsaha.accurateConnectionId`.
- [x] Frontend `accurate-connections-form.tsx` — tombol "Pakai Koneksi
      yang Sudah Ada" muncul juga di kartu status sehat & rusak (reconnect),
      bukan cuma first-connect.
- [x] Frontend `pilih-usaha-form.tsx` — pakai field `connected: boolean`
      baru, bukan `accurateConnectionId`.
- [x] Test baru: reuse-dengan-reconnect (backend), status connected live
      (backend) — regression test persis untuk bug yang dilaporkan.
- [x] Typecheck 0 error.
- [x] Security review (subagent `security-auditor`) — 1 Medium + 1 Low
      ditemukan, KEDUANYA DIPERBAIKI langsung (bukan ditunda).
- [x] Update `docs/lessons-learned.md` — tandai 2 gap RESOLVED.

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`,
  `docs/architecture/architecture-user-tambahan.md` § Fase B2
- Plan lengkap: `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`
- Root cause & temuan asli: `docs/lessons-learned.md` entri 2026-09-14

## Keputusan Kecil Selama Eksekusi
- **Scope Bug 2 diperkecil SENGAJA**: TIDAK drop kolom
  `data_usaha.accurate_connection_id` (butuh migration schema) — cukup
  ubah logic `GET /me/data-usaha` supaya berhenti membaca kolom mati itu.
  Full fix untuk gejala yang dilaporkan, risiko jauh lebih rendah untuk
  production yang baru saja diperbaiki manual hari ini. Kolom dibiarkan
  ada (dead), dicatat Known Limitation.
- **Temuan security review Medium DIPERBAIKI, bukan ditunda**: `POST
  /accurate/reuse` ternyata TIDAK PERNAH validasi bahwa `connectionId`
  yang di-reuse sebelumnya dipakai Data Usaha yang SAMA dengan subscription
  target — user dengan >1 Data Usaha (kasus sah) bisa salah kirim
  connectionId Data Usaha lain, lolos ownership check (sama-sama
  miliknya), tapi bisa bikin data import kekirim ke company Accurate yang
  SALAH — kelas bug persis yang baru saja diperbaiki manual di production
  hari ini. Ditambah guard baru: `CONNECTION_DATA_USAHA_MISMATCH` (400)
  kalau connection yang diminta belum pernah dipakai subscription lain di
  Data Usaha yang sama.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 Critical/High
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — TIDAK ditunda, keduanya langsung diperbaiki
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `data_usaha.accurate_connection_id` TETAP ada di schema tapi makin dead
  (cuma pernah ditulis backfill script one-time, tidak pernah lagi). Aman
  dibiarkan (tidak dibaca lagi setelah fase ini), tapi migration cleanup
  (drop kolom) belum dikerjakan — fase terpisah kalau mau beres-beres
  schema, bukan prioritas sekarang.
- Deploy ke production TIDAK bagian fase ini (manual, terpisah, lihat
  `docs/architecture/architecture-deployment.md`) — fase ini cuma sampai
  commit+push ke `develop` & verifikasi test suite lokal. **PENTING saat
  deploy nanti**: `accurate.route.ts` di-import `workers/index.ts`
  (dipakai job import) — WAJIB pakai runbook **Full** (restart worker
  juga), BUKAN Minimal, sesuai pola kesalahan yang sudah 2x kejadian di
  project ini (§ lessons-learned.md 2026-09-09/10).

## Ringkasan Hasil
2 gap kode dari temuan debugging production hari ini sudah diperbaiki:

1. **`POST /accurate/reuse` sekarang mendukung reconnect** — terima
   `reconnect: boolean` opsional yang melewati guard 409 ALREADY_CONNECTED
   (pola identik `/accurate/connect` sejak Fase 91). Tombol "Pakai Koneksi
   yang Sudah Ada" di frontend (`accurate-connections-form.tsx`) sekarang
   muncul di SEMUA status kartu (sehat/rusak/belum ada), bukan cuma
   first-connect — `SubscriptionConnectionCard` direstrukturisasi supaya
   picker reuse jadi early-return top-level, dipicu dari mana saja.

2. **`GET /me/data-usaha` hitung status koneksi LIVE** — join
   `subscriptions`→`accurateConnections` (cek ada yang `status:"active"`),
   bukan lagi baca kolom mati `data_usaha.accurate_connection_id`. Field
   response berubah dari `accurateConnectionId: string|null` jadi
   `connected: boolean` (lebih jujur, tidak menyiratkan ada ID koneksi
   spesifik di level Data Usaha — yang memang bukan invarian yang berlaku
   lagi sejak ADR-0020).

Security review menemukan 1 Medium (reuse tanpa validasi Data-Usaha-match
— bisa salah kirim data import ke company yang salah untuk user dengan
>1 Data Usaha) + 1 Low (state `selectedConnectionId` tidak direset) —
KEDUANYA diperbaiki langsung, termasuk guard baru
`CONNECTION_DATA_USAHA_MISMATCH` + test regresi khusus.

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite 757
pass/0 fail (7 test baru). Data test dibersihkan pakai script permanen
`bun run db:cleanup-test-data` (Fase 113) — DB dev tetap cuma 2 akun asli.

**Belum di-deploy ke production** — perubahan ini baru sampai kode lokal
(develop branch, belum commit/push). Perlu konfirmasi user untuk
commit+push, dan runbook deploy manual terpisah (Full, bukan Minimal).
