# Fase 128 — Modul Other Deposit (Penerimaan Bank/Kas)

**Status:** Done
**Mulai:** 2026-09-16
**Selesai:** 2026-09-16

## Tujuan
Client kirim 5 sheet fitur baru di Excel (`developmen-15-september-2026.xlsx`):
Other Deposit, Sales Order, Item Requisition, Item Transfer, Inventory
Adjustment. Dicek dulu isinya — **4 dari 5 sheet TERNYATA KOSONG TOTAL**
(tab ada, 0 kolom/screenshot, dikonfirmasi sampai level XML mentah file,
bukan cuma "belum kebaca"). Cuma "Othe Deposit" (typo client, kurang
huruf "r") yang siap dikerjakan. User setuju: kerjakan Other Deposit
dulu, 4 modul lain nunggu client isi.

## Scope
- [x] Modul import Other Deposit ke Accurate Online (kebalikan Other
      Payment — penerimaan, bukan pengeluaran), kategori "Cash & Bank".
- [x] Riset field diverifikasi ULANG ke `accurate-openapi.json` (bukan
      asumsi struktur identik Other Payment tanpa cek).
- [x] Sekalian backfill 3 titik registrasi modul yang ketahuan KELEWAT
      untuk 5 modul Fase 120-124 (§ architecture doc § "Gap Registrasi").

## Referensi
- Architecture doc: `docs/architecture/architecture-other-deposit.md`
- Precedent: `docs/architecture/architecture-other-payment.md`

## Keputusan Kecil Selama Eksekusi
- **4/5 sheet Excel kosong** — dikonfirmasi ke user SEBELUM mulai riset
  mendalam (bukan asumsi "belum sempat baca"), user setuju scope
  dipersempit jadi 1 modul saja hari ini.
- **Kolom "Expense Name"** — gap SAMA seperti Other Payment (field API
  `expenseName` wajib, tidak ada di sheet client) — solusi SAMA (kolom
  baru), TAPI diverifikasi ULANG ke OpenAPI spec dulu (bukan diwariskan
  buta dari precedent), lihat § architecture doc.
- **3 file registrasi modul ditemukan KELEWAT untuk 5 modul Fase
  120-124** (`module-import-routes.ts`, `import-batch-table.tsx`,
  admin `[batchId]/page.tsx`) — diperbaiki SEKALIAN (backfill 5 modul
  lama + `other_deposit` baru), bukan ditunda jadi fase terpisah, karena
  ketemu langsung saat nambah entri modul baru ke file yang sama.
- Icon `other_deposit` sengaja BEDA dari `other_payment` (Coins vs
  Banknote) — sama-sama kategori Cash & Bank tapi arah transaksi beda,
  perlu bisa dibedakan sekilas di sidebar/landing.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] `bun run test` — 1105 pass, 0 fail (38 test baru: mapping + route)
- [x] Security review dijalankan — 0 temuan (lihat ringkasan di bawah)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Sales Order, Item Requisition, Item Transfer, Inventory Adjustment —
  BELUM dikerjakan, sheet Excel-nya masih kosong. Lanjut begitu client
  isi field-nya.
- Gap registrasi 3-file yang dibackfill di fase ini HANYA yang ketahuan
  lewat `grep "other_payment"` — kalau ternyata ada titik registrasi
  LAIN yang juga kelewat (belum ketemu), belum tercakup.

## Ringkasan Hasil
Modul Other Deposit selesai dibangun, mirror struktural Other Payment
(diverifikasi ulang ke OpenAPI, bukan disalin buta) — grouping by Trans
No, gap field yang sama (Expense Name kolom baru, Project No/Atribut
Tambahan/Number/Tanggal belum diverifikasi end-to-end). Sekalian
ditemukan dan diperbaiki gap registrasi 5 modul Fase 120-124 di 3 file
"daftar semua modul" yang kelewat sejak awal (Arsip Import gabungan
tidak punya link Detail/tombol Delete, admin detail batch kosong tanpa
tabel) — sekarang konsisten penuh untuk 13 modul aktif Facport.

Security review: 0 temuan (endpoint baru mirror pola yang sudah
diverifikasi aman di Other Payment/12 modul lain — auth guard,
ownership check DELETE_OWNER_ONLY, validasi Elysia schema, tidak ada
raw SQL/secret baru).
