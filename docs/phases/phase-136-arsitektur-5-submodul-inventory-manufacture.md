# Fase 136 — Arsitektur 5 Sub-Modul Baru (Sales Order, Inventory Adjustment, Job Costing, Roll Over, Work Order)

**Status:** Done (dokumen arsitektur 5 sub-modul). Eksekusi: Sales Order (Fase 137), Inventory Adjustment (138), Job Costing (139) SELESAI & rilis v2.6.1; Roll Over (Fase 146) dan Work Order (Fase 147) SELESAI dibangun 2026-09-22, ada di `develop` dan BELUM dirilis
**Mulai:** 2026-09-21
**Selesai:** —

## Tujuan
Client menyiapkan panduan Excel (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
sheet per modul + screenshot UI Accurate) untuk 5 sub-modul baru.
Mirror pola Fase 119 (arsitektur dulu, eksekusi per modul jadi fase
terpisah nanti). Permintaan awal user: Other Deposit, Sales Order,
Inventory Adjustment, Job Costing, Roll Over — **Other Deposit DIGANTI
Work Order** (per instruksi eksplisit user) karena Other Deposit SUDAH
dibangun (Fase 128, live v2.5.0). 5 modul final fase ini: **Sales
Order** (kategori Sales), **Inventory Adjustment** (kategori
Inventory), **Job Costing, Roll Over, Work Order** (kategori
Manufacture — 0% built sebelumnya, jadi 3 modul ini yang PERTAMA
mengisi kategori tersebut).

## Scope
- [x] Ekstrak & baca seluruh sheet + gambar panduan client (16 sheet,
  69 gambar total di file — 20 gambar relevan untuk 5 modul target)
- [x] Cross-reference tiap kolom Excel client ke field resmi
  `accurate-openapi.json` per endpoint (`sales-order`, `item-adjustment`,
  `job-order`, `roll-over`, `work-order` + `wo-pic` untuk Work Order)
- [x] `docs/architecture/architecture-sales-order.md`
- [x] `docs/architecture/architecture-inventory-adjustment.md`
- [x] `docs/architecture/architecture-job-costing.md`
- [x] `docs/architecture/architecture-roll-over.md`
- [x] `docs/architecture/architecture-work-order.md`
- [ ] Konfirmasi user atas keputusan/ambiguitas terbuka (§ di bawah)
  sebelum fase ditutup "Done"

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-order.md`, `architecture-inventory-adjustment.md`, `architecture-job-costing.md`, `architecture-roll-over.md`, `architecture-work-order.md`
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx`
- Fase acuan pola sama: `docs/phases/phase-119-arsitektur-5-submodul-purchase-sales.md`

## Keputusan Kecil Selama Eksekusi
- Sheet tracker "Note" di file client (kolom "Panduan"/"Eksekusi")
  TIDAK bisa dipercaya mentah-mentah — Job Costing/Roll Over/Work Order
  ditandai kosong padahal screenshot panduannya tetap lengkap ada
  (dicek langsung per sheet, bukan asumsi dari tracker).
- Urutan build direkomendasikan: **Job Costing sebelum Roll Over**
  (Roll Over wajib referensi `jobOrderNumber` yang sudah ada). Sales
  Order, Inventory Adjustment, Work Order tidak punya dependensi urutan
  ke modul lain fase ini.
- **2026-09-21 — User keputusan eksplisit**: TUNGGU semua ambiguitas
  di bawah clear dulu (termasuk cek Work Order Type vs Save As Status
  Type langsung ke Excel/Accurate oleh user sendiri) sebelum mulai
  eksekusi/coding modul MANAPUN — TERMASUK Sales Order yang sebenarnya
  sudah tidak punya ambiguitas. Jangan mulai Langkah 2 (Eksekusi) fase
  manapun sampai user follow-up dengan jawaban.
- **2026-09-21 — Klarifikasi client diterima**: "Work Order Type" =
  1 field (`workOrderType`), "Save As Status Type" = field approval
  TERPISAH (auto-approve kalau diisi `APPROVED`, fitur approval
  workflow Accurate). Dicek ulang ke `accurate-openapi.json`: field
  approval TIDAK ketemu di skema `work-order/save.do` dan TIDAK ada
  endpoint `/api/approval/*` di spec lokal.
- **2026-09-21 — RESOLVED, keputusan client**: kolom "Save As Status
  Type" DITUNDA — dijadikan **opsional, tidak wajib diisi customer**,
  tidak di-mapping ke field API apa pun untuk sekarang. Fitur
  auto-approve jadi scope terpisah kalau nanti benar-benar dibutuhkan
  (tidak perlu riset endpoint approval lebih lanjut sekarang).

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error — TIDAK RELEVAN fase ini (0 kode diubah,
  murni dokumentasi, konsisten pola Fase 119)
- [ ] Security review — TIDAK RELEVAN fase ini (0 kode diubah)
- [ ] Temuan Critical/High — N/A
- [ ] Temuan Medium/Low — N/A
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
Setiap architecture doc mencatat known limitations spesifik modulnya
sendiri (§ "Known Limitations" masing-masing file). Ringkasan lintas
modul yang PALING signifikan:
- **RESOLVED 2026-09-21 (revisi penilaian risiko)**: Atribut Tambahan
  (`charField`/`numericField`/`dateField`) untuk `item-adjustment`,
  `job-order`, `roll-over` awalnya ditandai "belum diverifikasi", TAPI
  riset ulang `docs/lessons-learned.md` (2026-09-08) menegaskan tiket
  resmi Accurate Support #357901 sudah menyatakan mekanisme ini
  **konsisten lintas jenis transaksi** — dasar yang SAMA yang sudah
  dipakai Purchase Order (Fase 119) untuk langsung lanjut coding. Jadi
  ke-3 endpoint ini SEKARANG diperlakukan sama: boleh langsung
  di-coding, 1x test call cuma rekomendasi jaring pengaman (bukan
  syarat mulai coding lagi).
