# Fase 161 — Redesain `/subscribe`: Pilih-Produk Dulu (4 Card) → Katalog per-Produk

**Status:** Done
**Mulai:** 2026-09-29
**Selesai:** 2026-09-29

## Tujuan
`/subscribe` sejak Fase 127 menumpuk section Facport→Konverter→AutoProduksi
VERTIKAL di 1 halaman. Setelah AutoProduksi (Fase 159) live, halaman ini jadi
13+ kartu Kategori ditumpuk lintas 3 Produk — user menilai scroll tanpa
arah, UX kebesaran. Fase ini memecah jadi 2 tingkat: Step 0 (4 card pilih
Produk: Facport/Konverter/AutoProduksi/Tambahan Anggota) → Step 1 (katalog
Kategori+Varian PERSIS seperti sekarang, tapi cuma 1 Produk per halaman).
Keranjang tetap gabungan lintas halaman (1 checkout = 1 invoice), backend
checkout/trial TIDAK berubah.

Rencana lengkap (Plan Mode, disetujui user 2026-09-29): `.claude/plans/ancient-floating-glacier.md`.

## Scope
- [x] `apps/web/app/app/(protected)/subscribe/layout.tsx` (BARU) — guard cookie Data Usaha (pindah dari page.tsx lama) + `SubscribeCartProvider`
- [x] `apps/web/components/subscribe/subscribe-cart-context.tsx` (BARU) — pindahan state+handler dari `SubscribeFormInner` (fetch, grouping, seat, checkout, trial, preselect `?plans=`)
- [x] `apps/web/components/subscribe/cart-bar.tsx` (BARU) — bar mengambang persist lintas halaman, buka `Dialog` Ringkasan Pesanan
- [x] `apps/web/app/app/(protected)/subscribe/page.tsx` (REWRITE) — Step 0: 4 card pilih Produk + auto-redirect `?plans=` produk tunggal
- [x] `apps/web/app/app/(protected)/subscribe/[productLine]/page.tsx` (BARU) — katalog 1 Produk, reuse `ProductCatalogSection`
- [x] `apps/web/app/app/(protected)/subscribe/tambahan-anggota/page.tsx` (BARU) — form seat + gate `hasAnyRealActiveSubscription`
- [x] `apps/web/lib/product-line-copy.ts` — tambah `PRODUCT_LINE_CARD_COPY` (teaser card Step 0)
- [x] `apps/web/lib/accurate-gate-copy.ts` + test — deep-link ke `/subscribe/konverter`
- [x] Hapus `apps/web/components/subscribe/subscribe-form.tsx` (logic sudah terdistribusi)
- [x] Unit test: resolve `?plans=` → productLine (`resolve-preselect-product-line.test.ts`), gate Tambahan Anggota (`subscribe-gate.test.ts`)
- [x] Browser-test manual end-to-end (keranjang gabungan lintas halaman, refresh mid-flow, jalur `?plans=` dari landing)
- [x] `docs/architecture/architecture-product-lines.md` — update struktur `/subscribe`
- [x] Security review (skill `security-review`) — 0 temuan
- [x] `docs/PROGRESS.md` status Done

## Referensi
- Architecture doc: `docs/architecture/architecture-product-lines.md`
- Fase sebelumnya (struktur lama yang diganti): `docs/phases/phase-127-redesign-subscribe-produk-kategori-varian.md`
- Riset Tambahan Anggota: `docs/architecture/architecture-user-tambahan.md` (ADR-0032)
- Rencana lengkap (Plan Mode): `.claude/plans/ancient-floating-glacier.md`

## Keputusan Kecil Selama Eksekusi
- **`notFound()` diganti `redirect("/subscribe")`** di `[productLine]/page.tsx`
  untuk param URL tidak valid — ditemukan saat security review: project
  belum punya `not-found.tsx` custom sama sekali, `notFound()` akan jatuh
  ke halaman 404 generik Next.js yang tidak match desain. Konsisten pola
  self-heal project ini ("cookie basi → redirect balik ke gerbang", §
  `/pilih-usaha` di `(protected)/layout.tsx`) — bukan 404 dead-end.
