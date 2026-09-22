# Fase 147 — Modul Work Order (Perintah Kerja)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Bangun modul import Work Order end-to-end sesuai `docs/architecture/architecture-work-order.md` (Fase 136): dokumen produksi berbasis BOM dengan 4 array
(bahan baku, biaya produksi, proses, produk sampingan), 1 panggilan `POST work-order/save.do` setelah lookup cabang & PIC. Sub-modul ke-5 (terakhir) dari
rencana Fase 136; kategori "Manufacture".

## Scope (task)
- [x] T1 `work-order.mapping.ts` (+ tes): 4 section per-baris-lebar, dictionary tipe, grouping by "Trans No", validasi baris/header/konsistensi grup
- [x] T2 `parseExcelBuffer`: samakan `headers` dengan key baris untuk header DUPLIKAT (`X`, `X_1`, `X_2`) + tes
- [x] T3 `accurate-work-order.ts`: `saveWorkOrder`, `resolveBranchId`, `findOrCreateWoPic` (+ tes fetch-mock)
- [x] T4 Registri endpoint & scope (`work_order`: save + branch/list + wo-pic list/save + Kategori Keuangan); snapshot sudah memuat semua endpoint
- [x] T5 Worker: `processWorkOrderGroup` + `ensureWorkOrderDataClassifications` + dispatch
- [x] T6 Route (+ tes) dengan `checkSubscriptionScopes` di confirm/retry, template guide 61 kolom
- [x] T7 Titik registrasi §3b (diverifikasi diff vs Roll Over: identik) + halaman web & dialog
- [x] T8 Typecheck, lint, tes penuh, security review, dokumen

## Keputusan Eksekusi
- **Bentuk Excel**: 1 baris "lebar" = header dokumen + maks. 1 entri per section; section terdeteksi dari kolom yang terisi. Dokumen multi-entri = banyak baris ber-Trans No sama; header cukup di baris pertama (baris lain boleh kosong, bila terisi harus sama).
- **Header duplikat** antar-section ("Project No" x3, "Process Category Name" x3, "CLS1-3" x3): dipetakan lewat nama hasil dedupe parser (`_1`, `_2`), BUKAN posisi kolom absolut. Menemukan bug laten di `parseExcelBuffer` (lihat lessons-learned).
- **Tidak auto-create item** (menyimpang dari butir 3 "Keputusan Desain" lama): produk utama tidak punya kolom nama sehingga `findOrCreateItem` tidak bisa; konsisten Fase 138/139/146. `item_save` tidak diminta.
- **Cabang**: selalu di-resolve ke `branchId` lewat `branch/list.do` (nama persis, tanpa peduli huruf besar/kecil), TIDAK auto-create; tidak ketemu = galat jelas. Tidak menunggu "test call `branchName` polos" karena mengirim `branchId` memenuhi spec di kedua kemungkinan perilaku Accurate.
- **PIC**: "PIC ID" berisi nama → find-or-create (`wo-pic`); angka murni dianggap ID PIC langsung.
- "Save As Status Type" tidak dipetakan (keputusan client 2026-09-21). `manufacture-order` tidak dipanggil.
- Edit baris gagal hanya memakai `workOrderRowError` (bukan `requiredFields` per baris), karena header boleh hanya di baris pertama.
- Scope modul: `work_order_save`, `branch_view`, `wo_person_in_charge_view/save`, `data_classification_view/save` (+ baseline `item_view`). Semua scope ini BARU bagi pelanggan → popup "Perbarui Izin" (gerbang Fase 144) saat modul dibeli.

## Di luar scope
Material Slip & Finished Good Slip (panduan client belum ada), auto-approve, `manufacture-order/save.do`, Batal Import.

## Known Limitations
- Belum diuji ke Accurate sungguhan: payload dari spec OpenAPI + header sheet client (sheet client hanya header, tanpa data isi). Uji dengan Work Order nyata di DEV Retail Demo WAJIB sebelum rilis (terutama: `workOrderType` istilah client vs isi Excel riil, array `detailMaterial`/`detailExpense` kosong, `branchId`).
- `processWorkOrderGroup` tidak punya tes unit langsung (mengimpor `workers/index.ts` memulai efek samping queue); logika dipecah ke fungsi yang dites (mapping, lookup, route). Pemanggilan berurutan dicek via review kode.
- Pesan galat baris memakai id baris internal (pola modul lain), bukan nomor baris Excel.
- Nama PIC dari Excel tidak dibatasi panjangnya di Facport (Accurate yang memvalidasi).

## Ringkasan Hasil
Mapping (+21 tes termasuk putaran template→parse→mapping), client Accurate (+7 tes), route (+22 tes), perbaikan parser header duplikat (+1 tes), worker, registri scope, 11 titik registrasi §3b (diff identik dengan Roll Over), 5 berkas web. Typecheck 0 error, lint bersih, API 1535 pass, web 97 pass; data tes dibersihkan. Security review: guard/`moduleAccess`/`t.Object`/scope check setara route referensi, lookup ter-encode, tanpa secret/`t.Any`; tanpa temuan Critical/High.
