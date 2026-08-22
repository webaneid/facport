# ADR-0004: UI & Component Standards

**Status:** Accepted
**Tanggal:** 2026-08-18

## Context
Tanpa standar komponen yang jelas sejak awal, tiap fitur baru cenderung
reinvent pola sendiri-sendiri (dropdown beda, upload handler beda, form
validation beda) — menambah inkonsistensi dan risiko hardcode yang jadi
concern utama project ini. ADR ini mengonsolidasikan seluruh keputusan
tool/library untuk styling, komponen reusable, dan hal terkait yang
dibahas dalam satu sesi supaya tidak tersebar di banyak ADR kecil-kecil.

> Project ini TIDAK pakai i18n, SEO analyzer, Sitemap, atau Komponen Alamat
> (Checklist Kebutuhan Komponen = Tidak, lihat `CLAUDE.md` root) — baris
> tool untuk fitur itu sudah dihapus dari tabel di bawah.

## Decision

| Kebutuhan | Tool | Alasan Singkat |
|---|---|---|
| Styling | Tailwind v4 (primary), SCSS (cuma untuk kasus tidak bisa Tailwind) | Konsistensi — SCSS sebagai alternatif setara akan memecah gaya penulisan antar sesi/developer |
| Icon | `lucide-react` | SVG individual, tree-shakeable, MIT, sudah default shadcn/ui |
| Form validation | `zod` + `react-hook-form` | Belum ada standar sebelumnya — fondasi supaya semua form konsisten polanya |
| Dropdown/select | `cmdk` (Command) + Popover (shadcn) | Wajib untuk semua pilihan >~10 opsi atau data async — lihat `components/architecture-component-autocomplete.md` |
| Rich text editor | Tiptap | Sudah terbukti jalan di project sebelumnya (dengan oEmbed) |
| Image processing | `sharp` | Native, kompatibel Bun, smart-crop bawaan (`position: attention`), gratis |
| Notifikasi UI | `sonner` | Pasangan lazim shadcn/ui, hindari 5 gaya toast beda-beda di 5 fitur |
| Data table/listing | `@tanstack/react-table` (+ shadcn data-table pattern) | Kebutuhan berulang di hampir semua project (listing user, produk, dll) |
| Timezone | DB selalu `timestamptz` UTC, convert cuma saat tampil (`date-fns-tz`/`Intl`) | Sumber bug paling sering — 1 aturan tunggal menghilangkan seluruh kelas bug ini |

## Alternatif yang Dipertimbangkan (Ringkas)
- **Icon font (Font Awesome dkk)** ditolak — bawa seluruh font-file walau
  cuma pakai sedikit icon, jauh lebih berat dari SVG per-icon.
- **Moment.js** untuk timezone ditolak — sudah dianggap legacy oleh
  maintainer-nya sendiri, lebih berat dari `date-fns-tz`/`Intl` native.

## Konsekuensi
- Struktur dokumen bertambah: `docs/architecture/architecture-components.md`
  (index) + `docs/architecture/components/*.md` (per komponen) +
  `docs/architecture/architecture-settings.md`.
- `docs/architecture/architecture-database.md` perlu section timezone
  eksplisit (lihat update terkait).
- `.claude/skills/project-init/SKILL.md` perlu langkah setup skeleton
  komponen ini di Fase 00, bukan ditunda ke fase fitur pertama.
