# Fase 82 — Fix Guard Idempotent Saat Faktur Dihapus Langsung di Accurate (Sales Invoice & Purchase Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Evaluasi client (poin 3): "Ketika dihapus di Accurate, sementara sekarang
kita tidak bisa upload lagi karena nomor transaksi sama, karena di
database kita masih tersimpan." Ditemukan bahwa root cause-nya PERSIS
seperti dugaan: sistem memverifikasi "apakah faktur ini sudah pernah
dibuat" HANYA dari catatan lokal (`import_batch_rows` status "sukses"),
TANPA pernah verifikasi ulang ke Accurate SUNGGUHAN apakah faktur itu
masih ada.

## Riset & Verifikasi
Test call nyata (bukan tebakan) via environment local dev:
1. Buat Faktur Penjualan test (`TESDELETED01`) → sukses, id `102310`.
2. Hapus faktur itu LANGSUNG via `sales-invoice/delete.do` → sukses.
3. Panggil `sales-invoice/detail.do` dengan id yang sudah dihapus itu →
   **HTTP 200** (BUKAN 404!), body `{"s":false,"d":["Faktur Penjualan
   tidak tepat"]}`.

Temuan penting: HTTP status TIDAK BISA dipakai untuk mendeteksi "sudah
dihapus" (tetap 200) — cuma pesan **"tidak tepat"** yang reliable.

## Scope
- [x] `lib/accurate.ts` — fungsi baru `isAccurateRecordNotFound(err)`,
      cek `err instanceof AccurateApiError && message.includes("tidak tepat")`.
- [x] `lib/accurate.test.ts` — 4 test baru untuk fungsi ini.
- [x] `workers/index.ts`:
  - `appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice` —
    `getPurchaseInvoiceDetail`/`getSalesInvoiceDetail` dibungkus
    try/catch; kalau `isAccurateRecordNotFound(err)`, **fallback ke
    `processPurchaseInvoiceGroup`/`processSalesInvoiceGroup`** (jalur
    CREATE biasa) alih-alih gagalkan baris.
  - `findExistingAccurateInvoiceId`/`findExistingAccurateSalesInvoiceId`
    — ditambah `.orderBy(desc(importBatchRows.processedAt))` sebelum
    `.limit(1)` — kalau ADA lebih dari 1 baris "success" match (mis.
    setelah fallback CREATE di atas berhasil, sekarang ADA 2 baris
    "success" untuk Trans No yang sama: yang lama basi + yang baru),
    yang PALING BARU diproses yang dipakai, bukan sembarang tanpa
    urutan pasti.
- [x] Typecheck 0 error, full suite pass (507, +4 baru).
- [x] Dev DB dibersihkan (transaksi test `TESDELETED01` sudah dihapus
      sendiri sebagai bagian dari verifikasi).

## Referensi
- `lib/accurate-session.ts` § `openAccurateSession` — dipakai buat test
  call verifikasi.
- Evaluasi client 2026-09-09/10 (3 poin, poin 1-2 → Fase 81, poin 3 →
  fase ini).

## Keputusan Kecil Selama Eksekusi
- **Diterapkan ke KEDUA modul sekaligus** (Purchase Invoice DAN Sales
  Invoice) — client cuma laporin untuk Purchase Invoice, tapi struktur
  kodenya identik (`appendToExisting*` sama-sama panggil `getXxxDetail`
  tanpa verifikasi "masih ada apa tidak" sebelumnya) — Sales Invoice
  kemungkinan besar kena bug yang sama, cuma belum pernah dilaporkan.
- **Deteksi pakai pesan "tidak tepat" (substring, generik)** — bukan
  string exact-match "Faktur Penjualan tidak tepat" doang — supaya
  otomatis cover pesan modul lain ("Faktur Pembelian tidak tepat", dst)
  tanpa perlu daftar per-modul yang gampang ketinggalan kalau nanti ada
  modul baru pakai pola `appendToExisting*` yang sama.
- **`orderBy(desc(processedAt))` ditambahkan sebagai pencegahan sekunder**
  — bukan diminta eksplisit, tapi konsekuensi logis dari fix utama: kalau
  fallback CREATE berhasil, akan ADA 2 baris riwayat "success" untuk
  Trans No yang sama (lama basi + baru valid) — tanpa ORDER BY,
  `LIMIT 1` bisa ambil salah satu secara tidak pasti di retry berikutnya.
- **User eksplisit minta**: "jangan ambil apapun dari local ya, semua
  harus berdasarkan Accurate actual" — prinsip ini yang jadi dasar fix:
  keputusan "faktur masih ada atau tidak" SEKARANG selalu diverifikasi
  ke Accurate langsung (via `getXxxDetail`), DB lokal cuma dipakai untuk
  MENEMUKAN kandidat id yang mau dicek, bukan sumber kebenaran final.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint baru, query tetap
      pakai Drizzle `sql`/`orderBy` (parameter binding, bukan string
      concat). Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/lessons-learned.md` diupdate.

## Known Limitations
- Setelah fallback CREATE berhasil, riwayat lokal untuk Trans No itu
  PUNYA 2 baris "success" (lama basi + baru valid) selamanya — TIDAK
  dibersihkan/ditandai otomatis. `orderBy(desc(processedAt))` cukup
  mengatasi ini secara PRAKTIS (retry berikutnya akan ambil yang baru),
  tapi bukan pembersihan data yang sesungguhnya.
- `workers/index.ts` tidak punya test file sendiri (terlalu besar/butuh
  mock DB+HTTP) — verifikasi fase ini mengandalkan test call nyata ke
  Accurate + review kode manual, bukan unit test otomatis untuk
  `appendToExisting*` itu sendiri (cuma `isAccurateRecordNotFound`
  yang dites unit).

## Ringkasan Hasil
Guard idempotent (`appendToExistingPurchaseInvoice`/
`appendToExistingSalesInvoice`) sekarang verifikasi ke ACCURATE
SUNGGUHAN (bukan cuma percaya DB lokal) sebelum mencoba "tambah ke
faktur existing" — kalau faktur itu ternyata sudah dihapus manual di
Accurate (dikonfirmasi via pesan "tidak tepat", ditemukan lewat test
call nyata), sistem otomatis fallback bikin faktur baru alih-alih
gagal. `bun run typecheck` 0 error, `bun test` 507 pass/0 fail (4 baru).
