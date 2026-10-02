# Architecture — Batal Import Generik (19 Modul)

**Fase:** 165 | **ADR terkait:** `docs/decisions/adr-0040-batal-import-generik-19-modul.md`

## Ringkasan

"Batal Import" (hapus transaksi ASLI dari Accurate via `delete.do`, bukan
cuma riwayat lokal Facport) sejak Fase 09/13 (ADR-0013/0014) cuma ada di
`purchase_invoice`/`sales_invoice`. Fase ini menggeneralisasi ke **19
modul "sederhana"** — modul yang TIDAK pernah menggabungkan item dari
beberapa batch ke 1 dokumen Accurate (beda dari PI/SI yang punya fitur
Retry Cerdas/append, ADR-0012), jadi logic-nya jauh lebih simpel: 1 batch
= 1 (atau beberapa, kalau grouping by Trans No) dokumen Accurate, selalu
100% milik batch itu sendiri.

**19 modul yang dapat Cancel di fase ini:** `sales_receipt`,
`purchase_payment`, `journal_voucher`, `other_payment`, `other_deposit`,
`purchase_order`, `receive_item`, `purchase_return`, `sales_quotation`,
`sales_order`, `sales_return`, `delivery_order`, `item_transfer`,
`item_requisition`, `inventory_adjustment`, `roll_over`, `work_order`,
`material_slip`, `finished_good_slip`.

**TIDAK termasuk** (sengaja, lihat Known Limitations ADR-0040):
`job_costing` (2 dokumen Accurate berurutan, order hapus belum
diputuskan), `vendor_payable_account` (sync master data, bukan
transaksi), `autoproduksi_production` (form-based, bukan modul import
Excel/batch), `purchase_invoice`/`sales_invoice` (sudah ada sejak
Fase 09/13, logic berbeda — lihat `architecture-purchase-invoice.md`).

## Komponen

### 1. `apps/api/src/lib/accurate-generic-delete.ts`
- `deleteAccurateDocument(ctx, accuratePath, id)` — HTTP `DELETE
  {host}/accurate/api/{accuratePath}/delete.do?id={id}`, pakai
  `parseAccurateEnvelope` (envelope `{s,d}` polos, BUKAN
  `parseAccurateSaveEnvelope` yang expect field `r` — itu cuma ada di
  `save.do`). Mirror persis `deletePurchaseInvoice`
  (`accurate-purchase-invoice.ts`), tapi parameterized by path — kontrak
  HTTP delete.do IDENTIK di semua modul transaksi Accurate (dikonfirmasi
  via `docs/referencehtml/accurate-openapi.json`).
- `GENERIC_CANCELLABLE_MODULES: Record<string, string>` — module key
  (`import_batches.module`) → path endpoint Accurate. 2 pengecualian
  yang path-nya BEDA dari nama modul: `item_requisition` →
  `purchase-requisition` (Fase 164 rebuild), `inventory_adjustment` →
  `item-adjustment`.

### 2. Worker — `apps/api/src/workers/index.ts`, job `JOBS.CANCEL_IMPORT`
Job handler YANG SAMA dipakai PI/SI, ditambah cabang BARU di awal body
(setelah `session` terbuka, sebelum logic PI/SI lama):

```ts
const genericAccuratePath = GENERIC_CANCELLABLE_MODULES[batch.module];
if (genericAccuratePath) {
  // ambil semua baris success batch ini, group by accurateTransactionId,
  // hapus tiap dokumen (deleteAccurateDocument), tandai baris "cancelled",
  // turunkan cumulativeSuccessfulRowCount, insert audit_logs, update
  // status batch (cancelled / cancelled_partial), lalu `return` —
  // logic PI/SI di bawahnya TIDAK PERNAH jalan untuk 19 modul ini.
}
// ... logic lama PI/SI, TIDAK DIUBAH, cuma jalan untuk
// purchase_invoice/sales_invoice ...
```

Beda kunci dari logic PI/SI di bawahnya:
- **TIDAK ADA cek `accurateDetailItemId`** — tidak relevan, tidak ada
  merge lintas-batch untuk modul-modul ini.
- **TIDAK ADA cek lintas-batch** (`otherBatchRows`) — tiap
  `accurateTransactionId` dalam 1 batch pasti 100% milik batch itu.
- Kegagalan hapus 1 dokumen TIDAK abort job — lanjut ke dokumen
  berikutnya (sama prinsip PI/SI), batch berakhir `cancelled_partial`
  kalau ada yang gagal.

### 3. Route — `.post("/{module}/import/:batchId/cancel", ...)`
Ditambahkan ke 19 file `apps/api/src/routes/{module}-import.route.ts`,
tepat sebelum route `.delete(".../import/:batchId")` (local delete) yang
sudah ada. Urutan cek (SEMUA wajib, fail-closed):

1. `batch` ada & `batch.subscriptionId === subscription.id` (tenant
   isolation) → 404 `BATCH_NOT_FOUND`.
2. `ownsDataUsaha(user.id, subscription.dataUsahaId)` → 403
   `CANCEL_OWNER_ONLY`. **WAJIB ada sejak awal** — ini persis celah yang
   baru ditemukan & diperbaiki di PI/SI (§ `docs/lessons-learned.md`
   2026-10-02), JANGAN diulang kalau menambah modul baru lagi nanti.
