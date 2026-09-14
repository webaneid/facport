# Fase 116 — Fitur "Promo" di /pilih-usaha (Tabel Baru + Admin CRUD)

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
Banner promo dinamis di `/app/pilih-usaha` (desktop-only, konsisten Fase
109), dikelola admin lewat menu baru "Promo". Menyambungkan komponen
`BannerSlider` yang sejak Fase 109 tambahan (2026-09-12) memang sengaja
hardcode + digeneralisasi untuk disambung ke data dinamis nanti — fase
ini yang mengeksekusinya, sekaligus menambah kapabilitas gambar+link+
tombol yang belum pernah ada.

## Scope
- [x] Schema baru `promos` (`apps/api/src/db/schema/promo.schema.ts`) +
      migration.
- [x] Permission `promos.manage` di `db/seed.ts`.
- [x] `routes/admin/promos.route.ts` — CRUD + upload gambar (bucket publik).
- [x] `routes/promos.route.ts` — READ publik (customer, `auth: true`,
      `isActive`+`LIMIT 5`+`ORDER BY sortOrder`).
- [x] `banner-slider.tsx` — rombak isi (hapus `SLIDES` hardcode, terima
      `promos` prop, 2 mode tampilan), PERTAHANKAN mekanisme
      autoplay/dot/chevron/collapse apa adanya.
- [x] `pilih-usaha-form.tsx` — fetch `promos`, `effectiveCollapsed`
      handle kasus 0 promo.
- [x] `app/admin/(protected)/promos/page.tsx` (baru) — halaman CRUD.
- [x] `sidebar.tsx` — menu "Promo" baru di grup Manajemen.
- [x] Test backend (CRUD, validasi all-or-nothing, limit 5, auth).
- [x] Typecheck 0 error.
- [x] Security review (subagent `security-auditor` — banyak file baru).
- [x] Update Peta Dokumen root `CLAUDE.md`.

## Referensi
- Architecture doc: `docs/architecture/architecture-promo.md`
- Plan lengkap: `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`
- Preseden Known Limitation: `docs/phases/phase-109-gerbang-pilih-data-usaha.md`

## Keputusan Kecil Selama Eksekusi
- Upload gambar pakai pola bucket PUBLIK (seperti logo perusahaan),
  SENGAJA bukan Media Library generik (`POST /media/upload`) — pola itu
  py gap terdokumentasi belum selesai (`storageKey` bukan URL siap
  pakai). Detail rasional → `architecture-promo.md` § Keputusan.
- Migration fase ini CUMA dijalankan lokal — TIDAK menyentuh production.
  Deploy production jadi langkah terpisah, nunggu konfirmasi eksplisit.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api & apps/web.
- [x] Security review dijalankan (subagent `security-auditor`, banyak
      file baru).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) —
      1 Medium ditemukan (`url` bisa `javascript:` URI), diperbaiki
      langsung (`validatePromoUrlScheme`, backend + frontend + 3 test).
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      — tidak ada yang ditunda (Medium sudah difix, tidak ada Low).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Gambar lama TIDAK dihapus dari MinIO saat promo di-edit (ganti gambar)
  atau di-delete — sama seperti pola `admin/branding.route.ts` (logo
  perusahaan), gap yang memang belum diselesaikan di project ini secara
  umum, bukan regresi baru dari fase ini.
- Upload gambar Promo pakai pola bucket PUBLIK langsung (`facport-public`,
  sama seperti logo), BUKAN pola Media Library generik (`POST
  /media/upload`) — keputusan sadar untuk hindari menyeret gap Media
  Library privat (`storageKey` bukan URL siap pakai) yang belum
  diselesaikan, § `architecture-promo.md`.
- Badge "Tampil di Slider" di halaman admin (>5 promo aktif) dihitung
  ULANG di client (bukan dari backend) — murni indikator visual,
  keputusan sebenarnya (`LIMIT 5 ORDER BY sortOrder`) tetap di backend
  `GET /promos`.
- Halaman `/pilih-usaha` publik READ (`GET /promos`) memang TIDAK
  di-scope per Data Usaha/tenant — promo memang global untuk semua
  customer, sesuai requirement user.

## Ringkasan Hasil
Fitur Promo selesai end-to-end: tabel baru `promos` (migration
`0024_flaky_psynapse.sql`, CREATE-TABLE murni tanpa backfill — kategori
risiko migration paling rendah di project ini), permission
`promos.manage` (admin + staff), CRUD admin penuh (`admin/promos.route.ts`
+ halaman `/admin/promos`) dengan upload gambar ke bucket publik (pola
sama logo perusahaan), endpoint publik `GET /promos` (login wajib,
`isActive` + `LIMIT 5` + urut `sortOrder`), dan `banner-slider.tsx` di
`/pilih-usaha` dirombak dari hardcode 3-slide-gradient jadi dinamis dari
DB dengan 2 mode render (kartu+tombol vs gambar-klik-penuh) sesuai field
yang diisi admin.

Security review (subagent `security-auditor`) menemukan 1 Medium — field
`url` cuma divalidasi "tidak kosong" (`minLength:1`), tanpa cek skema,
sehingga admin/staff manapun (permission `promos.manage` otomatis milik
role staff juga) bisa isi `javascript:...` yang akan dieksekusi saat
customer klik promo (`target="_blank"` tidak mencegah ini) — diperbaiki
langsung via `validatePromoUrlScheme()` (WAJIB `http:`/`https:`) di
POST & PATCH backend, plus validasi cermin di frontend, plus 3 test baru.

Ditemukan & diperbaiki 1 gap infrastruktur tidak terkait fitur ini
secara langsung: script `cleanup-test-data.ts` belum pernah menghapus
baris `media` (FK `uploaded_by` → `user`, tanpa cascade) karena belum
ada test upload gambar sungguhan sebelum fase ini — begitu test upload
Promo jalan pertama kali, cleanup gagal dengan
`media_uploaded_by_user_id_fk`. Ditambahkan cleanup `media` & `promos`
(`createdBy`/`uploadedBy` in testUserIds) sebelum baris `user` dihapus.

Verifikasi manual browser (Claude in Chrome) — login admin, buat 1 promo
mode kartu+tombol dan 1 mode gambar-klik (upload gambar asli via 2
endpoint), konfirmasi render benar di halaman admin (thumbnail, badge
Aktif/Tampil, urutan). Login customer, buka `/pilih-usaha` — slide 1
(mode kartu) render sempurna (gambar+scrim+title+deskripsi+tombol putih
"Selengkapnya", 2 dot indicator, grid Data Usaha otomatis 2 kolom karena
banner tidak collapsed). Navigasi chevron ke slide 2 — mode gambar-klik
render benar (gambar penuh tanpa overlay teks). Kedua mode terverifikasi
visual end-to-end. Data test dibersihkan setelah verifikasi (dihapus via
UI admin, dikonfirmasi kosong).

**Hasil verifikasi akhir**: `bun run typecheck` 0 error (apps/api &
apps/web), `bun run test` (apps/api) 778 pass/0 fail, `bun run lint`
(apps/web) 0 error/0 warning (2 `<img>` baru di-suppress
`@next/next/no-img-element` konsisten pola existing
`admin/settings/page.tsx`).

Migration fase ini **cuma dijalankan lokal** — belum menyentuh
production, deploy jadi keputusan terpisah menunggu konfirmasi user.
