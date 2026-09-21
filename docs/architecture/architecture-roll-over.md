# Architecture — Roll Over (Penyelesaian Pesanan)

> Fase 136 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-2 kategori "Manufacture", kembaran/kelanjutan Job Costing
> (`architecture-job-costing.md`). Sumber kebutuhan: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Roll Over" — **gitignored**) + spec resmi Accurate
> (`docs/referencehtml/accurate-openapi.json` `/api/roll-over/save.do`).
> Sama seperti Job Costing, sheet tracker "Note" menandai kolom
> "Panduan" kosong tapi screenshot panduan TETAP lengkap ada (dicek
> langsung).

## Posisi dalam Alur Manufacture

Roll Over adalah dokumen "PENUTUP" dari Job Costing — mengonversi
akumulasi biaya Raw Material + Expense di sebuah Job Order jadi
Finished Good + alokasi biaya (bisa per-item atau per-account):

```
Job Costing (Job Order) → Roll Over
  (No Job Order dibuat)     (WAJIB referensi No Job Order yang SUDAH ADA)
```

**Ketergantungan urutan**: `jobOrderNumber` adalah field REQUIRED di
`roll-over/save.do` — modul ini TIDAK BISA berdiri sendiri tanpa Job
Costing sudah live lebih dulu (baik di Facport maupun manual di
Accurate). Rekomendasi urutan eksekusi: Job Costing dulu, baru Roll
Over (mirror urutan Purchase Order → Receive Item).

## Endpoint Accurate
`POST /accurate/api/roll-over/save.do` — dikonfirmasi dari
`accurate-openapi.json`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
jobOrderNumber: string REQUIRED — No Job Order yang diselesaikan (TIDAK divalidasi lokal, Accurate yang reject kalau nomor tidak ada)
rollOverType: enum REQUIRED ['ACCOUNT', 'ITEM']
transDate: string REQUIRED
branchId / branchName, description, number, typeAutoNumber

