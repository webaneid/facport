# Architecture — Produk (Facport + Konverter + AutoProduksi)

> Fase 117. Facport jadi super-app: 1 brand ("Facport"), 3 Produk (Facport,
> Konverter, AutoProduksi), 1 pintu pendaftaran & billing. Dokumen ini
> REFERENSI HIDUP (beda dari `adr-0033-*.md` yang beku) — diupdate tiap fase
> Konverter/AutoProduksi menambah varian nyata. Rasional lengkap keputusan
> di bawah → `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`.

## Kerangka: Brand → Produk → Kategori → Varian

- **Brand** (1, tetap): "Facport". Tidak ada rebranding/multi-tema — logo,
  nama perusahaan, favicon tetap global-singular (`architecture-settings.md`),
  dipakai identik di semua Produk.
- **Produk** (3): field `productLine` di data model. Nilai: `facport`,
  `konverter`, `autoproduksi`.
- **Kategori**: pengelompokan presentasional varian DALAM 1 Produk (mis.
  "Sales"/"Purchase" untuk Produk Facport) — TIDAK PERNAH dipakai gating,
  murni tampilan (form admin/katalog, DAN sejak Fase 126 juga sidebar app
  `/*` — grup nav "Facport" di-cluster per Kategori, kategori kosong
  otomatis hilang, § "Sidebar App — Cluster per Kategori" di bawah).
  Label Kategori Bahasa Inggris (diminta user 2026-09-15) — konsisten
  dengan nama Varian yang memang sudah Inggris (istilah Accurate Online
  sendiri), BEDA dari string UI lain di project yang boleh Bahasa
  Indonesia (project ini tidak pakai i18n).
- **Varian**: field `module`/`moduleKey` — unit gating/billing sesungguhnya
  (persis konsep "sub-modul" ADR-0019, sekarang scoped di dalam 1 Produk).

## Source of Truth: `module-catalog.ts`

```ts
// apps/api/src/lib/module-catalog.ts — leaf file murni, TIDAK boleh import
// db.ts/env.ts (Next.js akan bundle isinya lewat re-export apps/web)
export const PRODUCT_LINES = [
  { key: "facport", label: "Facport" },
  { key: "konverter", label: "Konverter" },
  { key: "autoproduksi", label: "AutoProduksi" },
] as const;

export const MODULE_CATALOG = [
  { key: "sales_invoice", label: "Sales Invoice", productLine: "facport", category: "Sales" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", productLine: "facport", category: "Sales" },
  { key: "sales_quotation", label: "Sales Quotation", productLine: "facport", category: "Sales" },
  { key: "sales_return", label: "Sales Return", productLine: "facport", category: "Sales" },
  { key: "purchase_invoice", label: "Purchase Invoice", productLine: "facport", category: "Purchase" },
  { key: "purchase_payment", label: "Purchase Payment", productLine: "facport", category: "Purchase" },
  { key: "purchase_order", label: "Purchase Order", productLine: "facport", category: "Purchase" },
  { key: "receive_item", label: "Receive Item", productLine: "facport", category: "Purchase" },
  { key: "purchase_return", label: "Purchase Return", productLine: "facport", category: "Purchase" },
  { key: "vendor_payable_account", label: "Vendor Payable Account", productLine: "facport", category: "Purchase" },
  { key: "other_payment", label: "Other Payment (Cash/Bank Payment)", productLine: "facport", category: "Cash & Bank" },
  { key: "journal_voucher", label: "Journal Voucher", productLine: "facport", category: "General Ledger" },
  // Konverter / AutoProduksi: SENGAJA KOSONG — isi pas fase build masing-masing.
] as const;

// § Fase 126 — urutan tampil Kategori (sidebar/form admin), daftar
// TERPISAH dari MODULE_CATALOG supaya stabil walau urutan Varian di atas
// berubah. Inventory & Manufacture SENGAJA masuk daftar walau 0 Varian
// hari ini (kategori Accurate Online yang belum digarap Facport) —
// konsumen (sidebar) yang tanggung jawab sembunyikan kategori kosong.
export const MODULE_CATEGORIES = ["Cash & Bank", "General Ledger", "Purchase", "Sales", "Inventory", "Manufacture"] as const;
```

## Sidebar App — Cluster per Kategori (Fase 126)

Sejak Fase 126, sidebar app (`apps/web/components/app-shell/sidebar.tsx`)
tidak lagi 1 grup flat "Import Data" — jadi grup Produk **"Facport"**
(`NavGroup.productLine: "facport"`), item-nya di-cluster jadi sub-header per
Kategori di dalam `NavGroupBlock` (fungsi `groupItemsByCategory()`), urut
ikut `MODULE_CATEGORIES`. Kaidah "kosong = hilang" berlaku 2 lapis sekarang:
- Item (Varian) hilang kalau `subscriptionModules` tidak meng-cover — SUDAH
  ada sejak dulu (`navGroupsFor`), TIDAK berubah.
- Kategori hilang total kalau SEMUA item di dalamnya hilang (clustering
  dihitung dari item yang SUDAH difilter subscription, bukan filter
  terpisah) — otomatis, bukan logic khusus per kategori.

