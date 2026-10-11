# Architecture — Insight Pelanggan Admin (Kebutuhan Data FAC)

> **Status: RENCANA (Fase 189, dibuat 2026-10-12). Belum ada kode.**
> Sumber kebutuhan: `docs/referencehtml/facport/masukan-client-12-oct.xlsx`
> ("Kebutuhan Data di Portal Admin New Facport", FAC, 10/10/2026) — 9 butir.
> Dokumen ini = kebutuhan client → pemetaan ke data yang ada → gap → rancangan data/API → fase.
> **UI/visual SENGAJA dibahas terakhir** (Fase 190, setelah fungsi data beres) — urutan yang disepakati user 2026-10-12:
> kebutuhan client dulu, desain UI kemudian. Dokumen dashboard yang sudah ada: `architecture-admin-dashboard.md` (Fase 59).

## 1. Tujuan
Memberi tim FAC (admin/staf) gambaran siapa pelanggan Facport, apa yang mereka pakai, kapan mulai/berakhir, siapa saja yang punya akses, dan
bagaimana riwayat koneksi Accurate mereka — untuk keputusan bisnis, sosialisasi fitur, onboarding pelanggan baru, dorongan perpanjangan,
dan edukasi koneksi. Bukan sekadar angka agregat (dashboard Fase 59): kebutuhan client berupa **daftar nama + kontak yang bisa ditindaklanjuti**.

## 2. Istilah (dipakai konsisten di kode & UI)
| Istilah | Arti |
|---|---|
| **Pelanggan** | Akun pemilik (`user`) yang memiliki satu atau lebih Data Usaha. Di Excel disebut "PT A". *(Keputusan D1 — lihat § 9)* |
| **Data Usaha** | Workspace (`data_usaha`); langganan, koneksi Accurate, dan seat menempel di sini. Satu pelanggan bisa punya banyak. |
| **Fitur** | Satu langganan modul aktif (`subscriptions` → `plans.modules`, 1 SKU = 1 sub-modul) pada sebuah Data Usaha. |
| **Akses** | Orang yang bisa masuk ke Data Usaha: pemilik + User Tambahan (`member_seats`, status `active`/`invited`). |
| **Komersil** | Pelanggan berbayar. Nilai rupiah fitur dihitung. |
| **Internal** | Trainer, mitra, dsb. Tidak berbayar → TIDAK dihitung nilai rupiahnya (butir 1). Ditandai flag di akun (`user.is_internal`, keputusan user 2026-10-12). |

## 3. Pemetaan 9 butir kebutuhan

Legenda kesiapan: **Siap** = data sudah ada, tinggal endpoint+halaman · **Gap data** = perlu skema/pencatatan baru · **Gap fitur** = perlu aksi baru.

| # | Kebutuhan client | Sumber data sekarang | Kesiapan | Yang perlu dibuat |
|---|---|---|---|---|
| 1 | Jumlah pengguna komersil vs internal; nilai rupiah fitur hanya untuk komersil | Role `customer`; tidak ada penanda internal; harga di `plans.price` + `interval` | **Gap data** | Kolom `user.is_internal`; admin menandai di halaman Pengguna; KPI komersil/internal; nilai rupiah (D3) |
| 2 | Pengguna per fitur (nama pelanggan per modul) | `subscriptions` active → `plans.modules` → `data_usaha` → `user` | **Siap** | Endpoint `by-feature` + tampilan daftar per fitur |
| 3 | Fitur per pengguna | Sama (dibalik). Sebagian sudah di `/admin/users/[id]` | **Siap** | Endpoint `by-customer` (ringkas: daftar fitur + jumlah) |
| 4 | Jumlah & nama akses per pelanggan (email utama + User Tambahan); eliminasi/mutasi akses | `member_seats` (`member_user_id`, `invited_email`, `status`, `revoked_*`) | **Siap (lihat)** + **Gap fitur (aksi)** | Endpoint `access`; aksi admin **cabut seat** dan **pindahkan akses** (saat ini revoke hanya lewat `team.route.ts` sisi pemilik) |
| 5 | Pelanggan baru per tanggal + fiturnya | `subscriptions.start_at/created_at`, `user.created_at` | **Siap** | Endpoint `new-customers?from&to` |
| 6 | Pelanggan yang akan berakhir + fiturnya | `subscriptions.end_at` (H-7 sudah diingatkan ke pelanggan, belum ada tampilan untuk FAC) | **Siap** | Endpoint `expiring?from&to` |
| 7 | Kohort pelanggan tahun ke-1, ke-2, …; retensi | `subscriptions` + `subscription_renewals` (tidak dihapus job purge) | **Siap (hitung)**, data baru sejak 2026-09 | Endpoint `cohorts`; kohort tahun ke-2 baru bermakna 2027 |
| 8 | Nama, email, telepon, perusahaan | `user.name/email` saja; telepon & perusahaan tidak ada (hanya `company.phone` di settings = telepon FAC, bukan pelanggan) | **Gap data** | Kolom `user.phone`, `user.company_name`; form daftar + lengkapi profil untuk user lama |
| 9 | Riwayat pemutusan koneksi oleh admin (salah → putus → benar) | `audit_logs` `entity_type='data_usaha'`, `action='disconnect_accurate'` (sudah memuat DB lama, alias, `removedAccount`, admin) | **Gap data** (setengah) | Catat juga sisi *sambung/pilih database* + `alasan` pada dialog putus; endpoint riwayat per Data Usaha |