detailItem[] (REQUIRED, Finished Good — dipakai jika rollOverType=ITEM):
  itemNo, quantity, itemUnitName, detailName, detailNotes,
  warehouseName, portion (number, %), allocationAmount (number, "Alokasi
  Biaya" — TIDAK diminta client, dicatat untuk kelengkapan saja),
  departmentName, projectNo, dataClassification1Name..10Name (Kategori Keuangan)
  detailSerialNumber[] (nested, resmi didokumentasikan — BEDA dari Job
    Costing yang undocumented):
    serialNumberNo, quantity, expiredDate

detailExpense[] (REQUIRED oleh spec, dipakai jika rollOverType=ACCOUNT):
  accountNo, expenseAmount, expenseName, expenseNotes, portion (number, %),
  departmentName, dataClassification1Name..10Name
```

## Field Mapping Excel Client → API

| Excel Column | API Field | Catatan |
|---|---|---|
| Tanggal | transDate | header, REQUIRED |
| No Trans | number | header, opsional (kunci grouping) |
| Job Order No | jobOrderNumber | header, **REQUIRED**, referensi ke Job Costing |
| Tipe Penyesuaian | rollOverType | header, **REQUIRED**, enum `ACCOUNT`/`ITEM` — **✅ label UI dikonfirmasi 2026-09-21 via portal developer live**: `ACCOUNT`="Akun", `ITEM`="Barang" — dictionary mapping ini kemungkinan besar cocok, TAPI tetap cek nilai literal kolom Excel client saat eksekusi (istilah client bisa beda dari label UI resmi) |
| Keterangan | description | header |
| Nama Cabang | branchName | header, **WAJIB diisi** (§ Branch Wajib) |
| FG_Item No | detailItem[].itemNo | Finished Good, per baris (relevan kalau `rollOverType=ITEM`) |
| FG_Qty | detailItem[].quantity | |
| FG_Unit | detailItem[].itemUnitName | |
| SN - Qty | detailItem[].detailSerialNumber[].quantity | nested, RESMI didokumentasikan (beda dari Job Costing) |
| Serial No | detailItem[].detailSerialNumber[].serialNumberNo | nested |
| SN - Exp Date | detailItem[].detailSerialNumber[].expiredDate | nested |
| Project No | detailItem[].projectNo | |
| Dept Name | detailItem[].departmentName | |
| Portion | detailItem[].portion (atau detailExpense[].portion) | % alokasi biaya — perlu tahu `rollOverType` baris terkait untuk tentukan masuk `detailItem[]` atau `detailExpense[]` |
| Warehouse | detailItem[].warehouseName | |
| Item: Atribut Tambahan 1-10 | `detailItem[].charField1`-`charField10` | **Dikonfirmasi** (tiket resmi Accurate Support #357901) — § "Atribut Tambahan" di bawah |
| Item: Atribut Number 1-10 | `detailItem[].numericField1`-`numericField10` | sama |
| Item: Atribut Date 1-2 | `detailItem[].dateField1`-`dateField2` | sama |
| Financial Category 1-10 | dataClassification1Name..10Name | Kategori Keuangan, SUDAH resmi didukung (beda dari "Atribut Tambahan" di atas) |

Excel client TIDAK punya kolom terpisah untuk `detailExpense[]`
(Expense Acc No/Name/Amount) — mengisyaratkan client kemungkinan HANYA
akan pakai `rollOverType=ITEM` di praktiknya, tapi API tetap mewajibkan
`detailExpense` array (boleh `[]` kosong, konsisten pola array kosong
diterima di modul lain).

## Keputusan Desain (Rencana)
1. **Tidak ada auto-create Vendor/Customer** — tidak ada field
   vendor/customer sama sekali di endpoint ini. Auto-create yang relevan
   cuma `item_save` untuk Finished Good baru. Scope OAuth kandidat:
   `roll_over_save`, `item_save`, `glaccount_view` (lookup
   `accountNo` kalau `rollOverType=ACCOUNT` dipakai),
   `data_classification_view`+`data_classification_save`.
2. **`rollOverType` menentukan array mana yang dipakai** — beda dari
   modul lain, di sini pilihan enum header MENENTUKAN apakah baris
   Excel masuk ke `detailItem[]` (ITEM) atau `detailExpense[]`
   (ACCOUNT). Kalau client Excel selalu isi `Tipe Penyesuaian=Item`,
   `detailExpense` cukup dikirim `[]` — TAPI Facport tetap perlu
   validasi/percabangan logic ini, bukan asumsi selalu ITEM.
3. **Grouping multi-baris** — `No Trans` (kalau diisi) jadi kunci,
   SAMA pola modul lain.
4. **Nested `detailSerialNumber[]`** — di sini RESMI didokumentasikan
   (beda dari Job Costing), jadi bisa langsung diimplementasi tanpa
   test call verifikasi tambahan untuk field ini spesifik (serial
   number-nya, bukan warehouse-nya yang juga resmi di sini).

## ✅ Atribut Tambahan (Custom Character/Number/Date) — SUDAH Confirmed Resmi (Revisi Penilaian Risiko)
**Revisi 2026-09-21** (sama koreksi seperti `architecture-inventory-adjustment.md`):
mekanisme `charField`/`numericField`/`dateField` SUDAH dikonfirmasi
resmi Accurate Support (tiket #357901) "konsisten lintas jenis
transaksi" — pernyataan ini SUDAH cukup jadi dasar Purchase Order
(Fase 119) langsung lanjut coding, bukan alasan untuk menahan modul
lain. Absennya screenshot tab "Additional Info" TIDAK mengubah
kesimpulan (preseden Fase 61: bukti visual UI terbukti bisa tidak
lengkap juga, § `architecture-inventory-adjustment.md`).

**Kesimpulan**: field ini DIANGGAP DIDUKUNG untuk `roll-over/save.do`,
boleh langsung di-coding. 1x test call tetap direkomendasikan sebagai
jaring pengaman sebelum rollout penuh, TAPI bukan syarat mulai coding
— konsisten "Financial Category" (`dataClassification`) yang memang
SUDAH pasti aman karena resmi ada di spec.

## ⚠️ Branch Wajib (Preseden Fase 90)
Sama seperti modul baru lain — `Nama Cabang` WAJIB divalidasi non-kosong
di Facport SEBELUM kirim ke Accurate.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **Nilai literal kolom "Tipe Penyesuaian"** — SEBAGIAN RESOLVED
  (label UI resmi "Akun"/"Barang" dikonfirmasi via portal live,
  § tabel mapping di atas), TAPI tetap perlu contoh data Excel riil
  dari client untuk pastikan istilah mereka cocok dengan label UI ini
  (bisa saja beda, seperti kasus lain di project ini).
- Kolom "Portion" ambigu masuk `detailItem[].portion` atau
  `detailExpense[].portion` tergantung `rollOverType` baris — logic
  percabangan ini perlu didesain eksplisit saat eksekusi, bukan
  mapping 1:1 statis seperti kolom lain.
- Atribut Tambahan level item — RESOLVED level keyakinan (§ di atas),
  boleh langsung coding, 1x test call cuma rekomendasi jaring pengaman.
- Dependensi ke Job Costing: kalau Job Costing belum di-build/live saat
  Roll Over mulai dikerjakan, `Job Order No` dari client tidak bisa
  divalidasi ujung-ke-ujung sampai kedua modul live bersamaan —
  rekomendasi: build & rilis Job Costing dulu, baru Roll Over.
- `bulk-save.do` ADA tapi project ini KONSISTEN pakai `save.do`
  per-grup.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/roll-over/save.do`
- **Portal developer live, diverifikasi lengkap 2026-09-21**: semua
  field cocok 100% dengan spec lokal (1 field tambahan ditemukan,
  `detailItem[].allocationAmount`, § "Struktur Field" di atas — tidak
  dipakai client, dicatat untuk kelengkapan), plus label enum
  `rollOverType` ("Akun"/"Barang") — dikonfirmasi via
  `account.accurate.id/developer/api-docs.do`.
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Roll Over"
- Modul pendahulu (WAJIB dibangun duluan): `architecture-job-costing.md`
- Preseden field undocumented-tapi-jalan: `architecture-purchase-order.md` § "Atribut Tambahan"
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"

## Registri endpoint & scope (siap dipakai saat dibangun — Fase 142)
Saat modul dibangun, daftarkan di `apps/api/src/lib/accurate-endpoint-registry.ts` (entry `roll_over`, kunci HARUS ada di `module-catalog.ts` varian facport):
`POST roll-over/save.do` (spec: `roll_over_save`; `bulk-save.do` juga `roll_over_save`) + helper yang benar-benar dipanggil kode (mis. `POST item/save.do` bila
auto-create item, `GET/POST data-classification/*` bila ada Kategori Keuangan). `roll_over_view` HANYA bila ada panggilan `roll-over/list|detail.do`. Setelah itu
`bun run scopes:sync` (jika endpoint belum ada di snapshot) dan tes `accurate-scopes.test.ts` harus hijau. Pasang juga `checkSubscriptionScopes` di route import.
Dependensi urutan: Job Costing (Fase 139) SUDAH selesai — Roll Over boleh dibangun.
