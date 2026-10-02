# Fase 168 — AutoProduksi: Formula Lintas-Cabang + Toggle Aktif/Non-aktif

**Status:** Done
**Mulai:** 2026-10-02
**Selesai:** 2026-10-02

## Tujuan
Formula (resep BOM) AutoProduksi sebelumnya punya Cabang/Gudang Barang Jadi/
Gudang Bahan Baku melekat ke resepnya sendiri — customer dengan banyak cabang
terpaksa bikin 1 Formula terpisah per cabang padahal resepnya identik. Fase
ini memindahkan Cabang/Gudang Barang Jadi/Gudang Bahan Baku/Nomor Project/
Departemen dari Formula ke Input Produksi (jadi KONTEKS tiap kali produksi
dijalankan, bukan bagian resep) — 1 Formula sekarang bisa dipakai lintas
cabang. Fase ini juga menambahkan toggle Aktif/Non-aktif per Formula (non-
aktif = tidak bisa dipilih untuk Input Produksi baru, tapi tetap tersimpan
sebagai dokumentasi).

## Scope
- [x] Schema: drop branchName/warehouseName/finishedGoodProjectNo/
      finishedGoodDepartmentName dari `autoproduksi_formulas`, drop
      warehouseName/projectNo/departmentName dari `autoproduksi_formula_items`,
      tambah `isActive` ke `autoproduksi_formulas`, tambah branchName/
      warehouseName/rawMaterialWarehouseName/projectNo/departmentName
      (nullable) ke `autoproduksi_production_entries`.
- [x] `buildProductionEntryPayload` — ambil branchName/warehouse/project/dept
      dari entry (bukan formula lagi), unitCost tetap dari formula.standardCost.
- [x] Backend route: formulaBodySchema disederhanakan + isActive, endpoint
      PATCH toggle aktif baru, POST production-entries body diperluas +
      guard formula non-aktif ditolak.
- [x] Worker: Import Produksi menolak formula non-aktif, teruskan field baru
      ke payload builder & insert DB.
- [x] Import mapping Formula: hapus kolom Cabang/Gudang/Project/Departemen.
- [x] Import mapping Produksi: tambah kolom opsional Cabang/Gudang Barang
      Jadi/Gudang Bahan Baku/Proyek/Departemen + validasi panjang.
- [x] Template guide kedua modul diupdate.
- [x] Frontend: ekstrak `SearchableField`/`searchAccurateWarehouses` jadi
      shared, form Formula disederhanakan + toggle aktif + filter status,
      form Input Produksi (manual) dapat 5 field baru, halaman Excel import
      kedua modul diupdate daftar field.
- [x] Dokumentasi: architecture-autoproduksi.md, PROGRESS.md.

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md`
- Fase sebelumnya: `docs/phases/phase-166-autoproduksi-import-formula-produksi.md`

## Keputusan Kecil Selama Eksekusi
- Nomor Project & Departemen ikut pindah ke Input Produksi bersama Cabang/
  Gudang (dikonfirmasi user eksplisit — bukan cuma Proyek yang disebut
  client, Departemen diperlakukan sama).
- Gudang Bahan Baku di Input Produksi SATU field berlaku ke SEMUA baris
  Bahan Baku dalam 1x produksi (bukan per-item lagi seperti di Formula
  lama) — sesuai literal permintaan client ("Pilih gudang bahan baku").
- Toggle Aktif/Non-aktif pakai endpoint PATCH khusus (1 kolom), bukan lewat
  PUT penuh — supaya UI List Formula tidak perlu kirim ulang seluruh
  Formula+items cuma untuk flip boolean.
- Cabang di Input Produksi tetap `<Input>` manual (bukan Combobox search
  Accurate) — Accurate tidak punya endpoint search Cabang yang relevan,
  konsisten pola lama di Formula.
- Laporan client soal `standardCost` tidak terkirim sebagai `unitCost` ke
  Accurate — dikonfirmasi user itu laporan DARI SEBELUM rilis v2.21.0 hari
  ini (yang sudah berisi fix-nya, commit `1c2af57`). Tidak ada bug baru;
  logic ini dipertahankan apa adanya di payload builder yang dirombak fase
  ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api & web
- [x] Security review dijalankan (skill `security-review`) — fokus endpoint
      PATCH toggle baru, body schema baru POST production-entries, guard
      isActive (route + worker)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Worker-level guard `isActive` di `processAutoproduksiProductionImportRow`
  (Import Produksi Excel) divalidasi via code review saja, bukan test
  otomatis terisolasi — konsisten dengan 2 cabang error LAIN di fungsi
  yang sama (0 match/2+ match nama Formula) yang juga belum punya test
  langsung (fungsi ini butuh koneksi Accurate nyata/mock untuk dites
  end-to-end, di luar scope fase ini untuk membangun harness barunya).
- Tidak ada backfill/migrasi data historis — Formula lama kehilangan nilai
  Cabang/Gudang/Project/Departemen yang pernah tersimpan (kolom DROP,
  bukan dipindah) karena field itu sudah tidak dipakai di mana pun lagi;
  Input Produksi/Import Produksi yang lama (`autoproduksi_production_entries`
  sebelum fase ini) juga TIDAK di-backfill field barunya (tetap null,
  konsisten — sudah selesai diproses, tidak perlu konteks produksi lagi).

## Ringkasan Hasil (isi pas fase Done)
Cabang/Gudang Barang Jadi/Gudang Bahan Baku/Nomor Project/Departemen
dipindah total dari Formula ke Input Produksi (manual + Excel), semua
opsional — 1 Formula sekarang bisa dipakai lintas cabang/gudang. Gudang
Bahan Baku & Proyek/Departemen jadi 1 pilihan per transaksi produksi
(bukan per-Bahan-Baku lagi). Toggle Aktif/Non-aktif baru di List Formula
(`PATCH /autoproduksi/formulas/:id/active`) — non-aktif ditolak 409 di
endpoint manual dan pesan jelas di worker Excel, tapi tetap tampil di
List Formula untuk dokumentasi. `buildProductionEntryPayload()` dirombak
mengambil konteks dari `entry` bukan `formula`; fix `unitCost` dari Fase
166 dipertahankan tanpa perubahan logic.

Typecheck 0 error (api+web). API: 1856 pass/0 fail (termasuk test baru:
toggle endpoint, formula tanpa Cabang tetap sukses, field konteks produksi
baru tersimpan, formula non-aktif ditolak 409, validasi panjang kolom
baru di mapping Excel). Web: lint bersih, 305 pass/0 fail (termasuk
`filter-formulas.test.ts` yang diperbarui ke filter Status). Security
review: 0 temuan Critical/High/Medium/Low — perubahan mekanis (hapus/
pindah field + 1 endpoint toggle sederhana), bukan attack-surface baru.

**Belum push ke `develop`** — mengikuti instruksi aktif user sesi ini
("jgn push dulu ke develope, ini sampai saya katakan kita push ke
develope"), commit lokal saja.