3. `batch.status` harus `completed`/`completed_with_errors` → 409
   `BATCH_NOT_CANCELLABLE`.
4. `checkSubscriptionScopes(subscription.id, moduleKey)` → 409
   `ACCURATE_SCOPE_MISSING`. **Beda dari PI/SI** (yang tidak punya cek
   ini di route cancel) — karena scope `{module}_delete` ini BARU
   (§ "Rollout Scope" di bawah), koneksi lama belum tentu punya.
5. Update batch jadi `cancelling`, enqueue `JOBS.CANCEL_IMPORT`.

### 4. `accurate-endpoint-registry.ts`
`DELETE {path}/delete.do` ditambahkan ke `endpoints[]` 19 modul di atas.
Scope `{module}_delete` DITURUNKAN otomatis dari sini (via
`accurate-scope-snapshot.json`, § architecture-accurate-scope-engine.md)
— sudah ada di snapshot (katalog lengkap semua endpoint publik Accurate,
tidak perlu `bun run scopes:sync` ulang untuk fase ini, dicek manual
semua 19 path delete.do memang ada di snapshot).

### 5. Frontend
- `apps/web/components/import-archive/generic-cancel-import-dialog.tsx`
  — dialog SATU untuk 19 modul (beda dari PI/SI yang masing-masing punya
  dialog sendiri, karena mereka butuh paragraf tambahan "faktur gabungan
  dilewati otomatis" yang tidak relevan di sini). Terima prop
  `onConfirm: () => Promise<{error?}>` (bukan index string ke Eden
  client) supaya type-safety tetap end-to-end — pemanggilan Eden yang
  benar-benar type-checked ditulis di titik pakai
  (`import-batch-table.tsx`).
- Warning text (diminta eksplisit user) menyebut **DUA efek terpisah**:
  (1) transaksi di Accurate Online dihapus PERMANEN, (2) baris batch di
  Facport ditandai "Dibatalkan" (bukan dihapus fisik — tetap ada sebagai
  audit trail, § `audit_logs`, konsisten ADR-0013 Decision #4). Dialog
  PI/SI yang sudah ada (`purchase-invoice/cancel-import-dialog.tsx`,
  `sales-invoice/cancel-import-dialog.tsx`) di-update teksnya ke format
  bullet yang sama untuk konsistensi.
- `import-batch-table.tsx` — 19 blok dispatch baru
  `{batch.module === "x" && canCancel && <GenericCancelImportDialog ... />}`,
  memakai `canCancel` yang SAMA (`isOwner && CANCELLABLE_BATCH_STATUS.has(batch.status)`)
  dengan PI/SI — gating di UI cuma kosmetik (server tetap jadi sumber
  kebenaran), tapi penting supaya non-owner tidak lihat tombol yang
  ujung-ujungnya 403.
- **Riwayat PER-MODUL** (23 halaman `/{module}/import/riwayat`) — TIDAK
  disentuh di fase ini (sama scope decision dengan hide tombol Delete,
  § `docs/lessons-learned.md` 2026-10-02). Cancel untuk 19 modul ini
  SAAT INI cuma muncul di tabel gabungan (Arsip Import + Dashboard).

## Rollout Scope (dampak ke customer existing)

Scope `{module}_delete` adalah scope BARU — koneksi Accurate yang sudah
terhubung SEBELUM fase ini dirilis **TIDAK otomatis dapat scope ini**
(1 otorisasi per akun Accurate, ADR-0036/0037 — scope diberikan user
saat consent OAuth, bukan ditambah diam-diam server-side). Customer
existing yang mencoba Cancel untuk 19 modul ini akan dapat toast
"Koneksi Accurate belum mengizinkan Batal Import untuk modul ini —
sambungkan ulang Accurate dulu" (409 `ACCURATE_SCOPE_MISSING`) sampai
mereka reconnect lewat gerbang koneksi yang sudah ada. Ini TIDAK
mengganggu fitur lain (import/retry/dsb) yang jalan dengan scope lama —
murni gate tambahan di endpoint baru.

## Known Limitations

- **Job Costing belum punya Cancel** — 2 dokumen Accurate berurutan
  (`job-order` lalu `material-adjustment`), urutan hapus yang benar
  belum diverifikasi empiris. Ditunda ke fase terpisah (keputusan
  eksplisit user, pacing bertahap 2026-10-02).
- **Riwayat per-modul (23 halaman) belum dapat tombol Cancel untuk 19
  modul ini** — cuma tabel gabungan (Arsip Import/Dashboard). Kalau
  diminta nanti, tinggal tambah dispatch yang sama ke tiap halaman
  Riwayat (pola sudah ada, PI/SI sudah di situ).
- **Customer existing wajib reconnect Accurate** untuk memakai fitur ini
  (§ "Rollout Scope" di atas) — bukan bug, tapi perlu dikomunikasikan
  kalau ada keluhan "kok Cancel-nya gagal terus".

## Referensi
- `docs/decisions/adr-0040-batal-import-generik-19-modul.md`
- `docs/decisions/adr-0013-batal-import.md`, `adr-0014-...md` — asal
  mekanisme & alasan kompleksitas PI/SI yang TIDAK berlaku di sini.
- `docs/phases/phase-165-batal-import-generik-19-modul.md`
