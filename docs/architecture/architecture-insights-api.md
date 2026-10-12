# Architecture — API Insight Pelanggan (`/admin/insights/*`)

> Fase 189C. API READ-ONLY untuk halaman Insight (189D) dan KPI dashboard (189E). Rancangan induk & kebutuhan client: `architecture-admin-insight.md`; definisi akun:
> `architecture-internal-accounts.md`; riwayat koneksi/akses: `architecture-data-usaha-history.md`. Kode: `apps/api/src/routes/admin/insights.route.ts`,
> `lib/insights-data.ts` (query), `lib/admin-insights.ts` (rumus MURNI), `lib/insights-export.ts` (CSV murni). Tes: `routes/admin/insights.route.test.ts`.

## Izin & data pribadi
- **Ekspor**: kuota PER AKUN 30/jam (dari `audit_logs`, → 429 `EXPORT_QUOTA_EXCEEDED`) selain rate limit IP 10/menit. Audit menyimpan `hasQ`/`qLength`, BUKAN teks pencarian (bisa berisi email/nama).
- `connection-history` memproyeksikan `changes` lewat WHITELIST (`projectConnectionChanges`): id internal koneksi dan daftar Data Usaha terdampak tidak ikut; kolom baru di masa depan tidak bocor otomatis.
- `page` ≤ 2.000 (OFFSET ≤ 200.000); `/customers/:userId/access` hanya akun customer.
- SEMUA endpoint: `insights.view` (Super Admin `admin` dan Admin `staff`, D6). Izin masuk **lewat migrasi data `0051`** (production tidak menjalankan seed) dan `db/seed.ts`.
- Respons memuat DATA PRIBADI (email, telepon, WhatsApp, nama perusahaan). Jangan masuk log/Sentry. Ekspor CSV dicatat di `audit_logs` (`entity_type='insight_export'`, `action='export'`, `entity_id`=laporan, `changes`={report, filters, rows, truncated}) dan dibatasi rate limit 10/menit.

## Definisi baku (jangan ditafsir ulang)
| Istilah | Definisi |
|---|---|
| Komersil | `commercialCustomerIdsSubquery()` — role customer, bukan internal (flag ATAU role admin/staf). Semua tren/uang/retensi KOMERSIL saja |
| Pelanggan | akun **pemilik** Data Usaha SAAT INI (`data_usaha.user_id`), bukan pembeli awal (`subscriptions.user_id`); Data Usaha = anak |
| Langganan dihitung ("fitur") | `plans.kind='module'`, `is_trial=false`, status `active`/`expired`, `start_at` terisi. Langganan gratis pemberian admin ikut dihitung sebagai berlangganan, TIDAK sebagai uang. Seat & trial dipisah |
| Aktif di bulan M | `start_at < akhir M` dan (`end_at` kosong atau `> awal M`), zona waktu perusahaan; tanpa jeda toleransi |
| Aktif sekarang | status `active`, `start_at ≤ now`, `end_at` kosong atau `> now` |
| Baru di M | bulan `start_at` terawal semua langganan dihitung milik pemilik (D13) |
| Berhenti di M | aktif di M−1, tidak aktif di M |
| Usia | `tahun = floor(bulan_sejak_awal_pertama / 12) + 1`. Kolom: Baru · Lanjutan tahun ke-1 · Tahun ke-2.. (memartisi aktif tepat sekali) · Berhenti · Kembali (irisan) |
| Uang terbayar | `invoices.status='paid'`, bulan dari `paid_at`, jumlah `invoices.total` (tanpa kode unik), akun KOMERSIL. *Dilunasi admin* = ada order metode `manual`; selain itu *terverifikasi* |
| Koreksi koneksi | `reset_database` (mandiri) atau `disconnect_accurate` (admin) |

