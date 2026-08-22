# Architecture — Search

## Tool: Postgres Full-Text Search (default) — Bukan Meilisearch/Typesense dari Awal
**Kenapa native Postgres dulu:** sama prinsipnya dengan `architecture-jobs.md`
— stack ini sudah punya Postgres, nambah search engine terpisah itu 1
service lagi untuk kebutuhan yang di skala awal (ratusan-ribuan baris) belum
tentu perlu. Postgres `tsvector` + GIN index cukup cepat untuk skala ini.

**Kapan pindah ke Meilisearch/Typesense:** kalau butuh typo-tolerance
("pesantren" ketik "pesanteren" tetap ketemu), ranking relevansi lebih
canggih, atau data sudah puluhan ribu+ baris dan query mulai lambat —
**revisit lewat ADR baru**.

## Implementasi
```ts
// apps/api/src/db/schema.ts
import { sql } from "drizzle-orm";

export const posts = pgTable("posts", {
  // ...kolom lain
  searchVector: text("search_vector").generatedAlwaysAs(
    (): SQL => sql`to_tsvector('indonesian', title || ' ' || content)`
  ),
}, (table) => ({
  searchIdx: index("posts_search_idx").using("gin", table.searchVector),
}));
```
> Konfigurasi bahasa `'indonesian'` — Postgres punya dictionary bawaan
> Indonesia (stemming dasar), cukup untuk kebanyakan kasus. Kalau konten
> campur ID+EN, pertimbangkan kolom `search_vector` terpisah per bahasa atau
> `simple` config (tanpa stemming) sebagai fallback.

```ts
// apps/api/src/services/search.service.ts
export async function searchPosts(query: string) {
  return db.execute(sql`
    SELECT *, ts_rank(search_vector, websearch_to_tsquery('indonesian', ${query})) AS rank
    FROM posts
    WHERE search_vector @@ websearch_to_tsquery('indonesian', ${query})
    ORDER BY rank DESC
    LIMIT 20
  `);
}
```
> `websearch_to_tsquery` (bukan `to_tsquery` biasa) — support query gaya
> Google (`"frasa exact"`, `kata -exclude`) tanpa perlu parsing manual di
> application layer.

## Kapan Dianggap "Sudah Tidak Cukup" (Sinyal Upgrade)
- Query search jadi >500ms konsisten walau sudah ada index yang benar.
- User butuh cari across banyak tabel sekaligus dengan ranking gabungan
  (posts + produk + user, 1 search box) — native Postgres bisa tapi makin
  rumit query-nya.
- Butuh faceted search (filter kategori+harga+lokasi bersamaan dengan count
  per opsi) — ini domain kuat Meilisearch/Typesense/Algolia.

## Referensi
- Kolom yang di-search WAJIB tervalidasi dari input user (hindari query
  Postgres berat dari input sembarangan) → `architecture-security.md` §2