## 4. Gap skema & pencatatan (perubahan data)

### 4.1 Profil pelanggan (butir 1, 8)
Tambah di `user` (migrasi Drizzle, `docs/architecture/architecture-database.md`):
- `is_internal boolean not null default false`
- `phone varchar(20)` nullable — disimpan dinormalisasi format `628xxxxxxxxxx` (tanpa `+`), SAMA dengan konvensi `customer_care_agents.whatsapp_number` supaya langsung bisa dipakai `wa.me`.
- `company_name varchar(200)` nullable.

Catatan penting:
- `user` dikelola Better Auth. Kolom `disabled` sudah pernah ditambahkan sebagai field custom (§ `auth.schema.ts`) → ikuti pola itu;
  **verifikasi** apakah perlu `additionalFields` agar `signUpEmail` menerima `phone/companyName`. Jangan tebak — cek instalasi (pola Fase 106).
- Jalur daftar ada dua: email+password (form dapat menyertakan field) dan **Google** (tidak lewat form; hook `databaseHooks.user.create.after` hanya `assignCustomerRole` + link invite).
  Untuk Google dan seluruh user lama, kolom ini kosong → perlu langkah **"Lengkapi profil"** setelah login (D2: wajib atau boleh dilewati).
- Admin/staf/Tim Internal (role `admin`/`staff`) TIDAK diperlakukan sebagai "pengguna internal" butir ini — itu tim FAC. "Internal" = akun customer-role yang ditandai trainer/mitra.
- Menandai internal = aksi admin yang tercatat di `audit_logs` (`entity_type='user'`, `action='update'`, `changes.is_internal`).

### 4.2 Pencatatan koneksi Accurate (butir 9)
Sekarang hanya aksi putus oleh admin yang tercatat. Untuk membentuk cerita "salah → putus → benar":
- Catat event **sambung** dan **pilih/konfirmasi database** di `audit_logs` (`entity_type='data_usaha'`; `action` ≤ 20 karakter: `connect_accurate`, `select_database`; `actorId` = pemilik). Titik pencatatan: handler OAuth callback dan `databases/select` / `confirm` di `routes/accurate.route.ts` (verifikasi nama persis saat eksekusi).
- Tambah `alasan` opsional pada dialog "Putuskan Koneksi" admin (`disconnect-accurate-dialog.tsx`): `salah_database` · `salah_akun` · `lainnya` (+ catatan bebas), disimpan di `changes`. Ini yang membuat statistik "berapa pelanggan salah koneksi" valid tanpa menebak.
- Data historis SEBELUM pencatatan baru: hanya sisi putus yang ada. Sisi "benar" untuk riwayat lama diturunkan dari keadaan sekarang (`data_usaha.accurate_db_alias`, `accurate_db_confirmed_at`) — dinyatakan sebagai pendekatan, bukan fakta historis.
- `audit_logs` tidak punya index `(entity_type, action)`; cukup bila volume rendah, evaluasi saat eksekusi (index `created_at` sudah ada).

