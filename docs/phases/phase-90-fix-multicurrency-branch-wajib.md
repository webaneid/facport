# Fase 90 — Koreksi via Test Call Nyata: Branch Wajib & Bug Auto-SUM Multi-Currency

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Setelah Fase 89 (ekspansi field Purchase Payment) selesai dan lolos
typecheck/unit test, user minta **test call NYATA ke Accurate** dulu
sebelum push — bukan cuma andalkan unit test. Test ini langsung
menemukan 2 hal yang TIDAK MUNGKIN ketahuan dari spec/unit test saja,
berlaku di KEDUA modul (Purchase Payment & Sales Receipt, pola desain
identik).

## Scope
- [x] Setup environment test: subscription+koneksi Accurate BARU untuk
      Purchase Payment (koneksi lama Fase 86 Sales Receipt sudah mati —
      access token & refresh token SAMA-SAMA di-revoke Accurate)
- [x] Test call nyata bertahap ke `purchase-payment/save.do` dengan
      data vendor/faktur ASLI dari user (vendor "ASMUS" `VJKT-0003`
      mata uang SGD, faktur "CONTOH1" terhutang 1 SGD)
- [x] Diagnosis 2 error berbeda dari Accurate, temukan akar masalah
      masing-masing
- [x] Fix di `sales-receipt.mapping.ts` DAN `purchase-payment.mapping.ts`
      sekaligus (bug sama, desain identik)
- [x] Update fixture test route yang existing (butuh kolom Branch baru)
- [x] Test baru untuk kedua fix

## Kronologi Test Call
1. **Test 1** (field dasar saja) → **GAGAL**: *"Profil pengguna anda
   memiliki akses ke lebih dari satu cabang. Anda harus menentukan
   cabang saat penulisan data."*
2. **Test 2** (+ `branchName: "Jakarta"`, tanpa currency/rate) →
   **GAGAL BEDA**: *"Total Debit dan Kredit tidak cocok sebesar
   12,599.000001, saat melakukan jurnal: Hutang Usaha Jakarta - SGD
   (12,600.000001), Bank BCA IDR Jakarta (069-773-3993) (-1)"*
3. **Test 3** (+ `currencyCode: "SGD"`, `rate: 12600.000001`, DAN
   "Cheque Amount" eksplisit override = `12600.000001`) → **BERHASIL**
   (`111.102-01.2026.09.00001`, invoice CONTOH1 jadi PAID).

## Temuan & Perbaikan

**Temuan 1 — Branch WAJIB untuk company multi-cabang.**
Spec resmi (OpenAPI) menandai `branchName` opsional di level TIPE DATA
— tapi Accurate punya validasi RUNTIME/BUSINESS-LOGIC terpisah yang
MEWAJIBKANNYA untuk company dengan akses multi-cabang. Kompetitor
("WAJIB") dan screenshot UI ("Cabang*") yang di Fase 85/89 dianggap
"kontradiksi dengan spec, ikuti spec saja" TERNYATA benar dari sudut
pandang yang berbeda (validasi API vs validasi bisnis Accurate).
**Fix**: `branchName` ditambahkan ke `requiredFields` di KEDUA modul
(bukan cuma kondisional — client company 1-cabang cukup isi 1x, client
multi-cabang tidak pernah kena error membingungkan ini di tengah
proses import besar).

**Temuan 2 — Bug auto-SUM `chequeAmount` untuk mata uang asing.**
Root `chequeAmount` HARUS dalam mata uang BANK (basis perusahaan),
SEDANGKAN `detailInvoice[].paymentAmount` (dari kolom Excel "Payment"/
"Jumlah Bayar") tetap dalam mata uang FAKTUR ASLI. Desain auto-SUM
SEBELUMNYA (Fase 49/50/85/89) menjumlahkan `paymentAmount` POLOS tanpa
konversi — kebetulan benar untuk transaksi mata uang DASAR (rate
implisit 1, kasus PALING UMUM), TAPI SALAH TOTAL untuk mata uang asing
(mengirim "1" padahal seharusnya "12600.000001", picu error debit/
kredit tidak seimbang). **Fix**: `autoSummedChequeAmount = SUM(paymentAmount) × (rate ?? 1)`
— kalau `rate` tidak diisi, kali 1 (ZERO REGRESSION untuk mayoritas
transaksi mata uang dasar). "Cheque Amount" eksplisit (kalau diisi
user) TETAP TIDAK ikut dikalikan — itu murni keputusan/kontrol user.

