# Architecture — Promo (Banner di /pilih-usaha)

> Fase 116. Banner promo di gerbang "Pilih Data Usaha" (`/app/pilih-usaha`,
> desktop-only `lg:` ke atas, konsisten Fase 109), dikelola admin lewat
> menu baru "Promo". Menyambungkan `BannerSlider` (Fase 109 tambahan
> 2026-09-12, sejak awal hardcode 3 slide teks + gradient, TANPA gambar/
> URL) ke data dinamis — sekaligus MENAMBAH kapabilitas gambar+link+tombol
> yang belum pernah ada di komponen itu.

## Skema Database
```ts
// apps/api/src/db/schema/promo.schema.ts
export const promos = pgTable("promos", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }),        // NULLABLE, lihat § Aturan Tampilan
  description: text("description"),                 // NULLABLE
  buttonLabel: varchar("button_label", { length: 50 }), // NULLABLE
  url: text("url").notNull(),                         // SELALU wajib
  imageUrl: text("image_url").notNull(),               // SELALU wajib, URL bucket PUBLIK (bukan Media Library privat, lihat § Keputusan)
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt/updatedAt,
});
```
Tidak ada tabel lain yang FK ke `promos` — hard delete aman (konsisten
konvensi project, "soft delete TIDAK dipakai").

## Aturan Tampilan — 2 Mode, All-or-Nothing
`title`/`description`/`buttonLabel` **all-or-nothing**: ketiganya kosong,
atau ketiganya terisi — divalidasi backend (`POST`/`PATCH`) DAN frontend,
cegah state ambigu.

- **Mode kartu+tombol** (ketiganya terisi): `imageUrl` jadi
  background/visual card, `title`+`description` overlay teks, tombol
  berlabel `buttonLabel` link ke `url` (`target="_blank"`).
- **Mode gambar-klik** (ketiganya kosong): seluruh gambar jadi
  `<a href={url} target="_blank">`, tanpa overlay teks/tombol.

Tidak ada mode "teks tanpa gambar" atau "gambar tanpa link" — tidak
diminta, sengaja tidak dibangun.

## Endpoint READ Publik Dibatasi 5
`GET /promos` (customer, `auth: true`, bukan permission khusus):
`WHERE isActive = true ORDER BY sortOrder ASC LIMIT 5`. Admin boleh
bikin/aktifkan lebih dari 5 — yang lolos `LIMIT 5` yang tampil, sisanya
tidak (halaman admin kasih badge "Tampil"/"Tidak tampil" per baris supaya
tidak membingungkan). Response cuma field yang dipakai render (`id,
title, description, buttonLabel, url, imageUrl`) — `isActive`/
`sortOrder`/`createdBy` TIDAK diekspos ke customer.

## Keputusan: Upload Gambar Lewat Bucket PUBLIK, BUKAN Media Library Generik
Project ini punya 2 pola upload gambar (§ `architecture-storage.md`):
1. **Media Library generik** (`POST /media/upload`, bucket PRIVAT
   `facport-media`) — **py gap terdokumentasi belum selesai**: response
   cuma balikin `storageKey` internal MinIO, BUKAN URL siap pakai
   `<img src>`. Dokumen sendiri menandai ini "WAJIB diselesaikan SEBELUM
   dipakai fitur nyata" — belum pernah dipakai fitur produksi manapun.
2. **Upload langsung ke bucket PUBLIK** (`facport-public`, pola
   `admin/branding.route.ts` `POST /admin/branding/logo` — logo
   perusahaan/favicon/QRIS) — TERBUKTI jalan production, upload langsung
   dapat URL browser-facing.

**Promo pakai pola #2** (`POST /admin/promos/image`, mirror persis
`branding.route.ts` minus langkah tulis-ke-`settings`) — gambar promo
memang dimaksudkan tampil terbuka ke semua customer login, dan memilih
pola #1 berarti ikut menyeret pekerjaan menyelesaikan gap arsitektur yang
tidak diminta fase ini.

## Permission
`"promos.manage"` — 1 permission untuk semua endpoint admin (GET/POST/
PATCH/DELETE/upload gambar), pola sama `notifications.broadcast`
(Announcements). Otomatis didapat role "staff" juga (tidak masuk
`STAFF_EXCLUDED_PERMISSION_KEYS`).

## Referensi
- Phase doc: `docs/phases/phase-116-fitur-promo-pilih-usaha.md`
- Komponen frontend: `apps/web/components/data-usaha/banner-slider.tsx`
  (existing, direstrukturisasi — BUKAN dibuat dari nol),
  `apps/web/app/admin/(protected)/promos/page.tsx` (baru)
- Preseden "Known Limitation" yang diselesaikan fase ini: `docs/phases/phase-109-gerbang-pilih-data-usaha.md` § Known Limitations
