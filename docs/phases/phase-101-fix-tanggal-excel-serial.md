# Fase 101 — Fix Tanggal Excel Serial Terkirim Mentah (Other Payment & Journal Voucher)

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Client retest import Other Payment (baru dirilis v1.27.0) dapat error
Accurate: "Invalid field value for field dateField2."; "Invalid field
value for field dateField1." saat mengisi kolom "Atribut Tanggal
1"/"Atribut Tanggal 2". Root cause: cell Excel bertipe Tanggal ASLI
dibaca sebagai angka serial oleh `parseExcelBuffer` (tidak set
`cellDates`), dan `other-payment.mapping.ts` mengirim angka itu mentah
(`String()` polos) alih-alih dikonversi ke format `DD/MM/YYYY` yang
Accurate wajibkan. Audit proaktif menemukan bug SAMA di
`journal-voucher.mapping.ts` (`transDate`) — belum pernah dilaporkan,
kemungkinan besar client JV kebetulan selalu isi tanggal sebagai teks.

## Scope
- [x] `other-payment.mapping.ts` — tambah `toAccurateDate()`/`dateValueOf()`
      (mirror PERSIS `sales-receipt.mapping.ts`), dipakai untuk
      `transDate` (root) dan `attributTanggal1`/`attributTanggal2`
      (root, → `dateField1`/`dateField2`).
- [x] `journal-voucher.mapping.ts` — fix bug SAMA untuk `transDate`
      (ditemukan lewat audit proaktif, bukan laporan client langsung).
- [x] Test regresi: 3 test baru di `other-payment.mapping.test.ts`
      (serial→DD/MM/YYYY untuk transDate+dateField1/2, plus zero-regression
      untuk string yang sudah benar), 2 test baru di
      `journal-voucher.mapping.test.ts` (serial+zero-regression untuk transDate).
- [x] Update `docs/lessons-learned.md`.

## Referensi
- `docs/lessons-learned.md` entri 2026-09-11 "Cell Excel bertipe Tanggal asli..."
- Precedent fungsi yang di-mirror: `sales-receipt.mapping.ts`/`purchase-payment.mapping.ts` § `toAccurateDate`
- Modul yang terdampak: `docs/architecture/architecture-other-payment.md`, `docs/architecture/architecture-journal-voucher.md`

## Keputusan Kecil Selama Eksekusi
- `toAccurateDate()` di-COPY-PASTE ke `other-payment.mapping.ts` DAN
  `journal-voucher.mapping.ts` (bukan diekstrak ke util shared satu
  tempat) — konsisten filosofi project ini ("3 baris mirip lebih baik
  dari abstraksi prematur"), sudah ada di 4 file lain dengan pola sama.
  Kalau ada modul ke-6/7 yang butuh lagi, PERTIMBANGKAN ekstraksi ke
  `lib/` shared saat itu (dicatat di lessons-learned sebagai ambang
  yang sudah lewat wajar).
- TIDAK melakukan audit menyeluruh ke SEMUA field tanggal di SEMUA
  mapping file lain (purchase-invoice/sales-invoice sudah pernah dicek
  punya `toAccurateDate`, tidak diverifikasi ulang detail di fase ini)
  — scope dibatasi ke 2 modul yang benar-benar kena masalah ini
  (Other Payment yang dilaporkan, Journal Voucher yang ditemukan
  proaktif karena strukturnya paling mirip Other Payment).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite: 644 pass / 0 fail (5 test baru fase ini).
- [x] `bun run lint` — 0 error.

## Known Limitations
- Belum diverifikasi lagi via test call nyata ke Accurate SETELAH fix
  ini (client yang laporkan bug awal disarankan retest lagi setelah
  deploy fix ini, untuk konfirmasi dateField1/dateField2 benar-benar
  diterima sekarang).
- Field tanggal LAIN yang mungkin ditambahkan di modul mapping BARU di
  masa depan TETAP rawan bug yang sama kalau developer/Claude lupa
  pakai `toAccurateDate()` — tidak ada guard structural (lint rule/
  test generik) yang mencegah ini terulang lagi, cuma dokumentasi
  (lessons-learned) sebagai pengingat.

## Ringkasan Hasil
Bug nyata yang dilaporkan client (Other Payment "Invalid field value
for field dateField1/dateField2") sudah diperbaiki — root cause cell
Excel bertipe Tanggal asli dibaca sebagai angka serial dan dikirim
mentah ke Accurate. Fix di-mirror ke Journal Voucher yang ternyata
punya bug identik (ditemukan proaktif, belum pernah dilaporkan). Semua
test pass (644, +5 baru), typecheck 0 error, security review bersih.
