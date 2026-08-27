# Fase 06 — Purchase Invoice: Multi-Item per Faktur

**Status:** Planned
**Mulai:**
**Selesai:**

## Tujuan
Faktur Pembelian saat ini (Fase 02) dibatasi "1 baris Excel = 1 faktur =
TEPAT 1 item" — dicatat eksplisit sebagai Known Limitation, bukan
kelupaan. Client, lewat feedback pasca-presentasi 2026-08-27, butuh 1
faktur bisa punya banyak item — ini juga **akar penyebab error nyata**
yang muncul saat demo ("Sudah ada data lain dengan No Form # Faktur
Pembelian...", karena user mencoba menandai baris-baris 1 faktur yang
sama pakai Trans No yang sama, dan itu ditolak Accurate).

Prioritas TERTINGGI dari 3 feedback client (disepakati user 2026-08-27),
dikerjakan sebelum Fase 07 (pencarian riwayat per nomor faktur).

## Scope
- [ ] `lib/import-mapping/purchase-invoice.mapping.ts`: fungsi baru
      pengelompokan baris berdasarkan `billNumber` (lihat ADR-0011 untuk
      aturan lengkap) — hasilkan array of groups, tiap group berisi
      row-row Excel yang jadi 1 faktur.
- [ ] `buildPurchaseInvoicePayload`: ubah supaya bisa terima BANYAK raw
      row (1 group), hasilkan 1 payload dengan `detailItem[]` banyak
      elemen (field header dari row pertama, `detailItem` dari tiap row).
- [ ] Validasi: semua row dalam 1 group WAJIB `vendorNo` sama — group
      gagal SELURUHNYA (bukan sebagian) kalau tidak, pesan error jelas.
- [ ] `workers/index.ts` — job `IMPORT_TO_ACCURATE` (case
      `purchase_invoice`): ubah loop dari "per row" jadi "per group".
      Hasil (`accurateTransactionId`/status/errorMessage) satu panggilan
      `save.do` di-apply ke SEMUA `import_batch_rows` anggota group itu.
- [ ] Endpoint retry (`/purchase-invoice/import/:batchId/retry` atau
      sejenis) — pastikan retry tetap benar per-GROUP (retry 1 baris
      gagal harus ikut retry seluruh group-nya, bukan baris itu doang) —
      cek behavior existing dulu sebelum asumsi otomatis benar (§
      ADR-0011 trade-off).
- [ ] UI konfirmasi mapping (`app/app/purchase-invoice/import/page.tsx`)
      — tambah preview ringkas "N baris Excel akan jadi M faktur" SEBELUM
      user submit, supaya grouping yang tidak disengaja (Bill No
      kebetulan sama padahal beda faktur) ketahuan sebelum data masuk
      Accurate.
- [ ] Update `docs/import-mapping/template-guide.ts` § kolom "Bill No" —
      keterangan-nya perlu jelasin fungsi grouping ini (bukan cuma
      "nomor referensi tagihan", tapi juga penentu pengelompokan item).
- [ ] Test: minimal 1 test end-to-end (group 2+ baris jadi 1 faktur
      dengan 2+ detailItem, verifikasi `detailItem.length` di payload
      yang dikirim) + 1 test validasi vendor-mismatch-dalam-group gagal
      dengan pesan jelas + 1 test row dengan Bill No kosong tetap
      berperilaku seperti sebelumnya (1 row = 1 faktur).

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Multi-Item per Faktur (Fase 06)"
- ADR: `docs/decisions/adr-0011-purchase-invoice-multi-item.md`
- Known Limitation asal (Fase 02):
  `docs/phases/phase-02-modul-pembelian-purchase-invoice.md` § Known Limitations
- Bug nyata yang memicu fase ini: error demo 2026-08-27 "Sudah ada data
  lain dengan No Form # Faktur Pembelian..." — akar masalah 1-row-1-faktur

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate
- [ ] Divalidasi ke akun Accurate Online NYATA (bukan cuma unit test) —
      minimal 1 faktur multi-item beneran tercipta dengan `detailItem`
      lebih dari 1, dicek langsung di Accurate

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
-

## Ringkasan Hasil (isi pas fase Done)