### 4.3 Aksi admin untuk akses (butir 4)
Saat ini cabut/undang seat HANYA lewat `routes/team.route.ts` (hak pemilik Data Usaha). Kebutuhan "eliminasi akses atas permintaan atasan" dan "mutasi akses saat user resign" butuh sisi admin:
- `POST /admin/data-usaha/:id/seats/:seatId/revoke` — memakai logika bersama `lib/member-seats.ts` (jangan salin), mematikan sesi member bila perlu, notifikasi ke pemilik, audit log.
- Mutasi akses = cabut seat lama + undang email baru pada slot yang sama (reuse alur invite), bukan operasi baru yang mengutak-atik `member_user_id` langsung.
- Transfer kepemilikan Data Usaha oleh admin SUDAH ada (`admin/data-usaha.route.ts`, `transfer_ownership`) — tidak diulang.
- Wajib konfirmasi dua langkah di UI dan peringatan bahwa tindakan memengaruhi orang lain.

## 5. Rancangan API (read-only, kecuali aksi di 4.3)

Route baru `apps/api/src/routes/admin/insights.route.ts`, prefix `/admin/insights`, mengikuti pola `stats.route.ts`:
**handler hanya fetch data mentah → panggil fungsi murni di `apps/api/src/lib/admin-insights.ts`** (diuji dengan data sintetis; query DB diuji dengan pola delta before/after karena DB dev dipakai bersama).

| Endpoint | Isi | Butir |
|---|---|---|
| `GET /admin/insights/summary` | jumlah komersil / internal / nonaktif, Data Usaha, terhubung Accurate, langganan aktif, nilai rupiah (D3) | 1 |
| `GET /admin/insights/customers?q&type&page` | daftar pelanggan: nama, email, telepon, perusahaan, tipe, jumlah Data Usaha, jumlah fitur aktif, tanggal daftar | 3, 8 |
| `GET /admin/insights/features` | tiap fitur: jumlah Data Usaha/pelanggan pengguna aktif | 2 |
| `GET /admin/insights/features/:moduleKey/customers` | daftar pelanggan pemakai satu fitur | 2 |
| `GET /admin/insights/customers/:userId/access` | per Data Usaha: pemilik + seat (email, status, tanggal) | 4 |
| `GET /admin/insights/new?from&to` | pelanggan/langganan baru dalam rentang + fiturnya | 5 |
| `GET /admin/insights/expiring?from&to` | langganan akan berakhir + fiturnya + status perpanjangan terjadwal | 6 |
| `GET /admin/insights/cohorts?basis=customer\|revenue` | matriks kohort × periode | 7 |
| `GET /admin/insights/connection-history?q&page` | peristiwa putus/sambung per Data Usaha, alasan, jumlah kejadian per pelanggan | 9 |
| `GET /admin/insights/export/:report` | CSV (lihat D5) | semua |

Aturan:
- **Permission baru `insights.view`** (seed ke role admin dan staff; terpisah dari `users.manage` agar bisa dibatasi untuk staf). Aksi di 4.3 memakai `subscriptions.manage` (selaras `disconnect-accurate`). Keputusan final D6.
- Semua query lewat Drizzle; filter "pelanggan asli" memakai pola `getCustomerIdsSubquery()` (`stats.route.ts`) — JANGAN `select` polos dari `user`. Flag `is_internal` memisahkan komersil/internal DI ATAS himpunan customer.
- Paginasi wajib untuk daftar (tanpa ambil semua baris ke JS). Agregasi besar dilakukan di SQL (`GROUP BY`), bukan JS — beda dengan Fase 59 yang memang kecil.
- Validasi query/params dengan `t.Object` Elysia; rentang tanggal dibatasi (mis. maks 24 bulan) agar tidak jadi beban.
- Timestamp UTC di DB; pengelompokan "bulan/tanggal" untuk tampilan memakai zona waktu perusahaan (setting), bukan UTC (beda dengan chart 12-bulan Fase 59 yang sengaja UTC — di sini tanggal mulai/berakhir ditampilkan ke manusia).
- Index kandidat (verifikasi dengan `EXPLAIN` di data besar): `subscriptions(end_at)`, `subscriptions(start_at)`, `member_seats(data_usaha_id, status)`, `audit_logs(entity_type, action, created_at)`.

