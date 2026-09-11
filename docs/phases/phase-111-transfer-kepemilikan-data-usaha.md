# Fase 111 — Transfer Kepemilikan Data Usaha

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Fase terakhir dari rencana 5-fase restrukturisasi Data Usaha
(`docs/architecture/architecture-user-tambahan.md`) — "Super User" (pemilik
Data Usaha) bisa transfer kepemilikan ke orang lain, baik self-service
(inisiasi sendiri, penerima konfirmasi) maupun dibantu admin (langsung
eksekusi, client eksplisit minta ini karena transfer kepemilikan biasanya
butuh dukungan CS). Fase 110 SUDAH membetulkan pondasi gating akses supaya
baca `data_usaha.userId` (kepemilikan SAAT INI), bukan `subscriptions.userId`
(buyer historis beku) — fase ini murni MENGUBAH `data_usaha.userId`, TIDAK
PERNAH menulis ulang `subscriptions.userId`/`invoices.userId` (riwayat
transaksi tetap milik pembeli asli). Lihat rencana lengkap yang sudah
disetujui di `/Users/webane/.claude/plans/sorted-inventing-volcano.md` § "Fase
111".

## Scope
- [x] Tabel baru `ownership_transfers` (dataUsahaId, fromUserId, toEmail,
      tokenHash, tokenExpiresAt, status, acceptedAt/acceptedBy, cancelledAt)
      — pola sama `member_seats.inviteTokenHash` (token+hash+expiry), tabel
      TERPISAH (bukan menumpang di `member_seats`).
- [x] Self-service: `POST /me/data-usaha/:id/transfer-ownership` (body
      `{toEmail}`, `ownsDataUsaha` check, guard `CANNOT_TRANSFER_TO_SELF`,
      409 `TRANSFER_ALREADY_PENDING` kalau sudah ada yang pending) → buat
      pending transfer + kirim email.
