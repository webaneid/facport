# Fase 164 — Item Requisition: Rebuild Total ke Purchase Requisition

**Status:** Done
**Mulai:** 2026-09-30
**Selesai:** 2026-09-30

## Tujuan
Modul Item Requisition (Fase 135) dibangun sebagai "kembaran" Item
Transfer berdasarkan draft client yang TERNYATA salah. Client mengirim
ulang draft final yang membuktikan Item Requisition genuinely
`/api/purchase-requisition/save.do` (Permintaan Barang), dokumen
terpisah dari Item Transfer. Fase ini rebuild total mapping/route/
worker/frontend modul ini ke endpoint dan struktur field yang benar,
sambil sengaja TIDAK memigrasikan subscriber existing (keputusan
eksplisit user — bentuk lama itu salah total sejak awal).

## Scope
- [x] Riset & rekonsiliasi 2 file client (`developmen-15-september-2026.xlsx`
      sheet "Item Requisition" versi terbaru + `Format_PREQ_v2.xlsx`) —
      digabung jadi 46 kolom final.
- [x] Rewrite `apps/api/src/lib/import-mapping/item-requisition.mapping.ts` total.
- [x] `apps/api/src/lib/accurate-purchase-requisition.ts` baru (HTTP wrapper `savePurchaseRequisition`).
- [x] Update `apps/api/src/routes/item-requisition-import.route.ts` (validator baru).
- [x] Update `apps/api/src/lib/import-mapping/template-guide.ts` (`itemRequisitionTemplateGuide`, 46 kolom).
- [x] Update `apps/api/src/workers/index.ts` (`processItemRequisitionGroup` panggil `savePurchaseRequisition`, validasi `requisitionType`+`saveAsStatusType`).
- [x] Update `apps/api/src/lib/accurate-endpoint-registry.ts` (`item_requisition` → `purchase-requisition/save.do`).
- [x] `bun run scopes:sync` — scope turunan otomatis jadi `purchase_requisition_save`.
- [x] Update `apps/api/src/lib/accurate-scopes.test.ts` (`LEGACY_SCOPES.item_requisition`, bukan regresi — rebuild sengaja).
- [x] Update frontend: `apps/web/app/app/(protected)/item-requisition/import/page.tsx` (`ACCURATE_FIELDS`), `apps/web/components/item-requisition/edit-row-dialog.tsx` (required/date fields, hints).
- [x] Update `apps/web/lib/landing-content.ts` deskripsi modul.
- [x] Rewrite `item-requisition.mapping.test.ts` dan `item-requisition-import.route.test.ts` total.
- [x] Architecture doc `architecture-item-requisition.md` rewrite total.

## Referensi
- Architecture doc: `docs/architecture/architecture-item-requisition.md`
- Riset & histori keputusan: memory sesi `project_item_requisition_vs_item_transfer`

## Keputusan Kecil Selama Eksekusi
- **Item Price (unitPrice)**: spec Accurate wajib, client label wajib, TAPI 249/249 data nyata client kosong — diputuskan TIDAK di-enforce dari form, default `0` (mirror `unitCost` Inventory Adjustment).
- **Item Req Date (requiredDate)**: spec Accurate wajib, client label TIDAK wajib — diputuskan default ke `Transaction Date` dokumen kalau kosong, bukan ditolak.
- **Item Unit Name**: client label wajib, TAPI tidak ada di 3 field wajib resmi API dan 100/249 data nyata kosong (terkonsentrasi di 2 item non-fisik) — diputuskan opsional genuine, di-skip (bukan string kosong) kalau tidak diisi.
- **Atribut Tambahan 1-10 saja (bukan 1-11 seperti draft client)** — dipotong sesuai batas Accurate (dikonfirmasi screenshot Rancangan Formulir client), "Atribut Tambahan 11" di draft client dianggap salah ketik.
- **Sediakan semua 10 Karakter/10 Angka/2 Tanggal walau client cuma aktifkan 2 slot saat ini** — keputusan eksplisit user, supaya client tidak perlu minta tambah kolom lagi kalau nanti mengaktifkan slot lain di Accurate.
- **Subscriber existing (bentuk item-transfer lama) TIDAK dimigrasikan** — keputusan eksplisit user, riwayat batch lama dibiarkan sebagai histori, tidak dikonversi/ditandai khusus.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api & web, 0 error.
- [x] Test suite penuh — 1736 pass / 0 fail (114 file).
- [x] Security review dijalankan (skill `security-review`, langsung di sesi utama — ≤10 file).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan).
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- **Atribut Custom (charField1-10/numericField1-10/dateField1-2) belum dikonfirmasi tiket resmi Accurate** untuk endpoint `purchase-requisition/save.do` khusus — cuma didukung bukti screenshot Rancangan Formulir client, BUKAN spec publik atau tiket support seperti Inventory Adjustment (#357901). Kalau field ini ditolak Accurate saat test call nyata, cek ini duluan sebelum curiga ke tempat lain.
- **Belum ada test call nyata ke akun Accurate client** — baru lolos unit test/typecheck/security review, belum diverifikasi end-to-end ke Accurate sungguhan (sheet client masih belum kasih contoh baris yang sudah pasti FINAL, walau sudah representatif dari 249 baris nyata `Format_PREQ_v2.xlsx`).
- **`requisitionType=ALL` dan `saveAsStatusType` selain APPROVED/DRAFT belum ada data uji nyata** — validator tetap terima full enum resmi Accurate (forward-compatible), tapi jalur ini belum tervalidasi data sungguhan.
- **Subscriber existing berbasis mapping lama tidak dimigrasikan** — kalau mereka retry batch lama, hasilnya akan diproses dengan payload BARU (field beda total) — ini keputusan sengaja, bukan bug, tapi perlu diawasi kalau ada laporan bingung dari user lama (reza.eka17@gmail.com, dkk).

## Ringkasan Hasil
Modul Item Requisition sekarang genuinely memanggil `/api/purchase-requisition/save.do`
(Permintaan Barang) dengan 46 kolom final gabungan 2 file client, bukan
lagi kembaran Item Transfer. 3 penyimpangan dari label wajib/opsional
client (Item Price, Item Req Date, Item Unit Name) diputuskan eksplisit
berdasarkan bukti data nyata (249 baris `Format_PREQ_v2.xlsx`), bukan
tebakan sepihak. Scope OAuth berubah dari `item_transfer_save` ke
`purchase_requisition_save` (diturunkan otomatis lewat
`accurate-endpoint-registry.ts` + `bun run scopes:sync`, ADR-0036) — user
existing modul ini akan diminta "Hubungkan Ulang" Accurate begitu upload
pertama pasca-deploy. Item Transfer (`item-transfer.mapping.ts` dkk)
TIDAK disentuh sama sekali. Typecheck 0 error, test suite 1736 pass/0
fail (termasuk 19 test baru/ubah di mapping test + 4 test baru/ubah di
route test), security review 0 temuan blocking.