### 5.1 Rumus
- **Aktif pada tanggal t**: ada langganan modul non-trial, bukan `cancelled`, dengan `start_at ≤ t < end_at`. Trial dan seat_addon TIDAK dihitung sebagai "fitur" pelanggan komersil (seat dihitung terpisah sebagai akses).
- **Kohort**: bulan langganan berbayar pertama (non-trial, bukan internal) per pelanggan. Retensi periode k = pelanggan kohort itu yang masih aktif (definisi di atas) pada k bulan sesudahnya. Sel yang belum tercapai = kosong, bukan 0%.
- **Nilai langganan aktif** (kandidat D3): jumlah `plans.price` langganan aktif komersil, dinormalisasi per bulan (`interval` monthly=1, yearly=12 → bagi). **Total dibayar**: dari invoice/order berstatus lunas (verifikasi nama status di `architecture-invoice.md` saat eksekusi, jangan menebak).
- **Perhatian**: `end_at` bisa diubah manual admin (Fase 173–180, quick-extend) — riwayat kohort mengikuti nilai terkini, bukan nilai asli; dicatat sebagai keterbatasan.

## 6. Informasi arsitektur halaman (konsep; visual → Fase 190)
Satu area **"Insight"** di sidebar admin, `/admin/insight`, dengan tab:
1. **Ringkasan** — KPI komersil vs internal, nilai, langganan aktif/segera berakhir, koneksi bermasalah.
2. **Pelanggan** — tabel + pencarian + filter tipe; detail ringkas (kontak, Data Usaha, fitur, akses). Tombol WhatsApp/telepon (`wa.me`) langsung dari baris.
3. **Fitur** — fitur → pelanggan pemakai.
4. **Akses** — pelanggan → pemilik + User Tambahan, dengan aksi cabut/mutasi (4.3).
5. **Langganan** — sub-tab *Baru* dan *Akan berakhir* (rentang tanggal, filter fitur).
6. **Retensi** — heatmap kohort, toggle jumlah pelanggan ↔ nilai.
7. **Riwayat Koneksi** — peristiwa per Data Usaha, alasan, pelanggan yang berulang salah.
Setiap tab: ekspor CSV. Halaman `/admin/users/[id]` yang ada tetap sebagai detail satu pelanggan dan ditautkan dari semua tabel.
"Log aktivitas user" (login, import) TIDAK termasuk Excel client → ditunda sebagai tahap kedua (Fase 189F, opsional).

## 7. Privasi & keamanan
- Telepon/email/perusahaan adalah data pribadi → hanya untuk admin berizin `insights.view`; tidak masuk log aplikasi (Pino) dan tidak dikirim ke Sentry sebagai payload.
- **Ekspor CSV mengandung data pribadi** → tiap ekspor dicatat di `audit_logs` (siapa, laporan apa, jumlah baris).
- Teks persetujuan di form daftar: tujuan pengumpulan telepon (komunikasi dukungan/onboarding). Selaraskan dengan UU PDP; redaksi teks persetujuan dikonfirmasi client/penasihat hukumnya (bukan ditentukan sepihak di kode).
- Cegah CSV injection: nilai sel yang diawali `=`, `+`, `-`, `@` diberi awalan `'`.
- Aksi 4.3 (cabut/mutasi akses) wajib dicek kewenangan di service layer + audit log; lewat middleware permission terpusat (jangan cek manual per-handler).
- Setelah implementasi tiap sub-fase: skill `security-review`; sub-fase 189C (banyak endpoint) → subagent `security-auditor`.

## 8. Fase kerja (urutan = ketergantungan)
| Fase | Isi | Bergantung pada |
|---|---|---|
| **189** | Perencanaan (dokumen ini), SQL baseline production | — |
| 189A | Profil pelanggan & tipe: `is_internal/phone/company_name`, form daftar, "Lengkapi profil", admin menandai internal, tampil di daftar Pengguna admin | keputusan D1, D2, D4 |
| 189B | Pencatatan koneksi (connect/select db + alasan putus) + aksi admin seat (cabut/mutasi) | — (bisa paralel 189A) |
| 189C | API Insight read-only + fungsi murni + tes + index | 189A (kolom), 189B (event) |
| 189D | Halaman Insight fungsional (komponen yang ada) + ekspor CSV | 189C |
| 189E | Dashboard `/admin`: KPI komersil/internal & nilai rupiah | 189C |
| 189F | (Opsional) Log aktivitas user | keputusan terpisah |
| **190** | Riset & desain UI → design system admin → redesign dashboard & Insight (arah "Kompak & tajam", admin dulu, pelanggan menyusul) | 189D (agar ada layar nyata untuk di-redesign) |