- **✅ RESOLVED 2026-09-21 (temuan besar, verifikasi portal developer
  LIVE via browser)**: `warehouseName`/`detailSerialNumber[]` Job
  Costing BUKAN field undocumented di `job-order/save.do` — itu field
  RESMI di **endpoint KEDUA yang sama sekali tidak ada di snapshot JSON
  lokal**: `POST /api/material-adjustment/save.do` ("Penambahan Bahan
  Baku", scope `material_adjustment_*`, field `jobOrderNumber` REQUIRED
  mereferensikan Job Order yang sudah dibuat). Job Costing SEKARANG
  jadi **2 panggilan API berurutan per grup** (`job-order/save.do` untuk
  header+expense, lalu `material-adjustment/save.do` untuk realisasi RM
  dengan gudang+serial) — pola BARU yang belum ada preseden di modul
  lain. Detail lengkap → `architecture-job-costing.md` § "RESOLVED: 2
  Endpoint". Bonus temuan: ada JUGA `/api/manufacture-order/save.do`
  ("Rencana Produksi") yang kemungkinan relevan ke Work Order
  `workOrderType=MANUFACTURE_ORDER` — belum dieksplor tuntas, dicatat
  di `architecture-work-order.md`.
- **Nilai literal enum** ("Tipe Adj" Inventory Adjustment, "Tipe
  Penyesuaian" Roll Over) — ini BUKAN pertanyaan API/akses Accurate
  sama sekali, murni butuh contoh data Excel riil dari client.
- **Work Order** — SEMUA 3 ambiguitas awal SEKARANG RESOLVED (update
  di bawah menutup sisa item scope `wo-pic`).
- **Roll Over** bergantung urutan pada Job Costing (`jobOrderNumber`
  REQUIRED, referensi ke dokumen Job Costing yang sudah ada).

## Update 2026-09-21 — Verifikasi Menyeluruh vs Portal Developer LIVE (Semua 5 Modul)

User minta cek ulang TOTAL sebelum eksekusi: "jangan eksekusi sampai
kamu benar-benar yakin sudah sesuai dokumentasi API yang akurat".
Karena `accurate-openapi.json` lokal SUDAH terbukti 2x tidak lengkap
sesi ini (charField dulu, `material-adjustment` kemarin), verifikasi
kali ini dilakukan LANGSUNG ke portal developer Accurate live
(`account.accurate.id/developer/api-docs.do` via browser, akun client
sudah login) untuk KELIMA endpoint utama + 2 endpoint pendukung Work
Order, field per field.

**Hasil per modul:**
- **Sales Order** — 100% cocok, 0 gap. **SIAP eksekusi, 0 risiko
  dokumentasi API.**
- **Inventory Adjustment** — 100% cocok, 0 gap (charField tetap
  undocumented di mana pun, konsisten temuan sebelumnya, bukan hal
  baru). **SIAP eksekusi** — sisa item cuma nilai literal "Tipe Adj"
  dari client (bukan isu API).
- **Roll Over** — 100% cocok + 1 field tambahan ditemukan
  (`detailItem[].allocationAmount`, tidak dipakai client) + **bonus**:
  label UI enum `rollOverType` ketemu ("Akun"/"Barang") yang
  menjelaskan sebagian besar pertanyaan nilai literal "Tipe
  Penyesuaian" tanpa perlu data client. **SIAP eksekusi** (tetap
  urutan setelah Job Costing).
- **Work Order** — 100% cocok field-nya + **scope `wo-pic` yang
  tadinya "MASIH TERBUKA" SEKARANG RESOLVED PENUH**: scope resminya
  `wo_person_in_charge_view`/`_save`/`_delete` (TERPISAH dari
  `work_order_*`, dugaan "terbundel" TERBUKTI SALAH). 1 koreksi kecil:
  `detailExtraFinishGood[].portion`/`.quantity` REQUIRED (semula
  ditulis opsional). **SIAP eksekusi** — sisa `branchId` vs
  `branchName` tetap butuh 1x test call nyata (pertanyaan perilaku
  runtime Accurate, bukan lagi dokumentasi).
- **Job Costing** — sudah direvisi total di update sebelumnya (2
  endpoint). Tidak ada temuan baru di verifikasi ulang ini.

**Kesimpulan**: SEMUA ketidakpastian level dokumentasi API sudah
diselesaikan untuk 5 modul ini. Sisa item terbuka SEKARANG murni: (a)
pertanyaan data ke client (nilai literal enum di Excel mereka), (b) 1
test call runtime ke akun Accurate client (`branchId` Work Order), (c)
keputusan desain kecil (semantik `materialAdjustmentAccountNo` Job
Costing, penanganan kegagalan parsial 2-endpoint). TIDAK ADA LAGI
pertanyaan "field ini ada di API atau tidak" yang belum terjawab.

## Ringkasan Hasil (isi pas fase Done)
