# Fase 127 — Redesain /subscribe: Grup Produk → Kategori → Varian (Accordion)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Konsisten dengan taksonomi Brand→Produk→Kategori→Varian yang baru saja
dibangun di sidebar (Fase 126), halaman `/subscribe` (katalog langganan
customer) direstruktur dari grid flat 1-kartu-per-modul jadi grid
1-kartu-per-Kategori (checklist Varian), klik 1 Varian buka panel harga
accordion di bawahnya — HANYA 1 Varian boleh terbuka se-halaman (lintas
kartu, lintas Produk). User kasih 2 referensi visual (katalog kartu +
tampilan accordion terbuka), rencana lengkap → plan mode session yang
disetujui sebelum eksekusi (`docs/decisions/` tidak perlu ADR baru, ini
murni restrukturisasi presentasional di atas taksonomi yang SUDAH
diputuskan ADR-0033/Fase 117/126).

Tujuan jangka panjang (BUKAN scope fase ini): komponen baru dibuat
reusable/presentational (semua state via props, tidak fetch sendiri)
supaya bisa ditarik ke landing page publik nanti — landing TIDAK
disentuh fase ini.

## Scope
- [x] `apps/web/lib/category-icons.ts` (BARU) — ekstrak `CATEGORY_ICON`
      dari `sidebar.tsx` (tadinya private), supaya dipakai konsisten
      sidebar ↔ katalog langganan.
- [x] `apps/api/src/lib/module-catalog.ts` — tambah `moduleProductLine(key)`
      (pola identik `moduleCategory`).
- [x] `apps/web/lib/module-options.ts` — re-export fungsi baru itu.
- [x] `apps/web/components/app-shell/sidebar.tsx` — ganti const lokal
      `CATEGORY_ICON` jadi import dari file baru (behavior IDENTIK).
- [x] `apps/web/components/subscribe/module-pricing-panel.tsx` (BARU) —
      isi panel accordion 1 Varian, LIFT LANGSUNG dari kode lama
      (icon+tagline+harga+pilih periode+Berlangganan/Coba Gratis).
- [x] `apps/web/components/subscribe/category-card.tsx` (BARU) — 1 kartu
      Kategori (icon+nama+checklist Varian sebagai AccordionItem).
- [x] `apps/web/components/subscribe/product-catalog-section.tsx` (BARU) —
      1 Produk = judul+garis+grid kartu Kategori, komponen REUSABLE utama.
- [x] `apps/web/components/subscribe/subscribe-form.tsx` — bagian RENDER
      diganti (SATU `Accordion type="single" collapsible` membungkus
      semua `ProductCatalogSection` per `PRODUCT_LINES`, exclusivity
      lintas-kartu-lintas-Produk otomatis dari Radix). Bagian FETCH DATA/
      checkout/trial TIDAK disentuh sama sekali.

## Keputusan Kecil Selama Eksekusi
- **Exclusivity lintas-kartu** dicapai dengan SATU `Accordion.Root` di
  level PALING LUAR (bukan 1 Accordion per kartu Kategori) — riset awal
  konfirmasi tidak ada preseden pola ini di codebase (3 pemakaian
  `Accordion` lain semua `type="multiple"` atau 1 instance mandiri),
  tapi Radix `type="single"` pada 1 Root SUDAH otomatis kasih exclusivity
  itu tanpa state manual custom, jadi tetap pakai komponen `Accordion`
  yang sudah ada, bukan bikin primitive baru.
- **`groupByCategory` di `product-catalog-section.tsx` SENGAJA duplikasi
  kecil** dari `groupItemsByCategory` di `sidebar.tsx` (bukan diekstrak
  jadi 1 fungsi shared) — hindari sentuh ulang sidebar yang baru saja
  stabil (Fase 126, sudah melalui beberapa putaran fix bareng user).
  Konsisten prinsip project "3 baris mirip lebih baik drpd abstraksi
  prematur".
- **Judul halaman "Berlangganan"/subtitle lama DIHAPUS**, diganti judul
  per-Produk ("Facport" sebagai judul besar pertama) — sesuai instruksi
  eksplisit user poin 1 ("judul besar dulu paling atas aplikasi
  Facport, lalu garis, lalu baru list produk").
- **Trigger checklist Varian TANPA badge status** (badge "Sudah
  Berlangganan"/"Sedang Trial" cuma di panel accordion yang terbuka,
  sama seperti kode lama) — hindari duplikasi visual/clutter, closed
  row tetap simpel (checkmark + nama) sesuai referensi gambar user.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] `bun run test` — 1067 pass, 0 fail (tidak ada logic backend yang
      berubah selain 1 fungsi murni baru `moduleProductLine`)
- [x] Security review dijalankan — 0 temuan (state UI baru tidak pernah
      dipakai sebagai keputusan otorisasi, backend checkout/trial endpoint
      tidak disentuh, grouping baru murni redistribusi data yang sudah
      difilter API, tidak bocor data lintas-user)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Verifikasi visual browser TIDAK berhasil dilakukan** — login sebagai
  customer test berulang kali gagal di environment browser otomasi sesi
  ini (session/cookie `app.localhost` tidak persist meski API sign-in
  200, ditemukan juga stale cookie `active_data_usaha_id` dari sesi QA
  sebelumnya yang mengganggu — sudah dibersihkan tapi login tetap tidak
  tembus). Verifikasi diganti: review kode baris-demi-baris (isi panel
  accordion = lift langsung dari kode lama yang sudah battle-tested,
  bukan ditulis ulang), typecheck+lint+test suite penuh. User diminta
  cek visual langsung di browser lokalnya sendiri sebelum dianggap
  benar-benar final.
- Landing page (`app/landing/module-features.tsx`) BELUM ditarik pakai
  komponen baru ini — eksplisit di luar scope fase ini, menunggu
  konfirmasi user dulu.

## Ringkasan Hasil
Halaman `/subscribe` direstruktur dari grid flat modul jadi grid kartu
Kategori dengan accordion Varian (1 terbuka se-halaman), konsisten
taksonomi Produk→Kategori→Varian yang sama dipakai sidebar (Fase 126).
3 komponen baru dibuat presentational/reusable untuk persiapan ditarik
ke landing page nanti (panggilan terpisah). Icon Kategori diekstrak jadi
1 mapping shared (sidebar ↔ katalog). Checkout/trial/fetch data TIDAK
disentuh sama sekali — murni restrukturisasi presentasional di atas
mekanisme yang sudah ada.
