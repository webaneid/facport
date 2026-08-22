# Architecture — Components (Index)

> Ini INDEX saja — detail tiap komponen ada di file terpisah di
> `docs/architecture/components/`. Jangan baca semua file kalau cuma perlu
> perbaiki 1 komponen — baca index ini untuk orientasi, lalu buka file
> spesifik yang relevan saja (hemat token).

## Kenapa Komponen Ini WAJIB Ada Sejak Awal (Bukan Ditambah Belakangan)
Semua komponen di bawah ini dipakai **berulang lintas fitur** — kalau tidak
distandarkan dari fase pertama, tiap fitur baru cenderung bikin versi
sendiri-sendiri yang beda pola (upload handler beda, dropdown beda, dst),
dan itu sendiri jadi sumber inkonsistensi/hardcode yang susah dibenahi belakangan.

> Project ini TIDAK pakai Komponen Alamat, SEO Analyzer, Sitemap, atau
> i18n (checklist Kebutuhan Komponen = Tidak, lihat `PROJECT-INIT-PROMPT.md`)
> — file-file itu sudah dihapus dari `docs/architecture/`.

## Daftar Komponen

| Komponen | File | Dipakai Untuk |
|---|---|---|
| Autocomplete / Combobox | `components/architecture-component-autocomplete.md` | Semua dropdown-select — WAJIB pakai pola ini, jangan `<select>` polos untuk pilihan >~10 opsi. Juga dipakai untuk UI "cocokkan kolom" import mapping (§ `architecture-accurate-integration.md`) |
| Rich Text Editor | `components/architecture-component-editor.md` | Konten halaman bantuan/dokumentasi internal, dll — TIDAK dipakai untuk konten publik (project ini tidak punya landing page/blog) |
| Media Library | `components/architecture-component-media-library.md` | Semua upload gambar/file — logo perusahaan, avatar user |
| Image Processing (autocrop/resize) | `components/architecture-component-image-processing.md` | Otomatis jalan saat upload lewat Media Library |

## Komponen Lain yang Terkait (Bukan di Folder Ini)
- **Settings Page** (nama perusahaan, logo, favicon, timezone, integrasi
  Google) → `docs/architecture/architecture-settings.md` — ini "wadah" yang
  memakai beberapa komponen di atas (media library untuk logo).
- **Keputusan tool/library untuk semua komponen ini** (lucide-react, Tiptap,
  sharp, dst — beserta alasannya) → `docs/decisions/adr-0004-ui-component-standards.md`

## Prinsip Umum Semua Komponen
- **Reusable lewat referensi, bukan duplikasi tabel.** Contoh nyata di
  project ini: tabel `media` (`core.schema.ts`) SATU tabel dipakai untuk
  semua upload gambar (logo perusahaan lewat Settings, dst) — bukan bikin
  tabel `settings_logo`, `xxx_images` terpisah dengan struktur sama
  persis tiap kali ada fitur baru yang butuh upload gambar. Kalau nanti
  butuh pola polymorphic reference (1 tabel dipakai banyak entity lewat
  `entity_type`+`entity_id`), belum ada contoh nyata di project ini —
  desain sesuai kebutuhan waktu itu muncul, jangan bikin skema
  spekulatif duluan.
- **Komponen frontend generic & reusable**, terima props/callback, JANGAN
  hardcode konteks pemakaian di dalam komponennya (mis. Media Library picker
  tidak boleh tahu dia dipanggil dari "form produk" — dia cuma tahu
  "pilih/upload file, kembalikan URL").
- Semua komponen ini didokumentasikan di sini SEBELUM diimplementasi di
  fase manapun — `project-init` skill akan setup skeleton dasarnya di
  Fase 00 (lihat `.claude/skills/project-init/SKILL.md`).