## Kenapa Ini Tidak Ketahuan dari Unit Test/Spec Saja
Unit test Fase 85/89 semuanya pakai skenario mata uang dasar (rate
kalau diisi cuma untuk cek presisi desimal, bukan dampaknya ke
`chequeAmount`). Spec resmi Accurate mendokumentasikan `paymentAmount`,
`chequeAmount`, dan `rate` secara INDEPENDEN — tidak ada dokumentasi
eksplisit soal hubungan ketiganya. **Hanya test call sungguhan dengan
transaksi mata uang asing NYATA yang bisa menemukan bug ini** — alasan
kuat kenapa instruksi eksplisit user ("mau coba dulu di local untuk
tau respons ketika data dikirim ke accurate beneran sebelum kt push?")
sangat tepat, bukan formalitas.

## File yang Diubah
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` — auto-SUM
  × `rate`, `branchName` → `requiredFields`.
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts` — sama.
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.test.ts`,
  `purchase-payment.mapping.test.ts` — 3 test baru per file.
- `apps/api/src/lib/import-mapping/template-guide.ts` — Branch
  `required: true` di kedua template guide.
- `apps/api/src/routes/sales-receipt-import.route.test.ts`,
  `purchase-payment-import.route.test.ts` — 4 fixture existing
  diupdate (tambah kolom Branch, kalau tidak tes gagal karena field
  baru wajib).
- `apps/web/components/sales-receipt/edit-row-dialog.tsx`,
  `purchase-payment/edit-row-dialog.tsx` — `branchName` →
  `REQUIRED_INTERNAL_FIELDS`.
- `apps/web/app/app/(protected)/sales-receipt/import/page.tsx`,
  `purchase-payment/import/page.tsx` — label dropdown Branch "(wajib)".
- `docs/architecture/architecture-purchase-payment.md`,
  `architecture-sales-receipt.md` — section Fase 90 + koreksi tabel
  keputusan Branch.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode (2 fix, 2 modul).
- [x] Test baru (6 test — 3 per modul: rate dikalikan, rate kosong=kali
      1, Cheque Amount eksplisit tidak ikut dikalikan).
- [x] Fixture test route existing diupdate (4 test yang sempat gagal
      karena Branch jadi wajib, sekarang pass lagi).
- [x] Type check nol error (`bun run typecheck`).
- [x] **Test call NYATA ke Accurate** — BERHASIL, transaksi tersimpan
      sungguhan (`111.102-01.2026.09.00001`).
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- Test nyata baru dilakukan untuk Purchase Payment (vendor SGD) — fix
  yang sama di Sales Receipt BELUM di-test-call nyata secara terpisah
  (logic identik, confidence tinggi, tapi belum ada verifikasi lapangan
  khusus modul itu).
- Kemungkinan field lain juga punya validasi RUNTIME serupa (Branch)
  yang tidak tercermin di spec OpenAPI statis — belum ada cara
  sistematis mendeteksi ini selain test call nyata per kasus.

## Ringkasan Hasil
Test call nyata (diminta eksplisit user sebelum push) menemukan 2 bug
yang TIDAK mungkin ketahuan dari unit test/spec saja: (1) Branch
ternyata wajib secara runtime untuk company multi-cabang meski spec
schema bilang opsional, (2) auto-SUM `chequeAmount` salah untuk
transaksi mata uang asing karena tidak dikalikan `rate`. Keduanya
diperbaiki di Purchase Payment DAN Sales Receipt sekaligus (bug sama,
desain identik). Transaksi test akhirnya BERHASIL tersimpan di Accurate
sungguhan. `bun run typecheck` 0 error, test baru 6 (3 per modul) +
4 fixture existing diperbaiki, semua pass.
