# Fase 189C — API Insight Pelanggan (read-only)

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Menyediakan data untuk 9 butir kebutuhan client FAC (Excel 10/10/2026) lewat endpoint admin read-only `/admin/insights/*`: ringkasan, daftar pelanggan + kontak, pengguna per fitur, akses per pelanggan, pelanggan baru, langganan akan berakhir, tren bulanan per tahun, rincian per usia langganan, riwayat koneksi lintas pelanggan, dan ekspor CSV. Halaman (189D) dan KPI dashboard (189E) hanya mengonsumsi API ini. Induk: `phase-189-insight-pelanggan-admin.md`; rancangan: `architecture-admin-insight.md` § 3, 5; definisi akun: `architecture-internal-accounts.md`; riwayat: `architecture-data-usaha-history.md`.

## Mode kerja
Banyak endpoint + rumus uang/retensi + data pribadi → eksekusi langsung bertahap (satu komit per kelompok endpoint), TDD, rumus MURNI di `lib/admin-insights.ts` (data sintetis) terpisah dari query DB (`lib/insights-data.ts`), security review subagent di akhir.

## Definisi baku (dipakai SEMUA endpoint; jangan ditafsir ulang)
- **Komersil**: `commercialCustomerIdsSubquery()` (role customer, bukan internal). Semua tren/uang/retensi KOMERSIL saja. Hitungan akun menampilkan komersil dan internal terpisah.
- **Pelanggan** (D1, default; divalidasi hasil SQL P3/P4 bila tersedia): **akun pemilik** (`data_usaha.user_id` SEKARANG, bukan pembeli awal `subscriptions.user_id` — transfer kepemilikan memindahkan penagihan, ADR-0032). Data Usaha menjadi anak. Akun User Tambahan terdaftar di daftar akun (D12) tetapi tidak dihitung "pelanggan berlangganan".
- **Langganan yang dihitung (fitur)**: `plans.kind='module'`, `is_trial=false`, status `active`/`expired` dengan `start_at` terisi. Langganan gratis hasil pemberian admin tetap dihitung sebagai berlangganan (dipakai), TIDAK dihitung sebagai uang. Seat bukan "fitur"; trial dipisah.
- **Aktif di bulan M** (zona waktu perusahaan): `start_at < akhir_M` dan (`end_at` kosong atau `end_at > awal_M`). Tanpa jeda toleransi status (§ 5.1 rencana induk). Pelanggan aktif bila punya ≥1 langganan yang dihitung aktif di M.
- **Pelanggan baru di M**: bulan `start_at` terawal semua langganan yang dihitung milik pemilik itu (D13: berbayar pertama, bukan tanggal daftar/trial).
- **Berhenti di M**: aktif di M−1 tetapi tidak aktif di M.
- **Usia (tahun ke-k)** di M: `k = floor(bulan_antara(awal_pertama, M) / 12) + 1`. Kolom tabel: **Baru** (awal pertama di M), **Lanjutan tahun ke-1**, **Tahun ke-2**, **ke-3**… + **Berhenti** + **Kembali** (aktif lagi setelah jeda). Jumlah kolom aktif = Baru + Lanjutan + Tahun ke-2.. (Kembali irisan, bukan tambahan).
- **Uang terbayar** (D3, D11): `invoices.status='paid'`, bulan dari `paid_at`, hanya akun KOMERSIL, jumlah `invoices.total` (tanpa kode unik). *Terverifikasi* = order metode `bank_transfer`/`qris` yang dikonfirmasi admin; *Dilunasi admin* = order metode `manual` (mode `paid_invoice`).
- **Riwayat koneksi**: peristiwa `connect_accurate`, `select_database`, `confirm_database`, `reset_database`, `disconnect_accurate`. **Koreksi** = `reset_database` atau `disconnect_accurate`.

