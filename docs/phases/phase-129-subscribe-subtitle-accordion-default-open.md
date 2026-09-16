# Fase 129 — /subscribe: Subtitle + Accordion Default-Open Per Kartu

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Bagian pertama dari permintaan 3-bagian user (2026-09-17) soal UI/fitur
langganan — bagian ini murni UI kecil di `/subscribe`:

1. Tambah subtitle "Pilih fitur yang ingin Anda gunakan" di bawah judul
   Produk (mis. "Facport").
2. Ubah perilaku accordion: baris Varian PERTAMA tiap kartu Kategori
   SELALU terbuka (harga+info langsung kelihatan), berlaku SIMULTAN di
   SEMUA kartu Kategori sekaligus — bukan cuma 1 Varian terbuka se-halaman
   seperti desain Fase 127. Tujuan: jadi trigger orang mau berlangganan
   (harga langsung kelihatan tanpa perlu klik).

Part 2 (audit tampilan expiry date + duplikasi subscription) dan Part 3
(notifikasi expiry — email/bell/banner) BELUM dikerjakan fase ini — akan
jadi fase terpisah setelah audit Part 2 selesai.

## Scope
- [x] `apps/web/components/subscribe/product-catalog-section.tsx` — tambah
      `<p>` subtitle di bawah `<h2>{title}</h2>`, sebelum garis pemisah.
- [x] `apps/web/components/subscribe/category-card.tsx` — tiap kartu
      Kategori sekarang render `<Accordion>` Root SENDIRI (`type="single"
      collapsible defaultValue={groups[0]?.moduleKey}`), bukan lagi cuma
      `AccordionItem` polos yang bergantung ke Root 1 level di atas.
- [x] `apps/web/components/subscribe/subscribe-form.tsx` — hapus
      `<Accordion>` Root page-level + state `openModuleKey` (exclusivity
      lintas-kartu TIDAK relevan lagi, diganti `<div>` layout polos).

## Keputusan Kecil Selama Eksekusi
- **Exclusivity dipersempit dari "1 se-halaman" jadi "1 per kartu"** —
  desain Fase 127 (1 Accordion.Root membungkus SELURUH halaman) secara
  matematis TIDAK BISA menghasilkan "baris pertama tiap kartu selalu
  terbuka SIMULTAN" (Radix `type="single"` di 1 Root cuma boleh 1 value
  aktif GLOBAL). Satu-satunya cara accordion Radix kasih "1 terbuka per
  grup, banyak grup independen" adalah 1 Root per grup — jadi Root
  dipindah turun ke `CategoryCard` (1 Root per kartu Kategori), TIDAK
  ditulis accordion primitive custom baru.
- **Subtitle ditaruh di `ProductCatalogSection` (bukan `subscribe-form.tsx`
  langsung)** — komponen ini sudah didesain reusable/presentational sejak
  Fase 127 (rencana ditarik ke landing page nanti), teks subtitle generik
  ("Pilih fitur yang ingin Anda gunakan") cocok utk Produk manapun, bukan
  spesifik "Facport" — jadi 1 baris di komponen shared, bukan hardcode di
  pemanggil.
- **`groups[0]?.moduleKey` sebagai `defaultValue`** — `groups` per Kategori
  BELUM diurutkan eksplisit (ikut urutan asal dari `useGroupedPlans`/
  `MODULE_CATALOG`), tapi ini SUDAH konsisten cara lama menentukan "modul
  pertama" (grid lama Fase <127 juga tidak custom-sort), jadi tidak
  ditambah sorting baru di luar scope.

## Verifikasi
- `bun run typecheck` (apps/web) — 0 error.
- `bun run lint` (apps/web) — 0 error.
- Tidak ada file backend/logic disentuh (murni presentational) — tidak
  perlu re-run `bun run test`.
- Verifikasi visual browser — BERHASIL kali ini (dev server sudah jalan,
  sesi browser sudah login dari kerja sebelumnya, tidak kena masalah
  session yang biasa terjadi di environment ini). Dikonfirmasi: (1)
  subtitle tampil di bawah judul "Facport", (2) kartu "Sales" — baris
  "Sales Invoice" terbuka default (harga+pilih periode langsung
  kelihatan), baris "Sales Receipt" tertutup, (3) klik "Sales Receipt" →
  terbuka & "Sales Invoice" otomatis tertutup (exclusivity PER KARTU
  masih jalan benar, cuma lintas-kartu yang tidak lagi exclusive).
- Security review — perubahan MURNI presentational (restrukturisasi
  Accordion Root + 1 baris teks statis), tidak ada endpoint/query/auth
  baru, tidak ada state baru yang dipakai sebagai keputusan otorisasi.
  0 temuan.

## Known Limitations
- Data Usaha test yang dipakai verifikasi cuma punya 1 Kategori aktif
  (Sales) — belum terverifikasi visual dengan >1 kartu Kategori tampil
  bersamaan (mis. Sales + Purchase + Cash & Bank), meski secara logic
  (1 Accordion.Root independen per `CategoryCard`) seharusnya identik
  perilakunya berapa pun jumlah kartu.

## Ringkasan Hasil
`/subscribe` sekarang punya subtitle di bawah judul Produk, dan baris
Varian pertama tiap kartu Kategori terbuka default (bukan tertutup semua)
— exclusivity accordion dipersempit dari "1 se-halaman" (Fase 127) jadi
"1 per kartu" supaya semua kartu bisa sama-sama menampilkan harga
pertamanya sekaligus. Checkout/trial/fetch data tidak disentuh.