- **Preselect `?plans=` di-expose lewat 1 state `preselectedModuleKeys`**
  di Context (bukan di-parse ulang di `page.tsx`) — hindari parsing query
  string 2x di 2 tempat berbeda; `page.tsx` cuma konsumsi hasilnya buat
  keputusan redirect, dan `clearPreselect()` dipanggil sekali supaya
  kembali manual ke Step 0 nanti tidak ke-redirect ulang secara tidak
  disengaja.
- **`Button` tidak punya `asChild`** (beda dari shadcn asli) — dipakai
  `buttonVariants()` langsung ke `<Link>` (pola yang sudah didokumentasikan
  di komentar `button.tsx` sendiri), bukan nge-hack `Button` supaya
  menerima children `<Link>`.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Lint bersih (`bun run lint`)
- [x] Test: web 294 pass/0 fail (+10 test baru), api tidak disentuh (0 error typecheck)
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Landing page publik (`app/landing/module-features.tsx`) TIDAK disentuh —
  di luar scope, konsisten keputusan Fase 127. `?plans=` dari landing tetap
  kompatibel (auto-redirect ke katalog Produk yang relevan), diverifikasi
  browser-test.
- Evaluasi trial `maxRows`/kuota AutoProduksi — eksplisit ditunda user ke
  fase terpisah, bukan bagian fase ini.

## Ringkasan Hasil
Halaman `/subscribe` dipecah dari 1 halaman flat (13+ kartu Kategori lintas
3 Produk ditumpuk) jadi 2 tingkat: Step 0 (4 card pilih Produk: Facport/
Konverter/AutoProduksi/Tambahan Anggota) → katalog per-Produk
(`/subscribe/[productLine]`, reuse `ProductCatalogSection` apa adanya sejak
Fase 127). "Tambahan Anggota" jadi card ke-4 sejajar (bukan bagian salah
satu Produk) berdasar riset eksplisit ke `architecture-user-tambahan.md`
(ADR-0032): 1 seat = akses ke SEMUA fitur aktif 1 Data Usaha, lintas Produk
apapun.

Keranjang tetap GABUNGAN lintas halaman (dikonfirmasi user) — dicapai
dengan mengangkat state (`useGroupedPlans`, seat, handler checkout/trial,
SEMUA logic dipindah apa adanya dari `subscribe-form.tsx` lama yang
dihapus) ke `SubscribeCartProvider` yang dibungkus `subscribe/layout.tsx`.
Bar mengambang baru (`cart-bar.tsx`) tampil di semua halaman `/subscribe/*`,
buka `Dialog` (komponen UI kit yang sudah ada) untuk Ringkasan Pesanan.
Backend (`checkout`/`trial` endpoint) TIDAK disentuh sama sekali.

**Browser-test manual end-to-end SUKSES** (akun QA lokal, dev DB, dibersihkan
setelah selesai): pilih 1 fitur Facport → pindah halaman ke Konverter (lewat
"Kembali pilih Produk") → cart bar tetap menunjukkan 1 item → pilih 1 fitur
Konverter → cart bar update jadi 2 item gabungan → checkout → **1 invoice
gabungan berhasil dibuat** (2 baris item dari 2 Produk berbeda, total benar)
— bukti definitif keranjang gabungan bekerja end-to-end sampai invoice, bukan
cuma benar di state UI. Jalur `?plans=<planId>` dari landing juga
diverifikasi: auto-redirect ke `/subscribe/<productLine>` yang benar dengan
item ter-preselect tepat. Refresh penuh mid-pilihan mereset cart dengan
bersih tanpa crash (state in-memory, sesuai desain).

Typecheck 0 error (api+web), lint bersih, test web 294 pass/0 fail (+10 test
baru: `resolve-preselect-product-line.test.ts`,`subscribe-gate.test.ts`).
Security review: 0 temuan — param `[productLine]` divalidasi whitelist
sebelum dipakai, `dataUsahaId` tetap bersumber cookie yang sudah divalidasi
ownership parent layout, checkout/trial memanggil endpoint yang identik
tanpa logic otorisasi baru.
