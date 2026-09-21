# Fase 143 — Model Koneksi Accurate 1-per-Akun (Cutover Langsung)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Backend model koneksi 1-per-akun Accurate yang dipegang Data Usaha (ADR-0036 #1/#3/#5/#6, ADR-0037), cutover
langsung dari model per-subscription. Rencana lengkap: lihat ADR-0037 dan rencana sesi Fase 143.

## Scope (task)
- [x] T1 Migrasi 0028: `data_usaha.accurate_db_id/alias`, lepas UNIQUE `accurate_connection_id`, indeks unik parsial (akun; DB↔DU), backfill db-terakhir
- [x] T2 `lib/accurate-connection.ts` resolver tunggal + `openAccurateSession(connection, accurateDbId)`
- [x] T3 Callback OAuth upsert per `accurate_user_id` (state membawa `{userId,dataUsahaId}`; tolak akun milik owner lain / tanpa `user.id`)
- [x] T4 Endpoint dikunci Data Usaha: connect, databases, databases/select, subscriptions, connections; hapus `reuse`
- [x] T5 Worker (import & cancel) + `checkSubscriptionScopes` + `me.route` + admin user-subscriptions pakai resolver
- [x] T6 Refresh aman-rotasi: `AccurateTokenError` tipe, `refreshConnectionToken` (FOR UPDATE), job harian (hanya `invalid_grant` → expired, lewati batch berjalan)
- [x] T7 Transfer kepemilikan memutus koneksi (user + admin); admin "Putuskan Koneksi" di level Data Usaha
- [x] T8 Web minimal (typecheck hijau): buang `reuse`, kirim `dataUsahaId`
- [x] T9 Tes baru/diperbarui; bersihkan komentar usang
- [x] T10 Docs: architecture-accurate-integration § 1, architecture-user-tambahan, architecture-subscription, lessons-learned
- [x] T11 Perbaikan audit keamanan (HIGH sesi-terikat callback; Medium: expired hanya 401 + UPDATE bersyarat, rate limit, cap state, timeout account API; Low: TOCTOU, `t.Integer`, maxLength) + `attach`/`accounts` (ditemukan saat E2E)

## Di luar scope
UI/UX (144); migrasi customer/health check/banner/runbook/hapus kolom subscriptions.accurate_connection_id (145).

