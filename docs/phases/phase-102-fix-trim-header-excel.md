# Fase 102 — Fix Trim Header Excel di `parseExcelBuffer` (Bug Generik Lintas Modul)

**Status:** Done (kode, sudah di-push ke `develop`) — **BELUM di-release/deploy**, user eksplisit minta review dulu sebelum lanjut ke `main`
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Client retest Purchase Payment (setelah Fase 100 mirror fix PPh) dapat
error Accurate: *"Nilai Pembayaran tidak mencukupi untuk melunasi
pembayaran!"* — awalnya dikira terkait fitur Tax/PPh yang baru
ditambahkan (Fase 100), TAPI hasil investigasi mendalam (query
langsung ke `import_batches`/`import_batch_rows` production via
user) menemukan root cause SAMA SEKALI TIDAK TERKAIT Tax — ini bug
GENERIK di `parseExcelBuffer` yang memengaruhi SEMUA modul import.

## Root Cause
`raw_data` baris yang gagal menunjukkan key `" Payment "` (dengan
spasi di depan DAN belakang), padahal `columnMapping` batch itu
memetakan `"Payment": "chequeAmount"` (nama TRIMMED, tanpa spasi).

`apps/api/src/lib/excel.ts` § `parseExcelBuffer`:
- `headers` (dipakai UI "Cocokkan Kolom" & disimpan sebagai
  `columnMapping`) SUDAH di-trim: `headerRow.map((h) => String(h ?? "").trim())`.
- `rows` (data aktual tiap baris) TIDAK di-trim — pakai key APA ADANYA
  dari `XLSX.utils.sheet_to_json`, yaitu literal header cell Excel
  (kalau ada spasi nyempil, key-nya ikut ada spasi).

Akibatnya: `buildPurchasePaymentPayload` mencari `rawRow["Payment"]`
(trimmed, dari `columnMapping`), tapi `rawRow` aktual cuma punya key
`" Payment "` (mentah) — lookup GAGAL, balik `undefined`, `Number(undefined ?? 0)`
= `0`. Nominal pembayaran Rp 100.000 di Excel jadi terkirim sebagai
Rp 0 ke Accurate — WAJAR Accurate menolak "Nilai Pembayaran tidak
mencukupi", karena memang benar tidak cukup (Rp 0 vs tagihan invoice).

**Field Tax/PPh (Fase 100) BELUM SEMPAT teruji sama sekali** di batch
ini — error terjadi di validasi saldo pembayaran, SEBELUM Accurate
sempat evaluasi bagian PPh apa pun.

## Scope
- [x] `apps/api/src/lib/excel.ts` § `parseExcelBuffer` — key object
      tiap baris SEKARANG di-trim juga, konsisten dengan `headers`.
- [x] Test baru: `apps/api/src/lib/excel.test.ts` (4 test — header
      dengan spasi nyempil, tanpa spasi/zero-regression, multi-baris
      dengan `defval`, dan verifikasi eksplisit key lama TIDAK ada lagi).
- [x] Update `docs/architecture/architecture-accurate-integration.md`
      § "3. Import Mapping" (catatan bug generik).
- [x] Update `docs/lessons-learned.md`.
- [x] Commit + push ke `develop` (user review diagnosis+diff dulu, baru
      eksplisit minta "commit dan push ke develop dulu").
- [ ] **BELUM release ke `main`/deploy** — menunggu instruksi lanjut
      dari user.

## Referensi
- `docs/lessons-learned.md` entri 2026-09-11 "Excel serial..." (Fase
  101, bug KELAS SERUPA — sama-sama soal `parseExcelBuffer`/parsing
  Excel, ditemukan di sesi yang sama)
- Diagnosis awal via query production: `import_batches`/`import_batch_rows`
  untuk batch `b7958f93-c02e-4eeb-85ad-b04f13da3b77` (module
  `purchase_payment`), dijalankan user via `docker exec` read-only SELECT

## Keputusan Kecil Selama Eksekusi
- Diagnosis dilakukan LANGSUNG ke data production (read-only SELECT,
  dijalankan USER sendiri via `docker exec`, bukan Claude SSH langsung
  — konsisten `feedback_deploy_and_prod_debug_style` memory) SEBELUM
  menyimpulkan root cause — tidak menebak dari deskripsi error semata.
- Fix diterapkan di `parseExcelBuffer` (satu tempat, shared oleh SEMUA
  route `*-import.route.ts`) — BUKAN di masing-masing mapping file
  (yang akan butuh 7× perbaikan terpisah dan rawan lupa 1 modul).
- **SENGAJA TIDAK langsung commit/push/release** — instruksi eksplisit
  user setelah insiden gap timing release v1.27.1 sebelumnya: cek
  seksama dulu, jangan buru-buru rilis.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada
      temuan (termasuk analisis prototype-pollution teoretis dari key
      dinamis — dikonfirmasi bukan regresi baru, sudah ada risikonya
      di kode lama `sheet_to_json` sendiri).
- [x] `apps/api` test suite: 647 pass / 0 fail (4 test baru).
- [x] `bun run lint` — 0 error.
- [x] `docs/PROGRESS.md` diupdate.
- [x] Commit + push ke `develop`.
- [ ] PR ke `main` / release — **DITAHAN**, menunggu konfirmasi user.

## Known Limitations
- Fix ini menyelesaikan masalah "nilai hilang karena spasi nyempil di
  header", TAPI belum memverifikasi apakah fitur Tax/PPh (Fase 99/100)
  benar-benar berfungsi di Purchase Payment — client perlu retest LAGI
  dari awal (upload file yang sama atau baru) SETELAH fix ini deploy,
  untuk benar-benar menguji jalur Tax yang tadinya tidak pernah
  tercapai.
- Tidak ada validasi/warning proaktif di UI kalau user upload Excel
  dengan header ber-spasi nyempil — fix ini membuatnya BEKERJA BENAR
  (auto-trim), tapi user tidak diberi tahu bahwa header mereka
  sebenarnya "kotor" — dianggap cukup (silent-fix lebih baik daripada
  silent-fail), tidak perlu UI tambahan untuk kasus ini.

## Ringkasan Hasil
Bug generik ditemukan di `parseExcelBuffer` (dipakai SEMUA 7 modul
import) — header Excel dengan spasi nyempil bikin nilai kolom hilang
diam-diam (jadi 0/kosong) karena key row tidak konsisten dengan key
`columnMapping` yang sudah di-trim. Ditemukan lewat investigasi
mendalam laporan client Purchase Payment yang AWALNYA dikira bug Tax,
TERNYATA tidak terkait sama sekali. Fix di satu titik (`parseExcelBuffer`)
menyelesaikan untuk semua modul sekaligus. Semua test pass (647, +4
baru), typecheck 0 error, security review bersih. User review diagnosis
+ diff dulu sebelum eksplisit minta commit+push ke `develop`. **Belum
di-release ke `main`/deploy** — menunggu instruksi lanjut.
