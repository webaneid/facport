# Fase 191 — Hibah Akses Internal (D9 Lapis 2)

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Akun **internal** (trainer, karyawan, mitra; internal = flag ATAU role admin/staf, D16) bisa diberi akses fitur **tanpa tanggal akhir** dalam sekali klik ("Beri semua fitur"), tanpa invoice, tanpa notifikasi kedaluwarsa, dan tanpa mengotori laporan keuangan. Lanjutan Fase 189G (Lapis 1: akun internal tidak bisa ditagih; akses hanya lewat mode "Gratis" bertanggal akhir). Induk: `phase-189-insight-pelanggan-admin.md`; keputusan: D9 di `architecture-admin-insight.md`; `architecture-internal-accounts.md`.

## Fakta kode (diperiksa 2026-10-12)
- Gerbang akses sudah memperlakukan `subscriptions.end_at IS NULL` sebagai TANPA BATAS (`subscription-gate.ts`, `seat-access.ts`); job kedaluwarsa (`lt(end_at, now)`), pengingat (`if (!sub.endAt) continue`), dan tagihan perpanjangan (`renewal_interval` null / `isNotNull(end_at)`) mengabaikan baris tanpa akhir. Jadi "tanpa akhir" dan "tanpa notifikasi" cukup dicapai dengan `end_at = NULL` — tidak ada perubahan job.
- Laporan Insight hanya menghitung pemilik KOMERSIL, jadi hibah internal tidak masuk angka.
- Risiko utama: akun KOMERSIL tidak boleh mendapat hibah tanpa akhir (kebocoran pendapatan); dan hibah tidak boleh tertinggal saat akun kembali komersil.

## Rancangan
- Kolom baru `subscriptions.internal_grant boolean not null default false` (migrasi aditif `0052`): penanda eksplisit hibah — hibah dikenali dari penanda, BUKAN dari `end_at IS NULL` (agar baris null-end lain yang sah tidak ikut dicabut).
- `lib/internal-grants.ts`: `grantInternalAccess(tx, {ownerId, dataUsahaId, moduleKeys|"all", actorId})` — HANYA bila pemilik internal efektif (kunci baris `FOR SHARE/UPDATE` pada user, pola guard 189G) dan Data Usaha milik `ownerId`; untuk tiap modul: pilih paket modul aktif termurah, tutup langganan aktif lain modul yang sama di Data Usaha itu, buat langganan `active`, `end_at NULL`, `internal_grant true`, `renewal_interval NULL`, tanpa order/invoice; idempoten (hibah aktif yang sudah ada dilewati); audit per langganan. `revokeInternalGrants(tx, {userIds | dataUsahaId, actorId})` — set `status='cancelled'`, `end_at=now`, audit.
- Endpoint (`subscriptions.manage`): `POST /admin/users/:id/internal-grant/preview` dan `/internal-grant` (`{dataUsahaId, moduleKeys: string[] | "all"}`), `POST /admin/users/:id/internal-grant/revoke` (`{dataUsahaId?}`). Pemilik bukan internal → 409 `NOT_INTERNAL`; Data Usaha bukan milik akun → 404; modul tak dikenal → 422. Audit: `entity_type='subscription'`, `action='create'/'update'`, `changes {internalGrant:true,…}`.
- **Pencabutan otomatis:** saat akun berubah dari internal ke komersil (cabut flag di aksi massal `/admin/users/internal`, atau cabut role admin/staf di aksi peran 189H), semua hibahnya dicabut dalam transaksi yang sama; pratinjau dampak menampilkan jumlah hibah yang akan dicabut.
- UI: panel "Akses Internal" di detail user untuk akun internal (per Data Usaha milik: daftar fitur dihibahkan, tombol "Beri semua fitur", "Cabut hibah", dialog konfirmasi) dan lencana "Hibah internal" pada baris langganan; `user-subscriptions` mengembalikan `internalGrant`.

## Scope
- [ ] G1 Skema + migrasi `0052_subscriptions_internal_grant` (journal `when` > migrasi terakhir)
- [ ] G2 `lib/internal-grants.ts` + tes (hanya internal; modul termurah; mengganti langganan lain; idempoten; ownership; revoke)
- [ ] G3 Endpoint preview/grant/revoke + tes (izin 401/403, NOT_INTERNAL, DU bukan milik, modul tak dikenal, audit, gerbang akses benar-benar terbuka tanpa akhir)
- [ ] G4 Pencabutan otomatis saat internal→komersil (aksi massal internal + aksi peran) + dampak di pratinjau + tes
- [ ] G5 UI: panel Akses Internal + dialog + lencana + tes
- [ ] G6 Dokumen (`architecture-internal-accounts.md`, `architecture-admin-insight.md` D9, PROGRESS, glosarium, lessons-learned bila ada)
- [ ] G7 Suite penuh API+web, cleanup data uji, security review (subagent — jalur pendapatan/izin), komit+push

## Di luar scope
Hibah untuk akun komersil (tetap lewat mode "Gratis" bertanggal akhir atau invoice); hibah User Tambahan (seat); mengubah job kedaluwarsa/notifikasi; pelaporan khusus hibah di Insight.

## Keamanan (untuk review penutup)
Akun komersil tidak boleh dapat hibah (server memeriksa, termasuk balapan dengan penandaan internal); IDOR Data Usaha lintas akun; pencabutan saat status berubah (tidak ada hibah yatim di akun komersil); izin terpusat `subscriptions.manage`; audit lengkap.

## Referensi
`architecture-internal-accounts.md`; `lib/internal-accounts.ts`; `lib/admin-assign.ts`; `lib/subscription-gate.ts`; `routes/admin/users.route.ts` (aksi massal internal); `routes/admin/user-roles.route.ts`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review
- [ ] Temuan Critical/High diperbaiki
- [ ] Dokumen; PROGRESS diupdate
- [ ] Catat: UI belum dilihat di browser

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
