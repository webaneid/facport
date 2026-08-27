# Fase 08 — Purchase Invoice: Update Faktur Existing (Retry Cerdas)

**Status:** In Progress
**Mulai:** 2026-08-28
**Selesai:**

## Tujuan
Fase 06 (multi-item per faktur) menyelesaikan grouping untuk batch yang
diproses SETELAH fase itu deploy. Batch LAMA yang sudah kadung punya 1
baris `success` + baris `failed` lain (Bill No sama, ditolak Accurate
sebagai duplikat) tidak ikut diperbaiki — retry biasa tetap mencoba CREATE
baru dan tetap ditolak. Client menegaskan perbaikan HARUS lewat sistem
(Retry existing jadi pintar), bukan intervensi manual ke data production
— lihat ADR-0012 untuk riset+bukti empiris bahwa `save.do` mendukung mode
update/append.

## Scope
- [x] `lib/import-mapping/purchase-invoice.mapping.ts`: `billNumberColumnOf()`
      diexport; extract `buildDetailItemFromRow()` dari isi `.map()`
      `buildPurchaseInvoicePayload` (logic sama, dipakai ulang jalur
      create & update).
- [x] `lib/accurate-purchase-invoice.ts`: fungsi baru `getPurchaseInvoiceDetail()`
      — `GET detail.do`, pakai `parseAccurateEnvelope` (bukan
      `parseAccurateSaveEnvelope`).
- [x] `workers/index.ts`: fungsi baru `findExistingAccurateInvoiceId()`
      (query lintas-batch, parameter binding) + `appendToExistingPurchaseInvoice()`
      (safety check vendor-match, duplicate-guard per item, idempotent
      kalau semua item sudah ada). Branch di loop grup `purchase_invoice`:
      cek existing dulu sebelum CREATE.
- [x] Test regresi `purchase-invoice.mapping.test.ts` untuk `buildDetailItemFromRow`.
- [ ] Verifikasi NYATA: retry baris 2/4/6 batch `8b622538` (akun
      `user1@fasport.com`) via UI/API sungguhan setelah deploy.

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Update Faktur Existing / Retry Cerdas (Fase 08)"
- ADR: `docs/decisions/adr-0012-purchase-invoice-update-existing.md`
- Fase sebelumnya: `docs/phases/phase-06-purchase-invoice-multi-item.md` (ADR-0011)
- Insiden nyata pemicu: batch `8b622538`, akun `user1@fasport.com`, Data
  Usaha "PT Frozen Food", faktur Accurate `#150`

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web, 0 error
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
      (isolasi subscriptionId lewat `batch.subscriptionId` dikonfirmasi
      aman, sudah dijaga ownership check di endpoint retry existing yang
      tidak disentuh fase ini; `sql` tag terkonfirmasi parameter binding,
      bukan concat)
- [x] Temuan Critical/High — tidak ada
- [ ] `docs/PROGRESS.md` diupdate (status final, setelah verifikasi nyata)
- [ ] **Divalidasi ke akun Accurate Online NYATA** — retry baris 2/4/6
      batch `8b622538` lewat browser/API sungguhan setelah deploy

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Tidak ada UI eksplisit yang membedakan "faktur baru dibuat" vs "faktur
  existing di-update" — user cuma lihat hasil `success` dengan
  `accurateTransactionId` yang sama seperti baris lain di grup. Bisa jadi
  polish UI terpisah kalau dibutuhkan.
- Safety check vendor-match menolak retry kalau vendor faktur existing
  sudah diubah manual di Accurate (di luar Facport) — fail-safe by
  design, bukan bug (lihat ADR-0012 § Konsekuensi).

## Ringkasan Hasil (isi pas fase Done)
