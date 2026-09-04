# Architecture — Settings Page

## Prinsip
Settings page WAJIB ada sejak **Fase 00/01** (bukan ditambah belakangan) —
tanpa ini, info seperti nama perusahaan/timezone/domain cenderung
di-hardcode di banyak tempat berbeda, dan itu sendiri sumber utama
inkonsistensi yang susah dibenahi setelah project membesar.

## Skema — Key-Value Fleksibel (Bukan Kolom Tetap)
```ts
export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(), // "company.name", "company.timezone", dst
  value: jsonb("value").notNull(),
  group: varchar("group", { length: 50 }).notNull(), // "general" | "seo" | "integrations" | dst — buat filter di UI
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
});
```
**Kenapa key-value, bukan kolom tetap** (`companyName`, `companyAddress`, dst
di 1 baris): setting baru di masa depan (mis. nanti butuh `company.taxId`)
cukup insert row baru, **tidak perlu migration schema** tiap kali nambah 1
field settings. Trade-off: query per-key (bukan `SELECT *` 1 baris), tapi
cache di layer service/Redis kalau nanti settings sering dibaca (settings
jarang berubah, cocok banget di-cache).

## Field Wajib di Fase 01 (Group: `general`)
| Key | Value | Catatan |
|---|---|---|
| `company.name` | string | Default: "FAC Institute" |
| `company.address` | string (free text) | Project ini TIDAK pakai komponen Alamat terstruktur (checklist = Tidak) — cukup textarea bebas |
| `company.logo` | string (URL publik) | § Fase 12, ADR-0017 — URL SUDAH di-resolve (`${MINIO_PUBLIC_URL}/facport-public/...`), BUKAN media ID mentah lagi (koreksi dari draf awal). Diisi via `POST /admin/branding/logo`, bukan form teks manual. |
| `company.favicon` | object `{ "16": url, "32": url, "180": url, "512": url }` | § Fase 12, ADR-0017 — 4 ukuran PNG, lihat catatan multi-ukuran di `components/architecture-component-image-processing.md`. Diisi via `POST /admin/branding/favicon`. |
| `company.timezone` | string (IANA tz, mis. `"Asia/Jakarta"`) | **Lihat aturan timezone di bawah — WAJIB dibaca**. Default: `"Asia/Jakarta"` |

## ⚠️ Aturan Timezone — Sumber Bug Paling Sering
**Semua timestamp di database WAJIB `timestamptz` (UTC), TIDAK PERNAH simpan
local time.** `company.timezone` di settings **HANYA dipakai saat MENAMPILKAN**
tanggal/jam ke user (convert UTC → timezone target), bukan saat menyimpan.

```ts
// ❌ SALAH — jangan convert ke local time sebelum simpan ke DB
const localTime = toZonedTime(new Date(), companyTimezone);
await db.insert(events).values({ startAt: localTime });

// ✅ BENAR — simpan UTC apa adanya, convert cuma pas tampilkan
await db.insert(events).values({ startAt: new Date() }); // UTC, native

// Saat render ke user (apps/web):
import { formatInTimeZone } from "date-fns-tz";
const displayTime = formatInTimeZone(event.startAt, companyTimezone, "dd MMM yyyy HH:mm");
```
**Kenapa ini "selalu jadi masalah"**: begitu ADA SATU tempat yang menyimpan
local time (bukan UTC), semua perhitungan durasi/perbandingan jadi salah
begitu server/user pindah timezone atau daylight saving (walau Indonesia
tidak DST, tim/klien lintas negara bisa kena). Aturan tunggal "DB selalu UTC"
menghilangkan seluruh kelas bug ini dari akarnya — **ini di-cek juga di
skill `security-review`/checklist review kalau ada kolom timestamp baru**.

## Field Group Lain (Fase Berikutnya, Bukan Wajib di Fase 01)
- **`integrations`**: `google.analyticsId` (GA4 Measurement ID) — opsional,
  kalau nanti butuh tracking usage dashboard internal.