## Endpoint (semua `GET`, izin `insights.view` = Super Admin & Admin)
| Endpoint | Ringkas |
|---|---|
| `/admin/insights/summary` | akun komersil/internal/nonaktif, Data Usaha (terhubung Accurate), pelanggan aktif & fitur aktif, akan berakhir 14/30 hari, uang bulan ini & tahun ini (terverifikasi/dilunasi admin) |
| `/admin/insights/customers?q&type&page` | akun customer (pemilik dan tambahan): kontak, tipe, jumlah Data Usaha, fitur aktif, berakhir terdekat, tanggal daftar |
| `/admin/insights/features` | tiap fitur: jumlah Data Usaha & pelanggan aktif |
| `/admin/insights/features/:moduleKey/customers?page` | pemakai satu fitur: pemilik + kontak + Data Usaha + masa berlaku |
| `/admin/insights/customers/:userId/access` | per Data Usaha milik pelanggan: slot User Tambahan |
| `/admin/insights/new?from&to&page` | langganan dimulai dalam rentang (maks 24 bulan), dikelompokkan per pemilik; penanda pelanggan baru |
| `/admin/insights/expiring?window=14\|30&page` | langganan berakhir dalam jendela, per pemilik; status tagihan perpanjangan (`tidak_terjadwal` · `terjadwal` · `terbit`) |
| `/admin/insights/trend?year&metric` | 12 bulan: nilai, bulan sebelumnya, selisih, %; metrik `registered` · `active` · `new` · `stopped` · `money` |
| `/admin/insights/tenure?month=YYYY-MM` | rincian menurut usia langganan di bulan itu |
| `/admin/insights/connection-history?q&kind&from&to&page` | peristiwa koneksi lintas pelanggan + ringkasan koreksi |
| `/admin/insights/export/:report` | CSV (D5: unduh langsung ≤ 10.000 baris, dicatat di audit) |

## Scope
**Fondasi**
- [ ] F1 Izin `insights.view` via migrasi data idempoten (production tidak menjalankan seed) + `db/seed.ts`; indeks `audit_logs(entity_type, action, created_at)` (migrasi).
- [ ] F2 `lib/admin-insights.ts` (rumus murni + CSV) + tes data sintetis; `lib/insights-data.ts` (query); `routes/admin/insights.route.ts` terdaftar di `app.ts`.
**Endpoint (komit per kelompok, tes DB dengan pola delta/scoping per pelanggan uji karena DB dev dipakai bersama)**
- [ ] E1 `summary`, `customers`, `customers/:userId/access` (+ ekstraksi query seat bersama)
- [ ] E2 `features`, `features/:moduleKey/customers`
- [ ] E3 `new`, `expiring`
- [ ] E4 `trend`, `tenure`
- [ ] E5 `connection-history`
- [ ] E6 `export/:report` + audit ekspor + perlindungan CSV injection
**Penutup**
- [ ] P1 Tes izin (401/403/200 untuk admin & staf), validasi query, tanpa N+1 berbahaya; security review subagent; dokumen API (`architecture-admin-insight.md` § 5, `architecture-insights-api.md`); PROGRESS.

## Di luar scope
Halaman UI (189D), KPI dashboard (189E), aksi massal hapus/anonimisasi (189H), grafik. Event `accept_seat`/`resend_seat` (celah audit 189B) — dicatat bila perlu laporan.

## Keamanan (untuk review penutup)
Data pribadi (email/telepon/perusahaan) hanya untuk `insights.view`; tidak masuk log; ekspor CSV mencatat audit dan menetralkan sel berawalan `= + - @`; batas baris dan rentang tanggal (DoS); parameter tervalidasi; tidak ada `sql` mentah dengan input; hitungan komersil WAJIB lewat helper (bukan menebak role).

## Referensi
- `architecture-admin-insight.md` § 3, 5, 9 (D1, D3, D5, D6, D11–D13, D19); `architecture-internal-accounts.md`; `architecture-data-usaha-history.md`; `architecture-admin-dashboard.md` (pola `stats`/`lib/admin-stats.ts`)

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review (subagent `security-auditor`)
- [ ] Temuan Critical/High diperbaiki; Medium/Low diperbaiki atau dicatat
- [ ] Dokumen; PROGRESS/phase 189 diupdate

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
