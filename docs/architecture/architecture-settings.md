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
| `company.logo` | media ID (uuid) | Reference ke tabel `media` |
| `company.favicon` | media ID (uuid) | Lihat catatan multi-ukuran di `components/architecture-component-image-processing.md` |
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

## Komponen Frontend
```
apps/web/app/(admin)/settings/
  general/page.tsx        ← nama, alamat, logo, favicon, timezone
  integrations/page.tsx    ← Google Analytics (opsional)
```
Form pakai `react-hook-form` + `zod` (§ ADR-0004). Field alamat cukup
`Textarea` biasa (project ini tidak pakai komponen Alamat terstruktur).

## API
```
GET  /settings?group=general    → { "company.name": "...", ... }
PUT  /settings                  → body: { key, value }[] — update banyak sekaligus
```
Endpoint `PUT` WAJIB auth guard + permission check (cuma role tertentu, mis.
`owner`/`admin`, boleh ubah settings) — bukan endpoint publik.

## Referensi
- Logo/favicon → `components/architecture-component-media-library.md`,
  `components/architecture-component-image-processing.md`
