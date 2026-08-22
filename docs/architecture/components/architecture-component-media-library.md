# Component — Media Library

## Kenapa Wajib Ada Sejak Fase Pertama
Hampir semua fitur butuh upload/pilih gambar-file (logo perusahaan, avatar
user, gambar produk, gambar artikel). Kalau ditunda, tiap fitur bikin upload
handler sendiri-sendiri — hasilnya: gambar tersebar tidak ke-track, tidak
bisa di-reuse ("saya sudah upload gambar ini, kok harus upload lagi"), dan
sulit di-cleanup (gambar orphan yang tidak dipakai lagi tapi tetap makan
storage).

## UI/UX — Referensi WordPress Media Library
- **Grid view** — thumbnail gambar, sort terbaru dulu.
- **Upload via drag-drop** ATAU klik tombol "Upload Baru" — upload bisa multi-file sekaligus.
- **Filter**: by tipe file (gambar/dokumen/video), by tanggal, by folder/tag (opsional, boleh Fase 2).
- **Search** by nama file/alt text.
- **Klik item** → panel detail: preview besar, alt text (WAJIB diisi untuk
  gambar — SEO & aksesibilitas), edit crop manual (opsional, lihat
  `architecture-component-image-processing.md` untuk auto-crop), tombol
  "Gunakan" (kembalikan URL ke pemanggil) dan "Hapus".
- **Mode pemanggilan ganda**:
  - **Modal picker** — dipanggil dari editor/form lain (mis. tombol "Insert
    Image" di Tiptap), user pilih dari library ATAU upload baru, lalu modal
    nutup dan balikin URL ke pemanggil.
  - **Halaman penuh** — `/admin/media` — kelola semua file, tanpa konteks
    pemanggilan tertentu.

## Skema Database
```ts
export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(), // nama asli (untuk display), BUKAN nama file di storage
  storageKey: varchar("storage_key", { length: 500 }).notNull(), // path di MinIO, UUID-generated (lihat architecture-storage.md — jangan pakai nama asli di storage)
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"), // null untuk file non-gambar
  height: integer("height"),
  altText: varchar("alt_text", { length: 255 }), // WAJIB diisi untuk gambar dipakai publik — dicek di security-review kalau relevan ke SEO
  variants: jsonb("variants"), // { thumbnail: "key...", medium: "key...", large: "key...", og: "key..." } — lihat architecture-component-image-processing.md
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```
> Kolom `variants` nyimpen key hasil auto-crop (§ image-processing) — jadi
> tidak perlu query ulang/generate ulang tiap kali butuh ukuran tertentu.

## Komponen Frontend
```
apps/web/components/media-library/
  media-library-modal.tsx   ← dipanggil sebagai picker dari komponen lain
  media-library-page.tsx    ← halaman penuh /admin/media
  media-grid.tsx             ← grid + infinite scroll/pagination
  media-upload-dropzone.tsx  ← drag-drop upload
  media-detail-panel.tsx     ← panel edit alt text, crop manual, hapus
```
Kontrak pemanggilan picker (dipakai dari mana pun — editor, form logo
settings, dst):
```ts
type MediaLibraryPickerProps = {
  accept?: string; // mis. "image/*" — filter tipe file yang bisa dipilih
  multiple?: boolean;
  onSelect: (selected: { id: string; url: string; altText: string | null }[]) => void;
};
```

## Alur Upload
```
Client → pilih/drop file → POST /media/upload (multipart, lewat presigned
URL — lihat architecture-storage.md Opsi B) → API validasi MIME+size →
generate variants (image-processing.md) → simpan row `media` → return ke client
```

## Referensi
- Storage backend → `docs/architecture/architecture-storage.md`
- Auto-crop/resize → `docs/architecture/components/architecture-component-image-processing.md`
- Dipanggil dari editor → `docs/architecture/components/architecture-component-editor.md`
