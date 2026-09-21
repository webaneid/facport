# Architecture — Inventory Adjustment (Penyesuaian Persediaan)

> Fase 136 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-3 dari kategori "Inventory" (setelah Item Requisition, Item
> Transfer — Fase 134-135). Sumber kebutuhan: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Inventory Adjustment" — **gitignored**) + spec resmi Accurate
> (`docs/referencehtml/accurate-openapi.json` `/api/item-adjustment/save.do`).
> Catatan: sheet tracker "Note" di file yang sama menandai kolom
> "Panduan" untuk modul ini "Sudah", TAPI screenshot yang tersedia HANYA
> menutupi tab "Item Detail" + "Serial/Production Number" — tab
> "Additional Info" (kemungkinan tempat Atribut Tambahan/Kategori
> Keuangan diisi) TIDAK ada screenshot-nya. Lihat § "Known Limitations".

## Posisi dalam Alur Inventory

Inventory Adjustment BUKAN bagian dari rantai dokumen berurutan
(beda dari Item Transfer/Item Requisition yang keduanya "pindah/kirim
barang antar lokasi") — ini transaksi MANDIRI untuk mengoreksi selisih
stok fisik vs sistem (stock opname, barang rusak/hilang, dll), langsung
berdampak jurnal GL via `adjustmentAccountNo`. Tidak ada dokumen
"pendahulu" atau "lanjutan" yang perlu direferensikan.

## Endpoint Accurate
`POST /accurate/api/item-adjustment/save.do` — dikonfirmasi dari
`accurate-openapi.json`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
transDate: string REQUIRED
adjustmentAccountNo: string — kosong = pakai default preferensi
branchId / branchName, description, number, typeAutoNumber

detailItem[] (REQUIRED, minimal 1):
  itemAdjustmentType: enum REQUIRED ['ADJUSTMENT_IN','ADJUSTMENT_OUT','ADJUSTMENT_STOCK']
  itemNo: string REQUIRED
  unitCost: number REQUIRED (hanya relevan kalau tipe menambah qty)
  quantity, itemUnitName, detailName, detailNotes, warehouseName,
  departmentName, projectNo,
  dataClassification1Name..10Name (Kategori Keuangan)
  detailSerialNumber[] (nested, opsional):
    serialNumberNo, quantity, expiredDate
```

## Field Mapping Excel Client → API

| Excel Column | API Field | Catatan |
|---|---|---|
| Tanggal | transDate | header, REQUIRED |
| No. Item Adjustment | number | header, opsional (kunci grouping) |
| Adj Account No | adjustmentAccountNo | header |
| Keterangan | description | header |
| Cabang | branchName | header, **WAJIB diisi** (§ Branch Wajib) |
| Item No | detailItem[].itemNo | REQUIRED per baris |
| Qty | detailItem[].quantity | |
| Unit | detailItem[].itemUnitName | |
| Unit Price (jika adj tambah) | detailItem[].unitCost | REQUIRED per spec, tapi nama kolom Excel sendiri mengisyaratkan cuma relevan untuk `ADJUSTMENT_IN`/`ADJUSTMENT_STOCK` naik — perlu keputusan default (0?) untuk `ADJUSTMENT_OUT` |
| Gudang | detailItem[].warehouseName | |
| Tipe Adj | detailItem[].itemAdjustmentType | REQUIRED, enum — perlu mapping istilah Excel client ("Tambah"/"Kurang"/"Stok"?) ke `ADJUSTMENT_IN`/`ADJUSTMENT_OUT`/`ADJUSTMENT_STOCK`, **cek nilai riil di kolom saat eksekusi** |
| Note Penting | detailItem[].detailNotes | |
| Serial Qty | detailItem[].detailSerialNumber[].quantity | nested |
| Serial No | detailItem[].detailSerialNumber[].serialNumberNo | nested |
| Serial ExpDate | detailItem[].detailSerialNumber[].expiredDate | nested |
| Atribut Tambahan 1-10 | `detailItem[].charField1`-`charField10` | **Dikonfirmasi** (tiket resmi Accurate Support #357901, "konsisten lintas jenis transaksi") — § "Atribut Tambahan" di bawah |
| Atribut Number 1-10 | `detailItem[].numericField1`-`numericField10` | sama |
| Atribut Date 1-2 | `detailItem[].dateField1`-`dateField2` | sama |

Tidak ada kolom "Item Dept"/"Item Project No" eksplisit di Excel client
untuk modul ini — tapi API mendukung `departmentName`/`projectNo` per
item kalau nanti dibutuhkan (tidak wajib dipetakan sekarang, ikut
scope Excel yang diminta).

## Keputusan Desain (Rencana)
1. **Tidak ada auto-create Vendor/Customer** — Inventory Adjustment
   cuma butuh `itemNo` (barang) dan `adjustmentAccountNo` (akun GL) yang
   BIASANYA sudah ada di data master. Pola paling dekat: Item Transfer/
   Item Requisition (`findOrCreateItem` kalau perlu, TIDAK ada
   vendor/customer). Scope OAuth kandidat: `item_adjustment_save`,
   `item_save` (kalau mau auto-create item baru), `glaccount_view`
   (lookup akun penyesuaian, mirror `item_transfer`),
   `data_classification_view`+`data_classification_save`.
2. **Grouping multi-baris** — SAMA pola modul lain: `No. Item
   Adjustment` (kalau diisi) jadi kunci, kosong = 1 baris = 1 dokumen
   sendiri.
3. **Nested `detailSerialNumber[]`** — SAMA pola Item Transfer/Item
   Requisition (§ `architecture-item-transfer.md` "Nested
   `detailSerialNumber[]`"): 1 baris Excel = maksimal 1 entri serial,
   multi-serial per item butuh multi-baris Excel dengan `Item No` sama.
4. **Mapping `Tipe Adj` → enum `itemAdjustmentType`** — client
   kemungkinan isi teks bebas ("Tambah"/"Kurang"/"Stok Opname" dll),
   BUKAN nilai enum literal Accurate — WAJIB dikonfirmasi nilai riil
   kolom ini ke client sebelum eksekusi (lookup table/dictionary,
   BUKAN pass-through langsung seperti field lain).

## ✅ Atribut Tambahan (Custom Character/Number/Date) — SUDAH Confirmed Resmi (Revisi Penilaian Risiko)
**Revisi 2026-09-21**: penilaian awal "BELUM diverifikasi" terlalu
konservatif — riset ulang ke `docs/lessons-learned.md` (2026-09-08,
"Spec API vendor pihak ketiga TIDAK LENGKAP") menegaskan mekanisme
`charField`/`numericField`/`dateField` dikonfirmasi resmi Accurate
Support (tiket #357901) dengan pernyataan eksplisit **"konsisten
lintas jenis transaksi"** — bukan klaim khusus 1-2 modul saja. Purchase
Order (Fase 119) sudah menerima level keyakinan ini SEBAGAI CUKUP untuk
lanjut coding (cuma rekomendasi 1x test call sebagai jaring pengaman,
BUKAN blocker) — Inventory Adjustment semestinya diperlakukan SAMA,
bukan distandar-gandakan lebih ketat tanpa alasan.

Absennya tab "Additional Info" di screenshot panduan client TIDAK
mengubah kesimpulan ini — preseden Fase 61 (§ lessons-learned) SUDAH
membuktikan `accurate-openapi.json` DAN bukti visual UI bisa SAMA-SAMA
tidak lengkap/tidak representatif, sementara pernyataan tertulis
Accurate Support ("konsisten lintas jenis transaksi") adalah sumber
kebenaran yang lebih kuat dari keduanya.

**Kesimpulan**: field `charField1-10`/`numericField1-10`/`dateField1-2`
di level item **DIANGGAP DIDUKUNG** untuk `item-adjustment/save.do`,
boleh langsung di-coding. Rekomendasi (bukan syarat wajib): 1x test
call murah sebagai verifikasi akhir sebelum rollout penuh — kalau
ternyata gagal, itu insiden baru yang perlu dieskalasi ke Accurate
Support (bukan hal yang menahan mulai coding).

## ⚠️ Branch Wajib (Preseden Fase 90)
Sama seperti modul baru lain — `Cabang` WAJIB divalidasi non-kosong di
Facport SEBELUM kirim ke Accurate. Verifikasi ulang via test call nyata
saat eksekusi.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- Atribut Tambahan — RESOLVED level keyakinan (§ di atas), boleh
  langsung coding, 1x test call cuma rekomendasi jaring pengaman.
- **Nilai literal kolom "Tipe Adj"** (mapping ke enum
  `ADJUSTMENT_IN`/`ADJUSTMENT_OUT`/`ADJUSTMENT_STOCK`) — ini BUKAN
  pertanyaan API, murni butuh **contoh data Excel riil dari client**
  (apa isi kolom itu di baris asli mereka — "Tambah"/"Kurang"/dll).
  Tidak perlu test call/akses Accurate untuk ini, cukup tanya client.
- `unitCost` ditandai REQUIRED oleh spec meski nama kolom Excel
  mengisyaratkan opsional ("jika adj tambah") — perlu verifikasi
  apakah `0`/kosong diterima Accurate untuk `ADJUSTMENT_OUT` (test
  call atau tanya Accurate Support kalau ditolak).
- `save-target-quantity.do` (varian "set ke qty target" bukan
  in/out/stock manual) ADA di spec tapi TIDAK diminta client — sengaja
  tidak masuk scope.
- `bulk-save.do` ADA tapi project ini KONSISTEN pakai `save.do`
  per-grup.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/item-adjustment/save.do`
- **✅ Portal developer live, diverifikasi lengkap 2026-09-21**: SEMUA
  field (`detailItem[]`, `detailSerialNumber[]`, header) cocok 100%
  dengan spec lokal — 0 gap ditemukan (charField/numericField/dateField
  tetap tidak terdokumentasi di mana pun, konsisten § "Atribut
  Tambahan" di atas — bukan kejutan baru). Verifikasi via
  `account.accurate.id/developer/api-docs.do`.
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Inventory Adjustment"
- Pola nested serial number: `architecture-item-transfer.md`
- Preseden Atribut Tambahan: `architecture-purchase-order.md` § "Atribut Tambahan"
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"
