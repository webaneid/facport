# Fase 67 — Fix Guard Idempotent Append Faktur: Batasi ke Retry Batch yang Sama

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client testing fitur Atribut Tambahan Sales Invoice (Fase 64-66) melaporkan
PPN & Atribut Tambahan "belum bisa terbaca" di Accurate meski kode sudah
memvalidasi payload benar. Investigasi (simulasi payload dari `raw_data`
produksi + query historis lintas batch) membuktikan akar masalahnya BUKAN
mapping/tipe data, tapi mekanisme "Retry Cerdas" (ADR-0012, Fase 08/09) yang
salah sasaran: batch upload BARU yang kebetulan Trans No + item + harga +
qty-nya identik dengan batch test sebelumnya di-anggap "retry", jadi
`save.do` (yang bawa field PPN/Atribut Tambahan baru) TIDAK PERNAH dipanggil
sama sekali, tapi baris tetap dilaporkan "success". Fase ini memperbaiki itu
SEKARANG (instruksi eksplisit user), terpisah dari pertanyaan apakah
konfigurasi Accurate sisi client (aktivasi field, master pajak item) juga
perlu diperbaiki — itu masih pending klarifikasi client.

## Scope
- [x] Fungsi murni `isCoincidentalDuplicateAcrossBatches` (bedakan retry
      dalam batch sama vs duplikat kebetulan lintas batch) + test.
- [x] `findExistingAccurateInvoiceId`/`findExistingAccurateSalesInvoiceId`
      kembalikan `batchId` sumber match, bukan cuma id transaksi Accurate.
- [x] `appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice`
      throw error jelas (row jadi `failed`) kalau match lintas-batch DAN
      tidak ada baris baru untuk dikirim.
- [x] Terapkan KONSISTEN ke Purchase Invoice DAN Sales Invoice (bug sama,
      mirror 1:1 — bukan cuma modul yang di-report client).
- [x] Typecheck 0 error, full test suite pass.
- [x] ADR-0031 (refinement ADR-0012).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`,
  `docs/architecture/architecture-purchase-invoice.md`,
  `docs/architecture/architecture-accurate-integration.md`.
- ADR terkait: `docs/decisions/adr-0012-...md` (mekanisme asli, TIDAK
  diubah filenya), `docs/decisions/adr-0031-batasi-idempotent-guard-append-invoice-ke-batch-sama.md` (refinement fase ini).

## Keputusan Kecil Selama Eksekusi
- Kriteria "duplikat kebetulan" TETAP sesempit mungkin
  (`newRowsCount === 0 && existingBatchId !== currentBatchId`) — TIDAK
  ikut membandingkan field lain (pajak/atribut) karena akan bikin
  retry-safety asli tidak reliable (lihat ADR-0031 § Alternatif).
- Pesan error ditulis lengkap (sebut nomor faktur existing di Accurate +
  saran tindakan: pakai Trans No baru, atau edit manual di Accurate) —
  bukan cuma "duplicate", supaya user non-teknis paham langkah selanjutnya
  tanpa perlu tanya balik ke kami.
- Diterapkan ke Purchase Invoice JUGA meski laporan client spesifik ke
  Sales Invoice — karena kedua fungsi 100% mirror sejak ADR-0012, bug
  yang sama pasti ada di keduanya, dan membiarkan satu sisi tidak
  diperbaiki akan jadi bug laten yang muncul lagi nanti.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — perubahan ini murni logic internal (tidak ada
      input baru dari client, tidak ada endpoint baru, tidak menyentuh
      auth/permission/secret) — risiko keamanan baru nihil, cukup review
      inline (tidak perlu skill/subagent terpisah untuk perubahan sekecil
      ini).
- [x] Tidak ada temuan Critical/High.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/lessons-learned.md` diupdate.

## Known Limitations
- Update-in-place untuk field NON-item pada faktur yang PERSIS SUDAH ADA
  (pajak/atribut/dst berubah, tapi item+harga+qty identik) TETAP tidak
  didukung — sekarang di-reject dengan pesan jelas, TAPI user harus pakai
  Trans No baru atau edit manual di Accurate, bukan auto-update. Di luar
  scope fase ini (lihat ADR-0031 § Konsekuensi).
- Poin 1-3 evaluasi client (PPN, Atribut Tambahan item, Atribut Tambahan
  header "belum bisa terbaca") BELUM dikonfirmasi selesai — kemungkinan
  besar akan resolve sendiri begitu client retest dengan Trans No baru
  (menghindari bug Fase 67 ini), TAPI kemungkinan konfigurasi Accurate
  sisi client (aktivasi field custom, master pajak item) masih perlu
  diverifikasi terpisah. Menunggu klarifikasi lanjutan dari client.

## Ringkasan Hasil
Root cause ditemukan lewat kombinasi simulasi payload dari data produksi
nyata + query historis yang membandingkan `accurate_transaction_id` antar
batch dengan Trans No sama — dua batch berbeda (`de033564-...` 11:34:36,
`977775bc-...` 11:44:32) menghasilkan `accurate_transaction_id` DAN
`accurate_detail_item_id` yang identik, membuktikan `save.do` tidak pernah
dipanggil untuk batch kedua. Fix: guard idempotent ADR-0012 sekarang hanya
berlaku untuk retry DALAM batch yang sama; duplikat kebetulan lintas batch
di-reject dengan pesan error yang jelas. Diterapkan ke Purchase Invoice dan
Sales Invoice. `bun run typecheck` 0 error, `bun test` 456 pass/0 fail
(termasuk 4 test baru untuk `append-invoice-guard.ts`).
