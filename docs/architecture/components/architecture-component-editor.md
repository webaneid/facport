# Component — Rich Text Editor

## Tool: Tiptap
Sudah dipakai & terbukti jalan (termasuk oEmbed) di project sebelumnya — jadi
ini bukan pilihan baru, cuma distandarkan supaya SEMUA project berikutnya
pakai pola yang sama, bukan reinvent tiap kali.

**Kenapa Tiptap** (untuk yang belum familiar): headless (kontrol penuh atas
UI toolbar, tidak dipaksa tampilan bawaan), berbasis ProseMirror (battle-tested),
gratis untuk fitur inti, extensible lewat extension system.

## Struktur Komponen
```
apps/web/components/editor/
  editor.tsx              ← komponen utama, terima value/onChange (controlled)
  extensions.ts            ← daftar extension yang dipakai (StarterKit, Image, Link, dst)
  toolbar.tsx              ← toolbar terpisah dari editor inti (reusable/swappable)
  media-library-extension.ts ← custom extension: tombol "Insert Image" buka Media Library picker
```

## Extension Wajib Ada
- `StarterKit` (bold, italic, heading, list, dst — bawaan Tiptap)
- `Image` — **WAJIB terhubung ke Media Library** (§ `architecture-component-media-library.md`),
  bukan upload langsung dari editor. Tombol "Insert Image" di toolbar buka
  Media Library picker, hasil pilihan (URL final dari MinIO) yang di-insert
  — supaya semua gambar (dari editor maupun form lain) tetap tercatat di 1
  tempat (tabel `media`), tidak ada gambar "siluman" yang tidak ke-track.
- `Link` — dengan validasi URL dasar (jangan `javascript:` dsb, XSS vector)
- Oembed (video YouTube dll) — custom extension, contoh implementasi sudah
  ada di project sebelumnya, replikasi polanya.

## Penyimpanan Konten
Simpan sebagai **JSON** (native format ProseMirror/Tiptap), BUKAN HTML string
mentah di kolom `content`:
```ts
content: jsonb("content").notNull(), // Tiptap JSON, bukan text HTML
```
**Kenapa JSON, bukan HTML:**
- Render ulang ke HTML kapan saja lewat Tiptap (`generateHTML()`), tapi tidak
  bisa sebaliknya (HTML → JSON kehilangan struktur semantik editor).
- JSON lebih aman dari XSS by-default (bukan string HTML mentah yang bisa
  disusupi tag berbahaya) — TAPI tetap WAJIB sanitize saat render HTML final
  ke browser (`isomorphic-dompurify`, sudah disebut di `architecture-security.md` §2).

## Referensi
Dipakai di: konten halaman bantuan/dokumentasi internal, catatan pada import
batch, dan tempat lain yang butuh rich text — project ini tidak punya
konten publik (blog/produk) yang butuh SEO analyzer.
