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
  "Penjualan"/"Pembelian" untuk Produk Facport) — TIDAK PERNAH dipakai
  gating, murni tampilan (form admin/katalog).
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
  { key: "sales_invoice", label: "Sales Invoice", productLine: "facport", category: "Penjualan" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", productLine: "facport", category: "Penjualan" },
  { key: "purchase_invoice", label: "Purchase Invoice", productLine: "facport", category: "Pembelian" },
  { key: "purchase_payment", label: "Purchase Payment", productLine: "facport", category: "Pembelian" },
  { key: "journal_voucher", label: "Jurnal Umum", productLine: "facport", category: "Buku Besar" },
  { key: "vendor_payable_account", label: "Akun Hutang Pemasok", productLine: "facport", category: "Data Master" },
  { key: "other_payment", label: "Other Payment (Pembayaran Bank/Kas)", productLine: "facport", category: "Kas & Bank" },
  // Konverter / AutoProduksi: SENGAJA KOSONG — isi pas fase build masing-masing.
] as const;
```

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
