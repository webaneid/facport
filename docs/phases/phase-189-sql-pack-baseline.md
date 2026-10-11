# Fase 189 — Paket SQL Baseline Production (baca-saja, agregat)

> Tujuan: melihat **data nyata production** sebelum merancang halaman Insight (`architecture-admin-insight.md`). DB dev TIDAK mewakili
> production (sisa test ±16 ribu user). Semua query **read-only dan hanya agregat** — tidak ada nama/email/telepon yang keluar,
> aman ditempel ke chat. Dijalankan **user** di SSH VPS (Claude tidak mengeksekusi ke production).

## Cara pakai
- Prasyarat: `$DB_USER`, `$DB_NAME`, `$DB_PASSWORD` sudah ter-export di shell SSH (kebiasaan baku).
- Jalankan **satu perintah per kali**, tempel hasilnya ke chat. Bentuk perintah = satu `docker exec … psql -c "…"`, seluruh SQL di dalam
  satu pasang tanda kutip ganda (tanpa heredoc). `"user"` ditulis `\"user\"`.
- Boleh dijalankan sekaligus berurutan; urutan nomor = prioritas (P1–P8 paling penting).

## Query

**P1 — Peran akun** (berapa customer vs admin/staf):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select r.name as role, count(*) as jumlah from user_roles ur join roles r on r.id = ur.role_id group by 1 order by 2 desc;"
```
**P2 — Customer baru per bulan daftar** (+ nonaktif):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select to_char(date_trunc('month', u.created_at), 'YYYY-MM') as bulan, count(*) as customer_baru, count(*) filter (where u.disabled) as nonaktif from \"user\" u where u.id in (select ur.user_id from user_roles ur join roles r on r.id = ur.role_id where r.name = 'customer') group by 1 order by 1;"
```
**P3 — Data Usaha** (total, pemilik unik, terhubung Accurate):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select count(*) as data_usaha, count(distinct user_id) as pemilik, count(*) filter (where accurate_connection_id is not null) as terhubung, count(*) filter (where accurate_db_id is not null and accurate_connection_id is null) as db_tanpa_koneksi from data_usaha;"
```
**P4 — Berapa Data Usaha per pemilik** (menentukan keputusan D1):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select n as jumlah_data_usaha, count(*) as pemilik from (select user_id, count(*) as n from data_usaha group by 1) x group by 1 order by 1;"
```
**P5 — Langganan menurut status/trial/jenis/produk:**
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select s.status, s.is_trial, p.kind, p.product_line, count(*) as jumlah from subscriptions s join plans p on p.id = s.plan_id group by 1,2,3,4 order by 5 desc;"
```
**P6 — Popularitas fitur** (Data Usaha dan pembeli unik, langganan aktif berbayar):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select m.modul, count(distinct s.data_usaha_id) as data_usaha, count(distinct s.user_id) as pembeli from subscriptions s join plans p on p.id = s.plan_id cross join lateral jsonb_array_elements_text(p.modules) as m(modul) where s.status = 'active' and s.is_trial = false and p.kind = 'module' group by 1 order by 2 desc;"
```
**P7 — Berapa fitur aktif per Data Usaha** (histogram):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select n as fitur_aktif, count(*) as data_usaha from (select s.data_usaha_id, count(*) as n from subscriptions s join plans p on p.id = s.plan_id where s.status = 'active' and s.is_trial = false and p.kind = 'module' group by 1) x group by 1 order by 1;"
```
**P8 — Langganan berakhir per bulan** (aktif berbayar; dasar butir 6):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select to_char(date_trunc('month', s.end_at), 'YYYY-MM') as bulan_berakhir, count(*) as langganan, count(distinct s.data_usaha_id) as data_usaha from subscriptions s join plans p on p.id = s.plan_id where s.status = 'active' and s.is_trial = false and p.kind = 'module' and s.end_at is not null group by 1 order by 1;"
```
**P9 — Langganan mulai per bulan** (berbayar; dasar butir 5 dan 7):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select to_char(date_trunc('month', s.start_at), 'YYYY-MM') as bulan_mulai, count(*) as langganan, count(distinct s.user_id) as pembeli from subscriptions s join plans p on p.id = s.plan_id where s.is_trial = false and p.kind = 'module' and s.start_at is not null and s.status <> 'pending_payment' group by 1 order by 1;"
```
**P10 — User Tambahan (seat) menurut status** (butir 4):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select status, count(*) as jumlah, count(distinct data_usaha_id) as data_usaha, count(distinct primary_user_id) as pemilik from member_seats group by 1 order by 2 desc;"
```
**P11 — Langganan aktif TANPA pembayaran** (diberi admin; petunjuk kasar akun internal/gratis, butir 1):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select count(*) as langganan, count(distinct user_id) as akun, count(distinct data_usaha_id) as data_usaha from subscriptions where status = 'active' and is_trial = false and order_id is null and invoice_item_id is null;"
```
**P12 — Pemutusan koneksi oleh admin per bulan** (butir 9):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select to_char(date_trunc('month', created_at), 'YYYY-MM') as bulan, count(*) as kejadian, count(distinct entity_id) as data_usaha_unik, count(*) filter (where changes->>'removedAccount' = 'true') as hapus_akun from audit_logs where action = 'disconnect_accurate' group by 1 order by 1;"
```
**P13 — Berapa kali satu Data Usaha diputus** (apakah ada yang berulang):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select jml as kali_diputus, count(*) as data_usaha from (select entity_id, count(*) as jml from audit_logs where action = 'disconnect_accurate' group by 1) x group by 1 order by 1;"
```
**P14 — Cara daftar** (email vs Google; menentukan keputusan D2):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select provider_id, count(*) as akun from account group by 1 order by 2 desc;"
```
**P15 — Akun yang masuk 30 hari terakhir** (petunjuk aktivitas; sesi lama mungkin sudah dibersihkan, anggap batas bawah):
```
docker exec -e PGPASSWORD="$DB_PASSWORD" facport-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c "select count(distinct user_id) as akun_masuk_30_hari, min(created_at)::date as sesi_tertua from session where created_at > now() - interval '30 days';"
```

## Cara membaca hasil (untuk keputusan)
| Hasil | Dipakai untuk |
|---|---|
| P1, P2, P14 | Skala pelanggan; seberapa besar pekerjaan "Lengkapi profil" (D2) |
| P3, P4 | Satuan "pelanggan" (D1): bila hampir semua pemilik hanya 1 Data Usaha, perbedaannya kecil |
| P5–P7 | Popularitas fitur & pola pemakaian; ukuran tabel Insight |
| P8, P9 | Beban kerja jendela perpanjangan; apakah kohort sudah ada isinya |
| P10 | Skala masalah "akses" (butir 4) dan prioritas aksi cabut/mutasi |
| P11 | Seberapa banyak akun yang kemungkinan internal/gratis → bahan uji flag `is_internal` |
| P12, P13 | Apakah "salah koneksi" masalah nyata (butir 9) dan apakah ada pelanggan yang berulang |

## Hasil (diisi setelah user menjalankan)
_Belum dijalankan._ Tempel ringkasan di sini beserta tanggal eksekusi.
