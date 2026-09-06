# Architecture — Model Role & Tipe User

> Dokumen KHUSUS untuk model role/tipe-user — dipisah dari
> `architecture-auth.md` (mekanisme RBAC secara umum: skema tabel, macro
> permission, ownership check) supaya ada SATU tempat fokus buat "role
> apa saja yang ADA, siapa yang termasuk role apa, dan di mana batasnya".
> Ditulis 2026-08-19 (audit awal, sebelum ADR-0027), diperbarui total
> 2026-09-05 setelah Fase 29 (role staff + nonaktifkan user) & menu
> "Tim Internal" — SEMUA isi di bawah diverifikasi ULANG langsung ke
> kode & DB pada tanggal update ini, bukan disalin dari draf lama.

## Ringkasan Kondisi Saat Ini (diverifikasi ke kode & DB, 2026-09-05)

**3 role sistem** (`isSystem: true`, di-seed `apps/api/src/db/seed.ts`,
tidak bisa dihapus lewat UI):

| Role (DB) | Label UI | Permission | Akses surface |
|---|---|---|---|
| `admin` | **Super Admin** | SEMUA key di bawah (izin penuh) | `admin.facport.com` |
| `staff` | **Admin** | SEMUA key KECUALI `users.manage` | `admin.facport.com` |
| `customer` | **Pelanggan** | `import.create` saja | `app.facport.com` |

