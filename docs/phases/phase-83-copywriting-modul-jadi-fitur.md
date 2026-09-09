# Fase 83 — Copywriting: "Modul"/"Sub-Modul" Jadi "Fitur" di Semua UI

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
User (pemilik Facport) minta istilah komunikasi ke client/di semua UI
diseragamkan jadi **"Fitur"** — "modul"/"sub-modul" HANYA istilah teknis
internal (kode, komentar, dokumentasi arsitektur, identifier), TIDAK
BOLEH muncul di teks yang dibaca user (customer MAUPUN admin/staff).

## Scope
Audit MENYELURUH `apps/web` untuk semua teks user-facing (JSX text,
label, `description`/`title` prop, pesan error/toast) yang mengandung
kata "modul"/"sub-modul" (case-insensitive), diganti "fitur" — TANPA
menyentuh:
- Nama variabel/fungsi/tipe (`moduleKey`, `ModuleGroup`, `moduleLabel`,
  dst) — technical identifier, bukan teks yang dibaca user.
- Komentar kode (`//`, `/* */`) — dokumentasi teknis internal.
- Enum value/error code string LITERAL yang dipakai logic (`"specific_modules"`,
  `"MODULE_ALREADY_SUBSCRIBED"`, dst) — cuma LABEL tampilannya yang diganti.

**File yang diubah** (14 file, semua di `apps/web`):
- Customer-facing: `app/landing/module-features.tsx`, `app/landing/page.tsx`,
  `app/app/(protected)/page.tsx`, `app/app/(protected)/subscribe/page.tsx`,
  `app/app/(protected)/accurate/page.tsx`, `app/app/(protected)/import/arsip/page.tsx`,
  `app/app/(protected)/billing/page.tsx`.
- Admin-facing: `app/admin/(protected)/page.tsx`,
  `app/admin/(protected)/settings/page.tsx`, `app/admin/(protected)/plans/page.tsx`,
  `app/admin/(protected)/announcements/page.tsx`, `app/admin/(protected)/users/page.tsx`,
  `app/admin/(protected)/users/[id]/page.tsx`.
- Komponen: `components/admin/dashboard/module-popularity-bar-chart.tsx`,
  `components/import-archive/import-batch-table.tsx`.

Contoh perubahan: "Pilih sub-modul yang kamu butuhkan" → "Pilih fitur
yang kamu butuhkan", kolom tabel "Modul" → "Fitur", "Popularitas
Sub-Modul" → "Popularitas Fitur", "Sub-Modul ini sudah aktif." → "Fitur
ini sudah aktif.", dst.

## Keputusan Kecil Selama Eksekusi
- **Ditanyakan eksplisit ke user**: apakah scope cuma customer-facing
  atau semua UI termasuk admin — user pilih **SEMUA UI** (admin +
  customer), bukan cuma customer-facing.
- **`apps/api` TIDAK ada perubahan** — dicek menyeluruh, backend cuma
  balikin error CODE (`"MODULE_ALREADY_SUBSCRIBED"`, dst), frontend yang
  menerjemahkan ke teks — semua terjemahan teks itu ada di `apps/web`,
  sudah ter-cover di scope ini.
- **Tidak rename identifier/variable** — `moduleKey`, `ModuleGroup`,
  `moduleLabel()`, dst TETAP nama aslinya (istilah teknis "antara
  developer", sesuai instruksi eksplisit user) — cuma STRING yang
  ditampilkan ke user yang berubah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — TIDAK relevan (pure copywriting, tidak ada
      logic/data flow yang berubah).
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- Tidak ada — ini pure text change, tidak ada risiko fungsional.

## Ringkasan Hasil
Semua teks user-facing (customer DAN admin) yang sebelumnya bilang
"modul"/"sub-modul" sekarang bilang "fitur" — 14 file `apps/web`
diperbarui. Identifier kode & komentar teknis TIDAK disentuh (tetap
"modul"/"sub-modul" sebagai istilah internal). `bun run typecheck` 0
error, `bun test` apps/web 44 pass/0 fail (tidak ada test yang bergantung
pada teks lama).