- [x] `POST /me/data-usaha/:id/transfer-ownership/cancel` (di luar scope
      awal plan, DITAMBAH saat eksekusi — lihat § Keputusan Kecil #1).
- [x] `GET/POST /transfers/:token`, `POST /transfers/:token/accept`,
      `POST /transfers/:token/accept-existing` (publik, rate-limited) — akun
      baru (signUpEmail) ATAU akun existing (auth:true + email cocok).
- [x] Google OAuth auto-complete transfer (`linkGoogleSignupToPendingTransfer`,
      di luar scope awal plan, DITAMBAH saat eksekusi — lihat § Keputusan
      Kecil #2).
- [x] Admin-assisted: `POST /admin/data-usaha/:id/transfer-ownership` (body
      `{toUserId}`, permission `users.manage`) — LANGSUNG eksekusi, sekaligus
      membatalkan transfer self-service pending lain untuk Data Usaha yang
      sama + audit log.
- [x] `GET /admin/data-usaha?userId=` (BARU, tidak ada di plan awal — perlu
      untuk UI admin memilih Data Usaha mana yang ditransfer).
- [x] Efek transfer: HANYA `data_usaha.userId` berubah — diverifikasi
      eksplisit di `executeOwnershipTransfer` + regression test.
- [x] Frontend: "Transfer Kepemilikan Data Usaha" card di halaman "Kelola
      Tim" (`team-form.tsx`) dengan dialog initiate + tombol batal; halaman
      publik `/transfer/[token]` + `transfer-accept-form.tsx` (mirror
      `invite-accept-form.tsx`); dialog admin "Transfer Data Usaha" di
      `/admin/users` (pilih Data Usaha + cari user tujuan).
- [x] Test: initiate/cancel (termasuk re-initiate setelah cancel), preview,
      accept 2 jalur (baru & existing), stale-ownership guard (token invalid
      begitu kepemilikan berubah lewat jalur lain), Google auto-link
      (termasuk expiry & stale-ownership), admin-assisted transfer + audit
      log + auto-cancel pending self-service, regression "kelola tim ikut
      kepemilikan baru" (owner lama 404, owner baru bisa).
- [x] Typecheck + security review + tutup fase.

## Referensi
- `docs/architecture/architecture-user-tambahan.md`
- Plan disetujui: `/Users/webane/.claude/plans/sorted-inventing-volcano.md` § "Fase 111"
- Pondasi gating akses yang jadi prasyarat fase ini: `docs/decisions/adr-0032-model-seat-user-tambahan.md`, `docs/phases/phase-110-user-tambahan-seat.md`

## Keputusan Kecil Selama Eksekusi

1. **Bug otorisasi ditemukan sebelum sempat jadi celah nyata** —
   `team.route.ts` (`POST /me/team/:seatId/invite|resend|revoke`) memeriksa
   `seat.primaryUserId === user.id` (siapa yang BELI slot, snapshot beku)
   untuk otorisasi kelola tim, BUKAN kepemilikan Data Usaha saat ini. Ini
   benar SELAMA `data_usaha.userId` tidak pernah berubah (sebelum fase ini
   ada) — begitu transfer kepemilikan mungkin terjadi, ini jadi salah:
   pemilik LAMA (masih `primaryUserId`) tetap bisa kelola tim Data Usaha
   yang sudah bukan miliknya, pemilik BARU (bukan `primaryUserId`) tidak
   bisa sama sekali. Ditemukan lewat audit eksplisit "cari pemakaian
   `primaryUserId` lain yang mungkin salah asumsi kepemilikan" SEBELUM
   menulis kode transfer (bukan ditemukan setelah bug muncul). Fix: ganti ke
   `ownsDataUsaha(user.id, seat.dataUsahaId)` di ketiga endpoint — regresi
   ini diverifikasi eksplisit lewat test "owner lama 404, owner baru bisa
   kelola tim" pasca-transfer.
2. **Google OAuth auto-complete DITAMBAH ke scope** — halaman
   `/transfer/[token]` menawarkan tombol "Lanjutkan dengan Google" (mirror
   `/invite/[token]` Fase 110 untuk konsistensi UX), tapi awalnya TIDAK ADA
   logic yang mengeksekusi transfer untuk akun baru via Google (hanya
   `linkGoogleSignupToPendingInvite` untuk seat yang sudah ada). Ditemukan
   sebelum sempat jadi bug live — GoogleSignInButton akan bikin akun tapi
   TIDAK memindahkan kepemilikan, melanggar janji halaman ini. Ditambahkan
   `linkGoogleSignupToPendingTransfer` (`lib/ownership-transfer.ts`), dipanggil
   dari `databaseHooks.user.create.after` bersebelahan dengan versi seat.
   **Expiry & stale-ownership guard SENGAJA dicek eksplisit sejak awal
   ditulis** (bukan ditambah belakangan) — pelajaran langsung dari temuan
   security review Fase 110 (Medium: jalur Google lupa cek expiry invite).
3. **Cancel transfer pending DITAMBAH ke scope** — plan awal cuma sebut
   initiate+accept, tapi tanpa cara membatalkan, salah ketik email penerima
   berarti pemilik terkunci 7 hari menunggu token itu sendiri expired
   sebelum bisa mencoba lagi (guard 409 `TRANSFER_ALREADY_PENDING`
   mencegah initiate baru selama yang lama masih pending). Ditambahkan
   `POST /me/data-usaha/:id/transfer-ownership/cancel`, pola sama semangat
   `revoke` seat Fase 110.
4. **`GET /admin/data-usaha?userId=` DITAMBAH** — tidak ada di plan awal,
   tapi diperlukan supaya UI admin "Transfer Data Usaha" bisa menampilkan
   pilihan Data Usaha mana yang mau ditransfer dari user yang dipilih
   (tanpa ini, admin harus tahu UUID Data Usaha dari luar UI).
5. **Permission `users.manage` di-reuse untuk admin-assisted transfer**
   (bukan permission baru) — sesuai catatan di plan awal, dipilih karena ini
   aksi setingkat "override" lain yang sudah digerbangi permission itu
   (nonaktifkan akun, dst) dan menghindari kompleksitas tambahan (migrasi
   seed RBAC) untuk 1 endpoint.
6. **Admin-assisted transfer OTOMATIS membatalkan transfer self-service
   pending lain** untuk Data Usaha yang sama — dicegah SEBELUM jadi
   kebingungan produksi (bukan ditemukan lewat bug report): tanpa ini, link
   transfer self-service lama yang masih "pending" (walau
   `findValidTransferByToken` akan menolaknya via stale-ownership guard)
   akan tetap tampil "menunggu diterima" di UI pemilik lama selamanya,
   membingungkan. Dibersihkan eksplisit di transaksi yang sama dengan
   transfer admin.
7. **Security review (2026-09-11)**: TIDAK ADA temuan Critical/High/Medium
   baru. Audit eksplisit dilakukan untuk memastikan celah expiry Google Fase
   110 tidak terulang (§ Keputusan Kecil #2) dan tidak ada pemakaian
   `primaryUserId` lain di codebase yang salah asumsi kepemilikan (§
   Keputusan Kecil #1) — keduanya sudah ditangani SEBELUM review formal,
   dikonfirmasi ulang saat review, bukan ditemukan baru saat itu.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api + apps/web bersih)
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High: tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [x] **TIDAK push**

## Verifikasi End-to-End (Browser)
1. Self-service: login sebagai owner (`fase111-owner@test.local`), buka
   "Kelola Tim" → card "Transfer Kepemilikan Data Usaha" tampil benar →
   dialog isi email penerima → toast sukses, card berubah jadi "Menunggu
   ... menerima transfer".
2. Token asli diambil dari job `send-email` (dev no-op, pola sama Fase 110)
   → buka `/transfer/{token}` → preview render benar ("Fase111 Owner ingin
   memindahkan kepemilikan Data Usaha PT Fase111 Test ke kamu") → isi
   nama+password (jalur akun baru) → submit → redirect dashboard, toast
   "Transfer diterima!" → diverifikasi DB: `data_usaha.userId` pindah ke
   akun baru, `ownership_transfers.status = 'accepted'`.
3. Admin-assisted: login admin → `/admin/users` → cari user (pemilik baru
   dari langkah 2) → klik ikon Transfer → dialog pilih Data Usaha ("PT
   Fase111 Test" muncul benar dari `GET /admin/data-usaha`) + cari user
   tujuan (`fase111-target3`) → submit → toast sukses → diverifikasi DB:
   `data_usaha.userId` pindah ke `fase111-target3`.
4. Data test (4 user, 1 Data Usaha, 1 ownership_transfers) dibersihkan dari
   dev DB dengan scope presisi berdasarkan ID eksplisit — tidak menyentuh
   data sesi lain.

## Known Limitations
- **Preview "siapa yang mengundang" pada seat (`GET /invites/:token`,
  Fase 110) tetap menampilkan `primaryUserId`** (pembeli asli slot), bukan
  pemilik Data Usaha saat ini — kalau kepemilikan ditransfer sementara ada
  invite seat yang masih pending, teks undangan menampilkan nama pemilik
  LAMA. Ini murni tampilan (tidak dipakai untuk keputusan otorisasi apa
  pun), dampak kosmetik kecil, tidak diperbaiki di fase ini.
- **Tidak ada notifikasi ke pemilik lama saat transfer diterima** (baik
  self-service maupun admin-assisted) — pemilik lama BARU tahu kalau
  mencoba login dan melihat Data Usaha itu sudah hilang dari daftarnya.
  Dicatat sebagai kemungkinan perbaikan UX masa depan, bukan blocker.
- **Pembersihan data test hasil `bun run test` (bukan browser test) masih
  BELUM dilakukan** — carry-over dari Fase 110 (lihat known limitation di
  sana), belum bertambah baru di fase ini (test suite Fase 111 sendiri
  sudah dibersihkan lewat window terpisah).

## Ringkasan Hasil
Fase 111 (fase TERAKHIR dari rencana 5-fase restrukturisasi Data Usaha)
selesai penuh: transfer kepemilikan Data Usaha berjalan end-to-end lewat 2
jalur (self-service initiate→accept dengan token 7-hari + Google
auto-complete, dan admin-assisted langsung eksekusi), diverifikasi lewat
test otomatis DAN browser walkthrough penuh kedua jalur. Selama eksekusi,
audit proaktif menemukan dan memperbaiki 1 celah otorisasi (`team.route.ts`
masih pakai snapshot beku `primaryUserId`, bukan kepemilikan Data Usaha
saat ini) SEBELUM sempat jadi bug produksi, dan mencegah pengulangan celah
expiry Google OAuth yang ditemukan security review Fase 110. Security
review formal Fase 111 sendiri tidak menemukan temuan baru. Efek transfer
dikonfirmasi TERBATAS PERSIS pada `data_usaha.userId` — riwayat
`subscriptions`/`invoices` tetap atas nama pembeli asli, `member_seats`
tidak terganggu. Dengan ini, seluruh rencana 5-fase (106→107→109→110→111)
dari `architecture-user-tambahan.md` SELESAI. Belum di-push sesuai instruksi
standing user (local-only, branch `feature/data-usaha-restructure`).
