# Architecture — Cutover Koneksi Accurate ke Production (Fase 145)

> Rencana rilis Fase 143 (model koneksi 1-per-akun, ADR-0037) + 144 (gerbang popup) ke production, dengan customer nyata.
> Prinsip: **customer yang koneksinya MASIH HIDUP tidak boleh terputus**; yang sudah mati diarahkan sekali, dengan pemberitahuan
> lebih dulu. Semua tindakan terhadap data/token customer dijalankan **user sendiri** lewat SSH (aturan tetap proyek), Claude menyiapkan
> skrip, tes, dan perintah persis. Fakta data: `docs/phases/phase-141-*.md` § Hasil P1–P3 (59 koneksi, 9 customer, 24 Data Usaha,
> 69% subscription aktif koneksinya sudah tertimpa/mati).

## Kenapa perlu fase sendiri
Cutover langsung (ADR-0037 #1) berarti begitu kode 143 jalan, semua baca-koneksi memakai model baru dan **mengabaikan** koneksi lama
(`accurate_user_id` NULL). Tanpa langkah tambahan, customer yang token-nya masih hidup ikut terputus mendadak. Terbukti E2 (Fase 141):
per akun Accurate hanya satu token yang hidup — jadi koneksi hidup itu bisa DIKENALI dan DIPINDAHKAN ke model baru tanpa customer
melakukan apa pun, selama kita tidak memicu otorisasi baru.

## Strategi: "Carry-over" koneksi hidup + hubungkan ulang untuk yang mati
1. **Carry-over (skrip, dijalankan user di server SETELAH deploy+migrasi).** Untuk tiap koneksi lama berstatus `active`:
   panggil `auth-info.do` dan `approved-scope.do` dengan token itu (**baca-saja**, tanpa refresh, tanpa otorisasi baru → tidak mematikan
   token siapa pun). Hidup (HTTP 200) → isi `accurate_user_id`, `accurate_user_email`, `granted_scopes` pada baris itu (jadi koneksi
   model baru) dan arahkan Data Usaha yang dulu memakainya (`data_usaha.accurate_connection_id`). Mati (401) → tidak disentuh;
   customer melihat popup "Hubungkan ulang — sekali saja".
2. **Konfirmasi database tetap diminta** (`confirm_database`, ADR-0037 #7): pointer + database terpasang sehingga import langsung
   jalan, tapi popup meminta pemilik memastikan database benar (pemetaan lama bisa keliru pada customer multi-Data-Usaha).
3. **Pemberitahuan** sebelum dan sesudah (email + in-app).
4. **Pembersihan (kontrak) di rilis terpisah**, setelah stabil: hapus kolom/baris legacy.

## Skrip (Fase 145, `apps/api/src/scripts/`)
Pola sama `backfill-data-usaha.ts`: fungsi murni + blok `import.meta.main`, **dry-run adalah default** (`--apply` untuk menulis),
idempotent, terlihat di `package.json` sebagai `bun run db:<nama>`. Skrip ikut ter-bundle di image (dijalankan lewat
`docker compose ... exec api bun run ...`, tanpa transfer file).

### `db:carry-over-accurate` — `carry-over-accurate-connections.ts`
- Daftar koneksi lama aktif → panggil Accurate berurutan (lewat `withAccurateRateLimit`, timeout 15 dtk, satu percobaan).
- **Perencana murni** `planCarryOver(rows, identities)` menghasilkan keputusan per Data Usaha (teruji unit, tanpa jaringan/DB):
  | Keputusan | Kondisi |
  |---|---|
  | `carry_over` | token hidup; pemilik koneksi = pemilik Data Usaha; database Data Usaha kosong ATAU sama dengan database koneksi |
  | `skip_dead` | `auth-info.do` HTTP 401 (koneksi mati) |
  | `skip_owner_mismatch` | Data Usaha sudah ditransfer (pemilik ≠ pemilik koneksi) — pemilik baru hubungkan sendiri |
  | `skip_account_conflict` | `accurate_user_id` yang sama sudah dipakai baris lain (customer sudah hubungkan ulang / duplikat) |
  | `skip_db_conflict` | 2 Data Usaha pemilik sama memetakan database yang sama (indeks unik `data_usaha_connection_db_uidx`) |
  | `skip_db_ambiguous` | database Data Usaha (hasil backfill 0028) ≠ database koneksi hidup |
  | `skip_error` | galat jaringan/5xx/timeout (dicoba ulang manual; TIDAK dianggap mati) |
- Keluaran (tanpa token, email disamarkan `a***@domain`): tabel per Data Usaha + ringkasan hitungan; `--apply` menulis per koneksi dalam
  transaksi (UPDATE koneksi + UPDATE Data Usaha); tidak pernah menulis token, tidak pernah refresh, tidak menandai `expired`.
- **Aman diulang**: baris yang sudah berakun dilewati (`skip_account_conflict`/sudah model baru).

### `db:notify-accurate-cutover` — `notify-accurate-cutover.ts`
- `--phase pre` (H-3 & H-1): pemilik semua Data Usaha berlangganan modul Facport → in-app (`createNotification`, tipe `announcement`)
  + email (`sendEmail`). `--phase post`: hanya pemilik Data Usaha yang masih perlu tindakan (status ≠ ok setelah carry-over), berisi
  langkahnya. Dry-run default (cetak penerima+subjek, tanpa kirim); `--send` mengirim; idempotent per (user, fase) lewat baris
  notifikasi (tidak kirim dua kali).
- **Prasyarat yang harus dipastikan dulu:** `RESEND_API_KEY` terisi di production (pertanyaan terbuka sejak `lessons-learned` 2026-09
  — cek panjang nilainya tanpa mencetaknya). Bila kosong, email jalan sebagai no-op (log saja) → gunakan pengumuman admin in-app +
  hubungi customer langsung (9 orang, feasible).

## Runbook (Full — worker terlibat: `lib/accurate-*` diimpor `workers/index.ts`)
Gaya baku: **satu perintah per pesan, seluruhnya di dalam SATU pasang kutip, tanpa heredoc**; SQL berisiko diberi versi
`BEGIN; …; ROLLBACK;` dulu. Claude memberi perintah persis saat tiap langkah tiba (jangan improvisasi dari dokumen ini).

**T-3 hari — pengumuman awal.** Jalankan `db:notify-accurate-cutover --phase pre` (dry-run → `--send`). Isi draf: § Narasi.
**T-1 hari — pengingat** (fase `pre` lagi, penerima sama, subjek "Besok").
**T0 — jendela deploy (pilih jam sepi; usulan Minggu malam):**
1. *Pra-cek.* (a) tidak ada batch berjalan: `select count(*) from import_batches where status in ('processing','cancelling')` harus 0
   (bila >0, tunggu/koordinasi). (b) `RESEND_API_KEY` ada. (c) ruang disk cukup.
2. *Backup baru.* `bash /opt/facport/scripts/backup-db.sh` (atau `pg_dump` manual); pastikan file & unggahan Drive sukses, catat nama file.
3. *Rilis* — hanya bila user berkata "rilis": PR `develop`→`main`, tunggu `Release` lalu `Deploy` → `build-and-push` **success** (bukan cuma
   tag GitHub), ambil `IMAGE_TAG` (aturan tetap).
4. *Deploy Full* (`architecture-deployment.md` § Full): `pull` semua, `up -d api web worker minio postgres` (dua `-f`, tanpa `caddy`),
   lalu `exec api bun run db:migrate` (memuat 0027–0029, ADITIF). **Bila `db:migrate` gagal generik** → jalur manual di `lessons-learned`
   (terapkan SQL migrasi via `psql -c` per pernyataan + isi `drizzle.__drizzle_migrations` dengan hash & `created_at` yang sama);
   verifikasi kolom baru ada (`\d data_usaha`).
5. *Carry-over.* `exec api bun run db:carry-over-accurate` (dry-run) → user menempel keluaran → Claude membaca (hitungan per keputusan,
   apakah ada `skip_db_ambiguous`/`skip_error` yang perlu tindakan) → `-- --apply`.
6. *Verifikasi:* `docker ps` (semua Up), `https://api.facinstitute.id/health`, SQL pack (§ Verifikasi), lalu **uji nyata di browser**
   dengan satu akun pemilik (login app.facinstitute.id: dashboard menampilkan status benar, popup sesuai). Jangan percaya status
   container saja (aturan tetap).
7. `db:notify-accurate-cutover --phase post` (dry-run → `--send`) ke pemilik yang masih perlu tindakan.
**T+1 s.d. T+7 — pemantauan.** SQL pack harian (batch gagal 401/403, koneksi `expired`, Data Usaha `not_connected`), Sentry (galat baru
`AccurateTokenError`/`AccurateScopeError`), balas pertanyaan customer. **Tidak ada rilis lain yang menyentuh Accurate selama jendela ini.**
**≥ T+7 — kontrak (rilis TERPISAH, perlu "rilis" eksplisit + backup):** hapus `subscriptions.accurate_connection_id`,
`accurate_connections.accurate_db_id/alias`, dan baris koneksi lama yang tak terpakai (token sudah mati); hapus endpoint
`/accurate/subscriptions` & `/accurate/connections` bila tetap tanpa pemakai; catat lessons-learned.

## SQL pack verifikasi (baca-saja, dijalankan user; `docker exec -e PGPASSWORD ... psql -c "..."`)
1. Ringkasan model baru: koneksi berakun (`accurate_user_id is not null`) per status; Data Usaha berpointer vs tidak.
2. Data Usaha berlangganan Facport per keadaan gerbang (terhubung+db terkonfirmasi / butuh konfirmasi / belum terhubung).
3. Batch 24 jam terakhir per status (bandingkan dengan sebelum deploy; deteksi lonjakan `failed`).
4. Baris import bergalat `401|invalid_token|insufficient_scope` 24 jam terakhir.
5. Koneksi berakun yang `updated_at` berubah (ada refresh harian berjalan setelah 02:00) — bukti job refresh baru sehat.

## Rollback (matriks)
| Saat | Kondisi | Tindakan |
|---|---|---|
| Sebelum carry-over | migrasi gagal/kode bermasalah | `IMAGE_TAG` sebelumnya + runbook Full; migrasi 0027–0029 aditif (kode lama kompatibel) |
| Setelah carry-over, <24 jam | ada masalah luas | image lama + Full; kolom baru diabaikan kode lama; koneksi yang sudah **diotorisasi ulang customer** di kode baru (baris tanpa `accurate_db_id`) tidak berguna bagi kode lama → customer itu hubungkan ulang lagi (didokumentasikan di pengumuman) |
| Data rusak | carry-over salah menunjuk | koreksi terarah: `UPDATE data_usaha SET accurate_connection_id = NULL, accurate_db_confirmed_at = NULL WHERE id IN (...)` (dry-run `BEGIN/ROLLBACK` dulu); restore backup hanya untuk kerusakan besar |
Kolom legacy TIDAK dihapus di rilis ini justru agar rollback kode tetap mungkin.

## Narasi pemberitahuan (Bahasa Indonesia, hangat & lugas; disesuaikan per fase oleh skrip)
**Pra (T-3/T-1) — Subjek:** "Pembaruan koneksi Accurate di Facport — {tanggal}". **Isi:** "Halo {nama}, pada {hari, tanggal, jam} kami akan
memperbarui cara Facport terhubung ke Accurate Online. Sekarang satu akun Accurate cukup satu koneksi, dipakai untuk semua Data Usaha
Anda — lebih stabil dan tidak lagi 'terlepas' sendiri saat Anda menghubungkan fitur lain. Yang perlu Anda tahu: pembaruan berlangsung
±{n} menit dan import baru bisa dijalankan setelahnya; **jangan mulai import besar mendekati jam itu**. Setelah pembaruan, sebagian
Data Usaha mungkin meminta Anda menghubungkan ulang akun Accurate satu kali — tinggal ikuti popup di dashboard. Data dan riwayat
import Anda tidak berubah. Ada pertanyaan? Balas email ini."
**Pasca — Subjek:** "Tindakan kecil untuk Data Usaha {nama}". **Isi:** "Pembaruan selesai. Untuk Data Usaha {nama}, Anda perlu menghubungkan
ulang akun Accurate satu kali (popup akan muncul saat Anda membuka dashboard, atau lewat menu Koneksi Accurate). Prosesnya ±1 menit.
Yang sudah terhubung tetap berjalan; kami hanya meminta Anda mengonfirmasi database yang dipakai."

## Risiko & mitigasi
| Risiko | Mitigasi |
|---|---|
| Carry-over menunjuk database salah untuk customer multi-Data-Usaha | `skip_db_ambiguous`; konfirmasi database wajib lewat popup; koreksi terarah lewat SQL |
| Token customer dipakai skrip | baca-saja (`auth-info`/`approved-scope`), tanpa refresh/otorisasi baru, tanpa mencetak/menyimpan token; dry-run dulu; disetujui user (keputusan 145) |
| Customer mengotorisasi ulang di tengah jendela | ditangani upsert per akun; pengumuman meminta menunggu selesai |
| Email tidak terkirim (Resend kosong) | pra-cek `RESEND_API_KEY`; cadangan: pengumuman admin in-app + kontak langsung (9 customer) |
| `db:migrate` gagal generik di production | jalur manual terdokumentasi (`lessons-learned`), diuji dengan `\d` sesudahnya |
| Import berjalan saat deploy | pra-cek batch berjalan = 0; jendela sepi |
| Refresh harian 02:00 merotasi token lalu gagal simpan | sudah ditangani Fase 143 (transaksi + `FOR UPDATE`); pantau Sentry |

## Di luar scope Fase 145
Zero-downtime migration; UI admin baru (dipantau lewat SQL pack); migrasi otomatis customer multi-akun-Accurate (mereka hubungkan ulang per akun).