## Field Group `data` (Fase 10)
| Key | Value | Catatan |
|---|---|---|
| `data.importRetentionDays` | integer (hari) | Default 2, WAJIB divalidasi 1–7 (§ `architecture-subscription.md` § "Retensi Data Import" — batas 7 hari HARDCODE, bukan cuma UI). Dipakai job `PURGE_OLD_IMPORTS` sebagai default kalau `subscriptions.importRetentionDaysOverride` kosong. |

## Field Group `billing` (Fase 15, ADR-0021)
| Key | Value | Catatan |
|---|---|---|
| `company.taxId` | string | NPWP, free text (tidak divalidasi format — bisa beda-beda instansi) |
| `company.phone` | string | Nomor telepon company, tampil di footer PDF invoice |
| `company.email` | string | Email company, tampil di footer PDF invoice |
| `company.bankAccount` | string (free text, multi-baris) | "Instruksi Pembayaran" — nama bank, no rekening, atas nama. Free text SENGAJA (bisa >1 rekening/metode), bukan field terstruktur |

Semua field ini opsional (boleh kosong) — PDF generator (§ `architecture-invoice.md`)
cukup skip baris footer yang value-nya kosong, JANGAN tampilkan placeholder
kosong/`undefined` mentah di dokumen resmi yang dilihat customer.

## Komponen Frontend
```
apps/web/app/admin/(protected)/settings/page.tsx   ← nama, alamat, timezone, retensi data
```
> Path DIKOREKSI Fase 10 — draf awal doc ini menulis `app/(admin)/settings/`,
> TIDAK sesuai konvensi routing final (§ `architecture-domain-routing.md`,
> surface admin di `app/admin/(protected)/`, bukan route group `(admin)`).
> Logo/favicon company DITUNDA di Fase 10, **sudah diimplementasikan Fase 12**
> (§ ADR-0017, `docs/phases/phase-12-logo-favicon-branding.md`) — widget
> upload ada di halaman settings yang sama. Halaman `integrations/` (Google
> Analytics) MASIH ditunda, belum ada fase yang menjadwalkannya.

Form pakai `react-hook-form` + `zod` (§ ADR-0004). Field alamat cukup
`Textarea` biasa (project ini tidak pakai komponen Alamat terstruktur).

## API
```
GET  /settings?group=general    → { "company.name": "...", ... } — WAJIB login (auth: true)
GET  /settings?group=data       → { "data.importRetentionDays": 2 }
PUT  /settings                  → body: { key, value, group }[] — update banyak sekaligus
GET  /settings/public            → { "company.name", "company.logo", "company.favicon" } SAJA,
                                     TANPA auth sama sekali (§ Fase 12, ADR-0017) — allowlist
                                     eksplisit di kode, JANGAN pernah expose row lain di endpoint
                                     ini (ingat Critical finding Fase 00: GET /settings pernah
                                     bocor semua row tanpa guard).
POST /admin/branding/logo        → multipart, 1 file image, permission settings.update,
                                     upload ke bucket public, update settings.company.logo (§ Fase 12)
POST /admin/branding/favicon     → multipart, 1 file image, permission settings.update,
                                     generate 4 ukuran PNG, update settings.company.favicon (§ Fase 12)
```
Endpoint `PUT`/`POST admin/branding/*` WAJIB auth guard + permission check
(cuma role tertentu, mis. `owner`/`admin`, boleh ubah settings) — bukan
endpoint publik. `GET /settings/public` SENGAJA publik (dipakai landing page
& tag favicon di halaman yang belum login), tapi WAJIB filter allowlist di
kode, bukan buka semua row.

## Referensi
- Logo/favicon → `components/architecture-component-media-library.md`,
  `components/architecture-component-image-processing.md`,
  `docs/decisions/adr-0017-branding-public-bucket.md`