Rilis: commit+push `develop` per sub-fase; release HANYA bila user meminta eksplisit (aturan berjalan). 189A sebaiknya dirilis lebih awal dari yang lain karena data telepon/perusahaan baru terkumpul SETELAH form berubah.

## 9. Keputusan (D) — status
| ID | Pertanyaan | Rekomendasi | Status |
|---|---|---|---|
| D1 | "Pelanggan" = akun pemilik atau Data Usaha? | Akun pemilik sebagai baris utama, Data Usaha sebagai anak (tab Akses/Fitur per Data Usaha, karena seat & langganan menempel di Data Usaha) | **Menunggu user** |
| D2 | Telepon & perusahaan wajib saat daftar / saat login pertama? | Wajib di form daftar baru; user lama & Google: banner "Lengkapi profil" dulu, pemblokiran hanya bila client minta | **Menunggu client** |
| D3 | Definisi "nilai rupiah" | Tampilkan dua: *nilai langganan aktif (per bulan/tahun)* dan *total dibayar* | **Menunggu client** |
| D4 | Siapa yang boleh menandai internal | Admin dengan `users.manage`; tercatat di audit | Disarankan |
| D5 | Ekspor CSV: sinkron atau job queue (aturan root: export data lewat job) | Sinkron dengan batas baris (mis. ≤ 10.000) dan dicatat sebagai pengecualian sadar di ADR; di atas batas → job. Volume B2B kecil | **Menunggu user** |
| D6 | Permission `insights.view` baru atau pakai `users.view` | Baru, supaya staf bisa dibatasi dari data kontak | **Menunggu user** |
| D7 | Perlu "alasan" wajib pada putus koneksi? | Opsional di dialog, default `lainnya` | Disarankan |
| D8 | Log aktivitas user (189F) | Tunda | Disetujui (ditunda) |

ADR yang akan ditulis saat keputusan jatuh: **ADR-0044** (model pelanggan komersil/internal + data kontak) dan **ADR-0045** (design system admin, Fase 190).

## 10. Risiko & asumsi
- Data DEV tidak mewakili production (banyak sisa test: ±16 ribu user, ±2 ribu role admin). Angka nyata hanya dari SQL baseline production (`docs/phases/phase-189-sql-pack-baseline.md`) yang dijalankan user.
- Perkiraan skala (jumlah Data Usaha production) menentukan perlu tidaknya index/agregasi tambahan; hasil baseline menentukan.
- Kohort retensi baru bermakna setelah ≥ 2 siklus; tahun ke-2 baru terisi 2027. UI harus menampilkan keadaan kosong dengan jujur.
- Pelanggan dengan banyak Data Usaha bisa dihitung ganda bila salah memilih satuan (D1) — rumus menghitung `DISTINCT user_id` untuk "pelanggan".
- Perubahan kolom `user` memengaruhi Better Auth; wajib diuji alur daftar email, Google, dan invite User Tambahan setelah migrasi.

## 11. Pengujian
- Fungsi murni `admin-insights.ts`: data sintetis (aktif pada tanggal t, kohort, normalisasi nilai, internal dikecualikan dari rupiah, sel kohort kosong).
- Route: pola delta before/after (DB dev bersama), uji permission (tanpa izin → 403), uji paginasi, uji CSV injection, uji audit log ekspor.
- Seat admin: tak bisa cabut seat Data Usaha lain; sesi member dicabut; notifikasi pemilik.
- Web: komponen tabel/filter dengan Testing Library; keadaan kosong, angka sembilan digit, persen negatif.
- Bersihkan baris test di DB dev setelah `bun run test` (DB dev dipakai bersama).

## 12. Referensi
- Kebutuhan: `docs/referencehtml/facport/masukan-client-12-oct.xlsx`
- Dashboard & rumus yang ada: `docs/architecture/architecture-admin-dashboard.md`
- Langganan & seat: `architecture-subscription.md`, `architecture-user-tambahan.md`
- Peran & permission: `architecture-user-roles.md`, `architecture-auth.md`
- Koneksi Accurate: `architecture-accurate-connect-gate.md`, ADR-0036/0037
- Baseline data production: `docs/phases/phase-189-sql-pack-baseline.md`
- Rencana fase: `docs/phases/phase-189-insight-pelanggan-admin.md`