Ini alasan Inventory & Manufacture (0 Varian hari ini) aman ditulis di
`MODULE_CATEGORIES` dari sekarang — begitu Varian pertama di kategori itu
ADA + di-subscribe, langsung muncul tanpa ubah struktur nav lagi. Produk
Konverter/AutoProduksi (nanti) pakai pola SAMA — grup nav baru dengan
`productLine` masing-masing, `MODULE_CATEGORIES`-nya sendiri (BELUM
didesain — konsisten prinsip "jangan tebak sebelum fase build-nya" di atas).

`apps/web/lib/module-options.ts` adalah **re-export** dari file ini (relative
import, bukan type-only — beda dari pola `api-client.ts` yang cuma butuh
tipe). Helper presentasi (`moduleLabel()`, dst) tetap lokal di
`apps/web`.

**JANGAN duplikasi manual lagi** — titik yang HARUS baca dari
`module-catalog.ts` (bukan hardcode ulang):
- `apps/web/lib/module-options.ts` (re-export penuh)
- `apps/api/src/routes/admin/plans.route.ts` (moduleAccess string per route
  — import key dari sini, bukan string literal lepas)
- `apps/api/src/workers/index.ts` (switch dispatch — sama, import key)

Titik yang **TETAP terpisah tapi dijaga test guard** (alasan di ADR-0033 §
Decision poin 3):
- `apps/api/src/lib/accurate-scopes.ts` — HARUS subset key `productLine:"facport"`.
- `apps/api/src/routes/admin/plans.route.ts` TypeBox literal union — HARUS
  ditulis manual (generate otomatis merusak inferensi Eden Treaty, temuan
  2026-09-04), test guard drift-check.

## Gating & Koneksi Accurate — Per Produk

| Produk | Butuh koneksi Accurate? | Mekanisme gating |
|---|---|---|
| Facport | Ya (OAuth, per Data Usaha) | `subscriptionGatePlugin.moduleAccess(key)` — sudah ada |
| Konverter | **Tidak sama sekali** (client-side, no API call) | `moduleAccess(key)` yang SAMA — mekanisme ini cuma cek `plan.modules`, tidak pernah query `accurate_connections` |
| AutoProduksi | Belum ditentukan (kemungkinan tidak, formula lokal) | `moduleAccess(key)` yang sama, kemungkinan besar tanpa koneksi |

`data_usaha` dengan nol koneksi Accurate sudah state valid hari ini (alur
trial) — Produk Konverter/AutoProduksi TIDAK butuh perubahan skema
`data_usaha`/`subscriptions` apa pun untuk kasus ini.

## Riwayat/Audit — Beda Per Produk, JANGAN Dipaksa Seragam

- **Facport**: `import_batches`/`import_batch_rows` (job server, verified by
  Accurate response) — TIDAK BERUBAH.
- **Konverter**: `import_batches` **DITOLAK SENGAJA** (§ ADR-0033 Alternatif)
  — pipeline-nya bukan async-server-verified. Desain masa depan (BELUM
  dibuat): tabel `conversion_logs` terpisah (`userId`, `dataUsahaId`,
  `subscriptionId`, `moduleKey`, `fileName`, `rowCount` — semua
  self-reported client). Dibuat pas fase build Konverter.
- **AutoProduksi**: kemungkinan cocok job/queue (`pg-boss`) biasa — tabel
  tujuan berbeda (bukan `import_batches`, karena bukan "impor" tapi
  "penyesuaian stok dari formula"), desain final menunggu fase build-nya.
- `GET /me/import-batches` ("Arsip Import" unified) **TIDAK diubah** fase
  ini — tetap scope Facport (+ AutoProduksi nanti kalau memang lewat job
  server). Konverter TIDAK ikut di halaman ini (riwayatnya sendiri nanti).

## Checkout/Invoice

Cart/checkout SUDAH menerima N `planId` bebas → 1 invoice, N `invoiceItems`
— **mencampur SKU lintas Produk dalam 1 keranjang SENGAJA DIIZINKAN**
("1 brand, 1 checkout"). `invoiceItems.productLine` — snapshot saat invoice
dibuat (pola sama `moduleKey`/`label`/`price`, bukan join-live).
`subscriptions` TIDAK punya kolom `productLine` sendiri — join
`plans.productLine` kalau perlu.

## Status Katalog (update tiap fase menambah varian nyata)

| Produk | Varian live | Fase |
|---|---|---|
| Facport | sales_invoice, sales_receipt, purchase_invoice, purchase_payment, journal_voucher, vendor_payable_account, other_payment (7) | Fase 02–96 |
| Konverter | — (belum ada) | — |
| AutoProduksi | — (belum ada) | — |

## Referensi
- ADR: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`
- Fondasi flat-SKU-per-modul (masih berlaku untuk hubungan plan↔varian):
  `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`
- Phase doc (riset lengkap): `docs/phases/phase-117-peta-struktur-multi-produk.md`
- Model subscription/billing: `docs/architecture/architecture-subscription.md`
