# Fase 09 — Batal Import (Hapus/Susutkan Faktur di Accurate)

**Status:** In Progress
**Mulai:** 2026-08-28
**Selesai:**

## Tujuan
Item ke-3 dari 3 feedback client pasca-presentasi 2026-08-27 (item 1 =
Fase 07, item 2 = Fase 06), sengaja ditunda sampai Fase 06 & Fase 08
solid. Tombol "Batal Import" di tabel Riwayat Import yang BENERAN
menghapus/melepas transaksi terkait dari Accurate Online (bukan cuma
menyembunyikan record lokal Facport), aman terhadap risiko data-loss
lintas-batch yang ditimbulkan mekanisme Fase 08 (append ke faktur
existing). Detail riset & keputusan → ADR-0013.

## Scope
- [x] **Verifikasi wajib** (langkah pertama, sebelum kode apa pun):
      konfirmasi nyata `save.do` respons CREATE mengandung
      `detailItem[].id`, dan `delete.do` benar menghapus (bukan
      soft-delete). Hasil: KEDUANYA terkonfirmasi via test call nyata
      (buat+hapus 1 test invoice, self-cleaning).
- [ ] Schema: `import_batch_rows.accurateDetailItemId` (varchar,
      nullable) + `cancelledAt` (timestamptz, nullable); status baru
      `"cancelled"` (row) dan `"cancelled"`/`"cancelled_partial"` (batch).
- [ ] Tangkap `accurateDetailItemId` di jalur CREATE
      (`processPurchaseInvoiceGroup`, Fase 06) & UPDATE
      (`appendToExistingPurchaseInvoice`, Fase 08) — refactor update
      grup dari bulk (`inArray`) jadi per-baris.
- [ ] `deletePurchaseInvoice()` baru di `lib/accurate-purchase-invoice.ts`.
- [ ] Job baru `CANCEL_IMPORT` — eligibility check lintas-batch (blokir
      kalau ada baris manapun tanpa `accurateDetailItemId`), lalu
      delete-utuh ATAU susutkan-via-update per faktur.
- [ ] Endpoint `POST /purchase-invoice/import/:batchId/cancel` (pola
      sama retry — ownership check, permission `import.create`).
- [ ] `GET /purchase-invoice/import` — tambah pagination (`offset` + `total`).
- [ ] Audit log (`auditLogs`, tabel sudah ada) per batch yang dibatalkan.
- [ ] Halaman arsip baru `purchase-invoice/import/riwayat` — semua batch,
      paginated, kolom aksi icon (Detail=`Eye`, Batal Import=`Trash2`).
- [ ] Dashboard — link "Tampilkan Arsip Lain →" ke halaman arsip (tabel
      5-baris existing TIDAK diubah).
- [ ] Dialog konfirmasi type-to-confirm (ketik ulang nama file batch).

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Batal Import / Hapus Faktur (Fase 09)"
- ADR: `docs/decisions/adr-0013-batal-import.md`
- Fase sebelumnya: Fase 06 (ADR-0011, multi-item), Fase 08 (ADR-0012,
  update faktur existing) — mekanisme `save.do` update dipakai ulang di
  sini (arah kebalikan: buang item, bukan tambah).

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`) — endpoint
      destructive baru, extra teliti ownership+permission
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate
- [ ] **Divalidasi ke akun Accurate Online NYATA** — 2 skenario: (1)
      faktur murni 1 batch → cancel → faktur benar HILANG dari Accurate;
      (2) faktur gabungan lintas-batch (append via Fase 08 dulu) →
      cancel salah satu batch → faktur SUSUT (item batch lain tetap
      utuh, dikonfirmasi via `detail.do` fresh)

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Batch yang diproses SEBELUM fase ini tidak punya `accurateDetailItemId`
  tercatat → tidak bisa di-cancel otomatis (diblokir by design, lihat
  ADR-0013 Decision #2), perlu dihapus manual di Accurate kalau memang
  dibutuhkan.
- Perilaku Accurate saat faktur sudah "dipakai" downstream (dibayar/
  direferensikan transaksi lain) ditangani sebagai error per-faktur
  (batch jadi `cancelled_partial`, bukan gagal total) — pesan error
  spesifik dari Accurate untuk skenario ini belum terverifikasi statis,
  akan dicatat begitu ketemu di verifikasi nyata/pemakaian produksi.

## Ringkasan Hasil (isi pas fase Done)