`staff` DAN `admin` sama-sama boleh akses surface `admin.` — bedanya
CUMA `users.manage` (§ ADR-0027, keputusan sadar user: "bedanya cuma
bisa tambah/kurangi user"). Label UI ("Super Admin"/"Admin") BEDA dari
nama role di DB — lihat § "Kenapa Nama Role DB Beda dari Label UI" di
bawah untuk alasannya.

**Katalog permission key** (`ADMIN_PERMISSION_KEYS`/`CUSTOMER_PERMISSION_KEYS`,
`apps/api/src/db/seed.ts`):

| Key | Dipakai untuk | Admin (staff)? |
|---|---|---|
| `settings.update` | Ubah pengaturan perusahaan | Ya |
| `media.manage`, `media.upload` | Kelola & upload media/aset | Ya |
| `plans.manage` | CRUD paket langganan | Ya |
| `users.view` | Lihat daftar Pengguna (customer) & Tim Internal | Ya |
| `users.manage` | Tambah/nonaktifkan/aktifkan user & staff | **TIDAK** (§ ADR-0027) |
| `subscriptions.manage` | Assign/edit subscription manual, "Tandai Sudah Dibayar" | Ya |
| `audit.view` | Lihat riwayat `audit_logs` | Ya |
| `invoices.view` | Lihat SEMUA invoice lintas user | Ya |
| `invoices.manage` | Bikin invoice baru untuk user existing (§ ADR-0025) | Ya |
| `orders.manage` | Konfirmasi/tolak pembayaran manual | Ya |
| `import.create` | Akses fitur import — role `customer`, `staff`, DAN `admin` semua dapat | Ya |

`STAFF_EXCLUDED_PERMISSION_KEYS` di `seed.ts` pakai pola EXCLUDE-list
(bukan daftar terpisah) — permission admin BARU otomatis ikut ke `staff`
juga tanpa perlu diingat update 2 tempat, kecuali sengaja dikecualikan.

## Kenapa Nama Role DB Beda dari Label UI

Role DB `admin` TETAP bernama `admin` (TIDAK di-rename jadi
`super_admin`) walau label UI-nya "Super Admin" — keputusan sadar §
ADR-0027 § Decision 1: rename role yang sudah dipakai di banyak tempat
(permission grant, guard surface, komentar kode existing) berisiko
tinggi dibanding manfaatnya. Role baru dinamai `staff` di DB (bukan
`admin_terbatas`/nama lain), label UI "Admin" — mapping label ada di
`apps/web/lib/role-labels.ts` (`ROLE_LABELS`/`roleLabel()`, dipakai
`admin/users/page.tsx` & `admin/staff/page.tsx`).

## Menu Terpisah: "Pengguna" (Customer) vs "Tim Internal" (Admin/Staff)

Sesuai permintaan user ("pisahin antara customer dan user untuk
admin"), 2 menu admin TERPISAH TOTAL — bukan cuma beda label, beda
DATA SOURCE:

- **`/admin/users`** ("Pengguna", sidebar) — `GET /admin/users`
  (`apps/api/src/routes/admin/users.route.ts`) SEKARANG difilter
  server-side, HANYA balikin akun role `customer` (subquery ke
  `user_roles`, fallback list kosong kalau role customer somehow belum
  ke-seed — bukan bocor semua user). Kolom "Role" DIHAPUS dari tabel ini
  (dulu ada, tapi jadi selalu "Pelanggan" — tidak ada nilai informasi
  lagi setelah filter), diganti kolom "Status" (Aktif/Nonaktif). Aksi:
  Tambah User (SELALU role `customer`, hardcoded), kelola langganan,
  Nonaktifkan/Aktifkan.
- **`/admin/staff`** ("Tim Internal", sidebar, ikon `UserCog`) —
  `GET /admin/staff` (`apps/api/src/routes/admin/staff.route.ts`, baru)
  balikin UNION akun role `admin`+`staff` (join `user_roles`, TIDAK
  termasuk customer). Aksi: **Tambah Staff** (`POST /admin/staff`,
  pilih role Admin/Super Admin), Nonaktifkan/Aktifkan (endpoint sama
  persis `PATCH /admin/users/:id/disable|enable` — generik, bukan
  duplikat logic, cuma dipanggil dari halaman berbeda).

Kedua halaman permission VIEW-nya sama (`users.view`, Admin/staff juga
boleh lihat keduanya), aksi tulis (tambah/nonaktifkan) sama-sama
`users.manage` (Super Admin saja).

## Kapabilitas: Nonaktifkan User (Reversibel, BUKAN Hapus Permanen)

§ ADR-0027 § Decision 3 — ditambahkan Fase 29 karena SEBELUMNYA tidak
ada kapabilitas ini sama sekali. **Hapus permanen SENGAJA TIDAK
dibangun**: tabel `subscriptions`/`orders`/`invoices`/`accurate_connections`
mereferensi `user.id` TANPA `onDelete: cascade` — hapus permanen akan
gagal (FK violation) kalau user itu punya riwayat transaksi, atau
(kalau dipaksa cascade) menghapus catatan finansial yang harus permanen.

Kolom `user.disabled` (boolean, migration Fase 29) ditegakkan **2 lapis
WAJIB KEDUANYA**:
1. **Sesi aktif dicabut SEKETIKA** saat dinonaktifkan (`PATCH
   /admin/users/:id/disable` hapus SEMUA baris `session` milik user itu).
2. **Login baru ditolak** — route Elysia eksplisit `POST
   /api/auth/sign-in/email` didaftarkan SEBELUM `.mount(auth.handler)`
   di `apps/api/src/app.ts`, cek `user.disabled` (email
   di-`.toLowerCase()` dulu, SAMA PERSIS normalisasi Better Auth — celah
   Critical yang sempat ditemukan & diperbaiki, § lessons-learned di
   bawah). **BUKAN** pakai hook internal Better Auth (`hooks`/
   `databaseHooks`) — versi Better Auth terpasang (1.7.1) TIDAK punya
   opsi itu di top-level options-nya, diverifikasi langsung ke `.d.mts`.
3. **Defense-in-depth tambahan** (security review Fase 29, High) —
   `lib/permission.ts` (macro `auth`/`permission`, dipakai HAMPIR SEMUA
   endpoint) JUGA cek `user.disabled` langsung per-request, independen
   dari 2 mekanisme di atas — kalau `disabled` di-set lewat jalur LAIN
   (SQL manual dll) tanpa hapus sesi, request berikutnya tetap ditolak.

Guard tambahan saat nonaktifkan: TIDAK BOLEH nonaktifkan diri sendiri,
TIDAK BOLEH nonaktifkan Super Admin AKTIF terakhir (dijaga transaksi +
row lock, § security review Medium finding). **Catatan**: guard "Super
Admin terakhir" itu sekarang MURNI defense-in-depth — tidak bisa dipicu
lewat endpoint publik oleh caller manapun yang valid, karena caller
WAJIB admin aktif untuk lolos `users.manage`, jadi dirinya sendiri
selalu ikut terhitung "admin aktif" (sisa minimal 1). Relevan cuma kalau
`users.manage` di masa depan dipasang ke role lain di luar endpoint
resmi.

## Verifikasi: Cross-Surface Login Block (customer ↔ admin)

Diminta user 2026-09-05: pastikan customer TIDAK BISA login ke
`admin.facport.com` dan sebaliknya (admin/staff TIDAK BISA ke
`app.facport.com`). Guard-nya ADA di 2 tempat (Server Component, cek
`GET /me` lalu bandingkan `roles[]`):

```ts
// apps/web/app/admin/(protected)/layout.tsx
if (!me.roles.includes("admin") && !me.roles.includes("staff")) redirect("/login");

// apps/web/app/app/(protected)/layout.tsx
if (!me.roles.includes("customer")) redirect("/login");
```

**Diverifikasi ULANG end-to-end 2026-09-05** (curl lewat proxy dev,
BUKAN cuma baca kode) — sesi valid dipaksa ke surface yang salah, HTTP
respons dicek langsung:

| Skenario | Hasil |
|---|---|
| Sesi `customer` → surface `app.` (sesuai) | 200 |
| Sesi `customer` → surface `admin.` (dipaksa) | **307 → `/login`** |
| Sesi `staff` → surface `admin.` (sesuai) | 200 |
| Sesi `staff` → surface `app.` (dipaksa) | **307 → `/login`** |

Kedua arah TERBUKTI diblokir benar. Catatan jujur: **tidak ada test
otomatis** untuk logic ini — `apps/web` belum punya test runner sama
sekali (`package.json` tidak ada script `test`), jadi verifikasi di
atas MANUAL (curl), bukan regression test yang jalan tiap CI. Kalau
logic 2 baris di atas berubah tanpa sengaja di masa depan, tidak ada
apa pun yang otomatis menangkap — perlu verifikasi manual ulang kalau
file itu diedit lagi.

`admin@facport.test` HANYA punya role `admin` (bukan `customer`), jadi
dia TIDAK BISA akses `app.facport.com` meski dapat permission
`import.create` "untuk keperluan support" (komentar `seed.ts`) — guard
surface cek ROLE, bukan permission, jadi permission itu saat ini tidak
efektif dari sisi akses surface (bukan bug, sudah dicatat sejak audit
awal, tidak diminta diperbaiki).

## RBAC Custom Role — Kapasitas Ada, Sengaja Tidak Dipakai Penuh

Skema `roles`/`permissions`/`role_permissions`/`user_roles` mendukung
role BEBAS di luar 3 yang di-seed (`isSystem: false`). User SEMPAT
ditawarkan opsi ini ("role custom, admin pilih izin sendiri") saat
diskusi Fase 29, TAPI memilih 2 role TETAP saja ("aplikasi kecil, admin
2 aja") — jadi TIDAK ada halaman "Kelola Role" generik dibangun (§
ADR-0027 § Decision 5, sengaja, bukan lupa). Kapasitas skema tetap ada
kalau kebutuhan berubah nanti.

## Terminologi

- Tabel `user` (Better Auth) = SATU tabel akun untuk SEMUA orang yang
  bisa login (admin, staff, customer) — bukan istilah utk "customer".
- `customer` = nama ROLE (bukan nama tabel) — pelanggan berlangganan,
  akses `app.facport.com`.
- `staff` = nama ROLE baru (label UI "Admin") — tim internal dengan
  akses penuh KECUALI kelola user.

## Lessons Learned Terkait (ringkas, detail lengkap di link)
- Security review Fase 29 menemukan 1 Critical (bypass login `disabled`
  via email case-sensitivity — Better Auth normalisasi lowercase,
  intercept awal tidak) + 1 High (`permission.ts` tidak pernah cek
  `disabled` sebelum fix) — KEDUANYA diperbaiki & diverifikasi ulang
  manual. Detail penuh → `docs/decisions/adr-0027-role-staff-dan-nonaktifkan-user.md`
  § Update 2026-09-05.

## Referensi
- Mekanisme RBAC umum (skema, macro permission, ownership check) →
  `docs/architecture/architecture-auth.md`
- Keputusan role staff + nonaktifkan user → `docs/decisions/adr-0027-role-staff-dan-nonaktifkan-user.md`
- Eksekusi & security review lengkap → `docs/phases/phase-29-role-staff-dan-nonaktifkan-user.md`
- Registrasi & provisioning user → `docs/architecture/architecture-subscription.md`
  § "Dua Jalur Registrasi"
- Surface admin vs app (domain routing) → `docs/architecture/architecture-domain-routing.md`
