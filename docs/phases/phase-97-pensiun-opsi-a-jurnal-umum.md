# Fase 97 — Pensiunkan Opsi A (Format Lebar) Jurnal Umum

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Client kirim template final Jurnal Umum (`CLIENT_template-jurnal-umum-v2.xlsx`,
26 kolom) dan minta "isinya ini saja" (hapus kolom/alias yang double).
Template ini pakai nama kolom "Nominal Debit"/"Nominal Kredit" — yang
SUDAH dipakai Opsi A (format lebar, 2-akun sederhana, Fase 35) untuk
field `debitAmount`/`creditAmount`. Tabrakan nama ini bikin upload
client GAGAL dengan error "lineDebitAmount dan lineCreditAmount wajib"
— kolom yang dimaksud user ("Nominal Debit"/"Nominal Kredit") malah
auto-ter-mapping ke field Opsi A yang salah, bukan field Opsi B
(`lineDebitAmount`/`lineCreditAmount`) yang sebenarnya dibutuhkan.

Daripada invent nama kolom baru untuk Opsi B supaya tidak tabrakan,
Opsi A DIPENSIUNKAN TOTAL (konfirmasi eksplisit user via
AskUserQuestion: "Ya, pensiunkan Opsi A") — client 3 template
berturut-turut (v3, v4.1, final) SELALU pakai grouping N-akun (Opsi B),
TIDAK PERNAH pakai format lebar 2-akun, dan modul ini belum punya
customer produksi nyata sama sekali (§ [[feedback_dev_stage_no_real_customers]]).

## Scope
- [x] `journal-voucher.mapping.ts` — hapus total Opsi A (`buildJournalVoucherPayload`
      lama, `requiredFieldsTall`, `formatOf`, `requiredFieldsFor`); satu
      format saja sekarang. `buildJournalVoucherPayloadTall` → rename jadi
      `buildJournalVoucherPayload` (satu-satunya builder).
- [x] `defaultColumnMap` disederhanakan PERSIS 26 kolom template client,
      tanpa alias ganda ("JV No"/"JV Rate"/dst dihapus).
- [x] `workers/index.ts` — hapus dispatch Opsi A di `processImportRow`,
      hapus format-detection conditional di dispatch loop utama
      (journal_voucher sekarang unconditional masuk grouping).
- [x] `journal-voucher-import.route.ts` — hapus format detection di
      endpoint confirm/edit-row/bulk-edit-row, pakai
      `journalVoucherMapping.requiredFields` langsung + `debitCreditRowError`
      terpisah untuk validasi XOR debit/kredit per baris.
- [x] `template-guide.ts` — `journalVoucherTemplateGuide` ditulis ulang
      jadi 26 entri flat (tanpa label `[FORMAT LEBAR]`/`[FORMAT PANJANG]`).
- [x] `edit-row-dialog.tsx` (frontend) — hapus `isTallFormat()`/
      `REQUIRED_INTERNAL_FIELDS_TALL`, satu `REQUIRED_INTERNAL_FIELDS`.
      Sekaligus fix bug laten: `validateRequired()` client-side sekarang
      XOR-aware untuk `lineDebitAmount`/`lineCreditAmount` (sebelumnya
      akan salah tandai KEDUA kolom sebagai "wajib diisi" untuk baris
      satu-sisi, meski belum pernah ketahuan user karena Opsi A/B
      campur-aduk menutupi symptom-nya).
- [x] `import/page.tsx` & `import/[batchId]/page.tsx` (frontend) — hapus
      dropdown Opsi A, simplifikasi deskripsi halaman.
- [x] Test: rewrite total `journal-voucher.mapping.test.ts` (hapus semua
      test Opsi A, tambah `describe("debitCreditRowError")`), fix semua
      referensi kolom basi di `journal-voucher-import.route.test.ts`
      (test "format LEBAR" dihapus karena Opsi A sudah tidak ada).

## Referensi
- Architecture doc: `docs/architecture/architecture-journal-voucher.md`
- Fase sebelumnya: `docs/phases/phase-95-ekspansi-field-jurnal-umum-opsi-b.md`
  (Fase 35 = Opsi A awal, Fase 50 = Opsi B ditambahkan, Fase 95 = redesain
  kolom Debit/Kredit Opsi B)

## Keputusan Kecil Selama Eksekusi
- Nama fungsi `debitCreditRowError`/`debitCreditOf` (dari Fase 95)
  DIPERTAHANKAN apa adanya — logic-nya tidak berubah, cuma dipanggil
  dari satu jalur sekarang (tidak ada lagi cabang Opsi A yang harus
  dihindari).
- Komentar "§ RIWAYAT" di awal `journal-voucher.mapping.ts` SENGAJA
  dipertahankan (bukan dihapus) — mendokumentasikan kronologi Fase
  35→50→95→97 supaya developer berikutnya paham kenapa nama kolom
  "Nominal Debit"/"Nominal Kredit" terasa "baru dipakai lagi" padahal
  sudah ada sejak Fase 35 (untuk konsep yang beda).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada temuan.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada yang perlu dicatat.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite: 593 pass / 0 fail.
- [x] `apps/web` test suite: 50 pass / 0 fail.
- [x] `bun run lint` — 0 error.

## Known Limitations
- Kolom-kolom opsional baru dari Fase 95 (rate/primeAmount/dst) TIDAK
  diuji ulang dengan test call nyata di fase ini — fase ini cuma
  mengubah STRUKTUR mapping (satu format, bukan dua), bukan isi
  field-nya, jadi asumsi keamanannya sama dengan yang sudah dikonfirmasi
  Fase 95.
- Opsi A dihapus PERMANEN (bukan deprecated/hidden) — kalau ternyata ada
  kebutuhan format lebar 2-akun sederhana di masa depan, harus dibangun
  ulang dari nol (bukan di-restore), karena projectnya memang belum
  punya customer produksi yang bisa terdampak saat ini.

## Ringkasan Hasil
Opsi A (format lebar Jurnal Umum) dipensiunkan total. Modul ini sekarang
SATU format saja — grouping N-akun via "Transaction Number", kolom
"Nominal Debit"/"Nominal Kredit" (dulu milik Opsi A) sekarang jadi nama
kanonik Opsi B, PERSIS 26 kolom template final client tanpa alias
ganda. Root cause bug upload client (kolom "Nominal Debit"/"Nominal
Kredit" ter-mapping ke field Opsi A yang salah) otomatis hilang karena
Opsi A tidak ada lagi — tidak ada lagi 2 field yang bisa berebut 1 nama
kolom. Sekaligus memperbaiki bug laten validasi client-side yang belum
XOR-aware untuk debit/kredit. Semua test (api 593, web 50) pass,
typecheck 0 error, security review bersih.
