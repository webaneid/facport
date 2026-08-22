# ADR-0004: UI & Component Standards

**Status:** Accepted
**Tanggal:** 2026-08-18

## Context
Tanpa standar komponen yang jelas sejak awal, tiap fitur baru cenderung
reinvent pola sendiri-sendiri (dropdown beda, upload handler beda, form
validation beda) — menambah inkonsistensi dan risiko hardcode yang jadi
concern utama project ini. ADR ini mengonsolidasikan seluruh keputusan
tool/library untuk styling, komponen reusable, i18n, dan hal terkait yang
dibahas dalam satu sesi supaya tidak tersebar di banyak ADR kecil-kecil.

## Decision

| Kebutuhan | Tool | Alasan Singkat |
|---|---|---|
| Styling | Tailwind v4 (primary), SCSS (cuma untuk kasus tidak bisa Tailwind) | Konsistensi — SCSS sebagai alternatif setara akan memecah gaya penulisan antar sesi/developer |
| Icon | `lucide-react` | SVG individual, tree-shakeable, MIT, sudah default shadcn/ui |
| Multi-language | `next-intl` | Native App Router, type-safe. Default ID, fallback EN — lihat `architecture-i18n.md` |
| Form validation | `zod` + `react-hook-form` | Belum ada standar sebelumnya — fondasi supaya semua form konsisten polanya |
| Dropdown/select | `cmdk` (Command) + Popover (shadcn) | Wajib untuk semua pilihan >~10 opsi atau data async — lihat `components/architecture-component-autocomplete.md` |
| Rich text editor | Tiptap | Sudah terbukti jalan di project sebelumnya (dengan oEmbed) |
| Data wilayah Indonesia | Seed dari `cahyadsn/wilayah` (GitHub) | Berbasis kode resmi Kemendagri, paling aktif di-maintain, jadi rujukan repo turunan lain |
| Image processing | `sharp` | Native, kompatibel Bun, smart-crop bawaan (`position: attention`), gratis |
| SEO analyzer | `yoastseo` (npm) | Library ASLI Yoast, bukan tiruan — **lisensi GPL-3.0, lihat catatan di bawah** |
| Sitemap | XML dinamis + `llms.txt` (llmstxt.org) | XML = standar wajib untuk Google/Bing. `llms.txt` = standar baru untuk AI crawler, forward-looking |
| Notifikasi UI | `sonner` | Pasangan lazim shadcn/ui, hindari 5 gaya toast beda-beda di 5 fitur |
| Data table/listing | `@tanstack/react-table` (+ shadcn data-table pattern) | Kebutuhan berulang di hampir semua project (listing user, produk, dll) |
| Timezone | DB selalu `timestamptz` UTC, convert cuma saat tampil (`date-fns-tz`/`Intl`) | Sumber bug paling sering — 1 aturan tunggal menghilangkan seluruh kelas bug ini |

## Catatan Lisensi Penting — `yoastseo` (GPL-3.0)
Beda dari mayoritas dependency lain di project ini (rata-rata MIT/Apache-2.0),
`yoastseo` berlisensi **GPL-3.0** (copyleft). Aman dipakai selama project
dijalankan sebagai layanan sendiri (SaaS, tidak didistribusikan source/binary
ke pihak lain). **WAJIB direview ulang** kalau skenario bisnis berubah jadi
menjual source code/software on-premise ke klien — itu memicu kewajiban GPL
menyebar ke seluruh codebase yang di-link dengannya. Ini bukan nasihat hukum,
cuma pengingat teknis untuk dicek kalau skenario bisnis berubah.

## Alternatif yang Dipertimbangkan (Ringkas)
- **`next-i18next`** ditolak — didesain untuk Pages Router, bukan App Router.
- **API panggil data wilayah pihak ketiga real-time** ditolak — ketergantungan
  uptime API luar untuk fitur inti (form alamat).
- **Icon font (Font Awesome dkk)** ditolak — bawa seluruh font-file walau
  cuma pakai sedikit icon, jauh lebih berat dari SVG per-icon.
- **Moment.js** untuk timezone ditolak — sudah dianggap legacy oleh
  maintainer-nya sendiri, lebih berat dari `date-fns-tz`/`Intl` native.

## Konsekuensi
- Struktur dokumen bertambah: `docs/architecture/architecture-components.md`
  (index) + `docs/architecture/components/*.md` (per komponen) +
  `docs/architecture/architecture-settings.md` +
  `docs/architecture/architecture-i18n.md`.
- `docs/architecture/architecture-database.md` perlu section timezone
  eksplisit (lihat update terkait).
- `.claude/skills/project-init/SKILL.md` perlu langkah setup skeleton
  komponen ini di Fase 00, bukan ditunda ke fase fitur pertama.
- Dependency GPL (`yoastseo`) perlu ditandai di `package.json`/dokumentasi
  supaya tidak kelupaan kalau skenario bisnis berubah (lihat catatan lisensi
  di atas).