## Endpoint
| Endpoint | Query | Isi |
|---|---|---|
| `GET /summary` | – | `accounts{commercial,internal,disabled}` (disabled = himpunan bagian), `dataUsaha{total,connected}`, `customers{active,activeFeatures}`, `expiring{owners14,subscriptions14,owners30,subscriptions30}`, `money{thisMonth,thisYear}{verified,adminSettled,total}` |
| `GET /customers` | `q` (nama/email/perusahaan), `type=all\|commercial\|internal`, `kind=semua\|pemilik\|tambahan\|belum` (Fase 189D, tab Akses), `page`, `pageSize≤100` | akun customer (pemilik & tambahan): kontak, `internalReason`, `kind`, Data Usaha, fitur aktif, `nearestEndAt`, `seats{active,invited,available}` (slot User Tambahan milik akun sebagai pemilik; satu query ringkasan per halaman, tanpa N+1) |
| `GET /customers/:userId/access` | – | pemilik + tiap Data Usaha + slot User Tambahan (`seatExpired` dihitung server) |
| `GET /features` | – | per fitur: `dataUsaha`, `customers`, `subscriptions` (aktif sekarang, komersil) |
| `GET /features/:moduleKey/customers` | `page`,`pageSize` | baris per Data Usaha: pemilik+kontak, paket, mulai/berakhir, `renewalInterval`; 404 modul tak dikenal |
| `GET /new` | `from`,`to` (YYYY-MM-DD, `to` inklusif, ≤731 hari) | per pemilik: `isNewCustomer`, `firstStartAt`, fitur; `summary{customers,newCustomers,subscriptions}` |
| `GET /expiring` | `window=14\|30` | per pemilik (terdekat dulu): langganan + `daysLeft` + `renewal{status: terbit\|terjadwal\|tidak_terjadwal, invoiceNumber, amountDue, interval}` |
| `GET /trend` | `year` (2020–2100), `metric=registered\|active\|new\|stopped\|money` | 12 titik `{month,value,previous,delta,percent,future}`; Januari dibandingkan Desember tahun lalu; bulan depan `future=true,value=null`; `summary{kind: stock\|flow,value}`; `registered` + `cumulative[]`; `money` + `parts{verified,adminSettled}` |
| `GET /tenure` | `month=YYYY-MM` (default bulan ini; masa depan 422 `FUTURE_MONTH`) | `aktif,baru,lanjutanTahun1,byYear[{year,count}],berhenti,kembali` |
| `GET /connection-history` | `q`,`kind=all\|koreksi`,`from`+`to` (keduanya atau tidak sama sekali), `page` | peristiwa + `summary{byAction,dataUsahaWithCorrection,ownersWithCorrection,repeatedCorrection}` |
| `GET /export/:report` | per laporan (lihat di bawah) | CSV UTF-8 BOM, CRLF; header `X-Export-Rows`, `X-Export-Truncated`, `Content-Disposition` |

Ekspor: `customers` (`q`,`type`), `feature-users` (`moduleKey`), `new` (`from`,`to`), `expiring` (`window`), `connection-history` (`q`,`kind`,`from`,`to`), `trend` (`year`,`metric`). Batas 10.000 baris (D5, lebih → dipotong + `X-Export-Truncated: true`). Sel berawalan `= + - @ TAB CR` diberi apostrof; telepon Indonesia diekspor `08…` (tanpa apostrof), internasional `+…` diberi apostrof.

## Catatan teknis
- **Rumus murni** (`lib/admin-insights.ts`) diuji data sintetis (batas bulan, zona waktu, lompat tahun, usia, CSV); route hanya mengambil data lalu memanggilnya. Tes DB memakai **DELTA/scoping per pelanggan uji** karena DB dev dipakai bersama dan data tahun-lampau tidak bergeser (kunci: asersi tahan sisa data).
- **Skala**: tren/usia membaca SEMUA langganan yang dihitung ke memori (`fetchCountedSubscriptions`, kolom minimal). Cukup untuk ribuan–puluhan ribu baris; bila production jauh lebih besar → pindah ke agregasi SQL atau tabel ringkasan (lihat hasil SQL baseline P5/P9).
- **Indeks**: `audit_logs(entity_type, action, created_at)` (migrasi 0050) untuk filter riwayat; join ke `data_usaha` memakai `id::text = entity_id`.
- **Uang mencakup SEMUA faktur lunas akun komersil (modul + User Tambahan)**; hitungan pelanggan/fitur hanya modul.
- Uang tanpa join ke `orders` (konvensi 1 invoice = 1 order tidak dijaga constraint): "dilunasi admin" lewat `EXISTS` order `manual`.
- Pagination `new`/`expiring`: pengelompokan per pemilik dilakukan di memori (hasil dibatasi rentang/jendela), lalu dipotong per halaman.
- Tidak ada endpoint tulis. Aksi (cabut akses, tandai internal) tetap di API masing-masing.

## Keterbatasan
- Pelanggan = akun pemilik (D1 default); hasil SQL production P3/P4 belum divalidasi. Bila mayoritas pemilik punya >1 Data Usaha, tampilan 189D menonjolkan Data Usaha sebagai anak.
- Peristiwa `accept_seat`/`resend_seat` belum tercatat (tidak muncul di riwayat).
- Invoice/order lama dari akun yang kemudian ditandai internal keluar dari laporan uang; kas yang masuk dari order terbuka internal tidak muncul (D21 terbuka).
