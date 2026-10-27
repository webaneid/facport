# Fase 209 — Delivery Order: CLS1–CLS10 (Kategori Keuangan level item)

**Status:** Done sisi kode (belum dirilis)
**Mulai:** 2026-10-27
**Selesai:** 2026-10-27

## Tujuan
Client ingin nama kolom tetap "CLS1".."CLS10" (= Kategori Keuangan, `dataClassificationNName` Accurate) di Delivery Order. Sebelumnya hanya CLS2 dan CLS5 yang dipetakan.

## Scope
- [x] `fieldToAccuratePath`: `attribut1..10` -> `detailItem.dataClassification1..10Name`
- [x] `extractDataClassificationValues` membaca slot 1-10 (worker auto-create tidak diubah)
- [x] Template unduhan: CLS1..CLS10 (`deliveryOrderTemplateGuide`)
- [x] Dropdown Cocokkan Kolom + dialog edit baris: CLS1..CLS10
- [x] Tes mapping diperluas; doc `architecture-delivery-order.md` diperbarui

## Referensi
- `docs/architecture/architecture-delivery-order.md`

## Keputusan Kecil Selama Eksekusi
- Nama kolom DO tetap "CLS" (bukan "Kategori Keuangan N" seperti Purchase Invoice) atas permintaan client; penamaan antar modul sengaja tidak diseragamkan.
- Auto-suggest nama kolom CLS TIDAK diaktifkan: template DO lama punya CLS2/CLS5 ganda (header + item) sehingga bisa salah pilih diam-diam. Keputusan menunggu konfirmasi.
- Tidak ada endpoint Accurate baru (pakai `findOrCreateDataClassification` yang sudah terdaftar) -> tidak ada scope baru, checklist 3b tidak berlaku (bukan modul baru).
- Catatan proses: kode dikerjakan sebelum dokumen fase ini ditulis (urutan SOP langkah 1 terbalik); dokumen dilengkapi sebelum fase ditutup.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Test API/web
- [x] Security review
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada auto-suggest nama kolom CLS1..10.
- Excel referensi `docs/referencehtml/facport/FACPORT_Delivery Order_v8.xlsx` belum diperbarui.
- Belum diuji dengan akun Accurate sungguhan.