## Keputusan Kecil (diambil saat eksekusi)
- **Cutover langsung** (pilihan user, ADR-0037 #1) — bukan dual-read. Koneksi lama (`accurate_user_id` NULL) tidak pernah dibaca lagi; resolver (`lib/accurate-connection.ts`) mengembalikan `connection: null` untuk itu.
- **Adaptor kompat** `POST /accurate/connect` menerima `subscriptionId` (diturunkan ke Data Usaha-nya) supaya web tetap jalan sampai UI 144; `GET /accurate/subscriptions` & `/connections` mempertahankan bentuk respons lama tapi status diturunkan dari Data Usaha.
- **Upsert atomik** lewat `INSERT ... ON CONFLICT (accurate_user_id) WHERE ... DO UPDATE ... WHERE user_id = <pemilik>`: baris tak dikembalikan = akun milik owner lain → ditolak. Kepemilikan Data Usaha diverifikasi ulang di callback (state membawa `userId`), karena bisa ditransfer sejak OAuth dimulai.
- **Backfill 0028 tidak menyentuh pointer koneksi** — hanya `accurate_db_id/alias` "terakhir diketahui". Callback mempertahankannya bila ada di `db-list.do` akun baru, mengosongkannya bila tidak.
- **`accountEmail` TIDAK ditambahkan** ke `GET /accurate/subscriptions` (rencana awal): endpoint itu Accessible (member seat), email akun Accurate pemilik tidak perlu terlihat member. `missingScopes` ditambahkan (null = belum diketahui).
- `getOrCreateDefaultDataUsaha` kehilangan filter `isNull(accurateConnectionId)`: pointer kini hidup, tanpa perbaikan ini Data Usaha Utama yang sudah terhubung tidak ditemukan dan admin membuat duplikat.
- Fixture tes `createTestAccurateConnection` (`lib/test-fixtures.ts`): `accurate_user_id` acak per koneksi (indeks unik global).
- Refresh: kunci `FOR UPDATE` ditahan selama panggilan HTTP (timeout 15 dtk) — dapat diterima karena hanya job harian & (kelak) on-demand yang menyentuhnya, dan baris koneksi bukan jalur panas.

## Ringkasan Hasil
Model koneksi 1-per-akun Accurate dipegang Data Usaha (cutover langsung, ADR-0037). Migrasi 0028 (aditif + backfill db-terakhir), callback OAuth = upsert atomik terikat sesi, resolver tunggal, refresh aman-rotasi (`FOR UPDATE`), transfer memutus koneksi, `attach`/`accounts`, `reuse` dihapus.
- Typecheck (api+web) & lint bersih; **1420 tes API lolos** (naik dari 1373); data uji dev dibersihkan.
- **E2E dengan Accurate asli** (akun DEV, aplikasi facport local, Retail Demo; izin eksplisit klik "Beri Akses"): callback asli → 1 baris koneksi akun `60245` dengan 35 scope, Data Usaha menunjuknya; pilih database → `DATABASE_ALREADY_SELECTED` pada percobaan kedua; refresh asli → token & refresh token berganti, dua panggilan paralel = 1 `refreshed` + 1 `skipped_fresh`, token lama 401, token baru hidup; jalur worker (resolver → cek scope → sesi Retail Demo → `purchase-invoice/list.do` 200); `attach` Data Usaha B → koneksi sama (tetap 1 baris), Retail Demo `used` dan `DATABASE_ALREADY_USED` untuk B; callback tanpa sesi → `invalid_state`.
- Audit keamanan (subagent `security-auditor`): 0 Critical, 1 High, 3 Medium, 4 Low → High, semua Medium dan Low yang layak DIPERBAIKI; sisanya di Known Limitations.

## Known Limitations
- **Rilis 143 TANPA UI 144 memutus customer** yang koneksinya masih hidup (cutover) — 143+144 dirilis satu paket, setelah customer diberi tahu. Sebelum itu tetap di `develop`.
- UI web belum menerjemahkan kode error callback (`accurate_account_in_use`, `missing_account`) maupun `ACCURATE_SCOPE_MISSING`; kartu per subscription dipertahankan sementara → Fase 144. Konfirmasi database hasil backfill saat hubungkan ulang → Fase 144.
- Backfill "database terakhir diketahui" bisa keliru untuk customer multi-Data-Usaha (pemetaan lewat subscription); UI 144 harus menampilkannya untuk diverifikasi.
- `subscriptions.accurate_connection_id`, `accurate_connections.accurate_db_id/alias`, dan 59 koneksi lama masih ada di DB (dibersihkan Fase 145). Health-check token customer & carry-over koneksi hidup → Fase 145.
- Audit Low yang TIDAK diubah (keputusan sadar): `accurate_db_alias` dari client tidak diverifikasi ke `db-list` (kosmetik, owner-only); alias/id database lama dipertahankan setelah transfer (ADR-0037 #6, membantu pemilik baru menghubungkan ulang); kegagalan commit setelah rotasi refresh membuat koneksi tak pulih (inheren pada refresh token sekali-pakai; Sentry sudah menangkap).
- OAuth state tetap in-memory (single instance); worker tidak menghentikan batch bila `AccurateScopeError` muncul di tengah baris; belum ada refresh on-demand saat import (hanya job harian, ambang 2 hari).
- Tes worker end-to-end (job pg-boss) tidak ada; logika intinya (resolver, `refreshConnectionToken`, `hasRunningBatch`, `markConnectionExpired` lewat resolver) teruji terpisah.
