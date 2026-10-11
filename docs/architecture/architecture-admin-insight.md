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
| **Data Usaha** | Workspace Accurate (`data_usaha`); langganan, koneksi Accurate, dan seat menempel di sini. Satu akun bisa punya banyak. **BUKAN** "nama perusahaan" akun dan TIDAK menyimpan nomor telepon pelanggan. |
| **Nama Perusahaan (akun)** | Isian milik **AKUN** (`user.company_name`), diisi pengguna sendiri saat daftar/lengkapi profil. Terpisah total dari Data Usaha: tidak diturunkan dari nama Data Usaha dan tidak mengubahnya. Dipakai untuk kontak (butir 8). |
| **Telepon / WhatsApp (akun)** | Milik AKUN manusia (`user.phone`, `user.whatsapp`), berlaku untuk akun utama maupun User Tambahan. Bukan milik Data Usaha. |
| **Fitur** | Satu langganan modul aktif (`subscriptions` → `plans.modules`, 1 SKU = 1 sub-modul) pada sebuah Data Usaha. |
| **Akses** | Orang yang bisa masuk ke Data Usaha: pemilik + User Tambahan (`member_seats`, status `active`/`invited`). |
| **Komersil** | DEFAULT setiap akun customer yang TIDAK ditandai internal. Ditentukan oleh **status akun**, bukan status langganan: pengguna trial tetap komersil. Nilai rupiah = total uang yang sudah dibayar (D3). |
| **Internal** | Akun yang ditandai admin sebagai internal — Trainer, Karyawan, Mitra (Excel client: "Trainer, mitra, dll"). Tidak butuh invoice berlangganan; statusnya berlaku sampai admin mencabut tanda itu. Client hanya perlu jumlahnya, jadi cukup SATU flag (`user.is_internal`); subkategori Trainer/Karyawan/Mitra ditunda (YAGNI). Tidak ada nilai rupiah. |

## 3. Pemetaan 9 butir kebutuhan

Legenda kesiapan: **Siap** = data sudah ada, tinggal endpoint+halaman · **Gap data** = perlu skema/pencatatan baru · **Gap fitur** = perlu aksi baru.

| # | Kebutuhan client | Sumber data sekarang | Kesiapan | Yang perlu dibuat |
|---|---|---|---|---|
| 1 | Jumlah pengguna komersil vs internal; nilai rupiah fitur hanya untuk komersil | Role `customer`; tidak ada penanda internal; pembayaran di invoice/order | **Gap data** | Kolom `user.is_internal`; admin menandai di halaman Pengguna; KPI komersil/internal; nilai rupiah = **total terbayar** akun komersil (D3, diputuskan) |
| 2 | Pengguna per fitur (nama pelanggan per modul) | `subscriptions` active → `plans.modules` → `data_usaha` → `user` | **Siap** | Endpoint `by-feature` + tampilan daftar per fitur |
| 3 | Fitur per pengguna | Sama (dibalik). Sebagian sudah di `/admin/users/[id]` | **Siap** | Endpoint `by-customer` (ringkas: daftar fitur + jumlah) |
| 4 | Jumlah & nama akses per pelanggan (email utama + User Tambahan); eliminasi/mutasi akses | `member_seats` (`member_user_id`, `invited_email`, `status`, `revoked_*`) | **Siap (lihat)** + **Gap fitur (aksi)** | Endpoint `access`; aksi admin **cabut seat** dan **pindahkan akses** (saat ini revoke hanya lewat `team.route.ts` sisi pemilik) |
| 5 | Pelanggan baru per tanggal + fiturnya | `subscriptions.start_at/created_at`, `user.created_at` | **Siap** | Endpoint `new-customers?from&to` |
| 6 | Pelanggan yang akan berakhir + fiturnya | `subscriptions.end_at` (H-7 sudah diingatkan ke pelanggan, belum ada tampilan untuk FAC) | **Siap** | Endpoint `expiring?window=14|30` (hanya dua preset: 14 dan 30 hari, diputuskan user 2026-10-12) |
| 7 | Kohort pelanggan tahun ke-1, ke-2, …; retensi | `subscriptions` + `subscription_renewals` (tidak dihapus job purge) | **Siap (hitung)**, data baru sejak 2026-09 | Endpoint `trend` (grafik, filter tahun) + `tenure` (tabel per bulan menurut usia langganan); tahun ke-2 baru terisi 2027 |
| 8 | Nama, email, telepon, perusahaan | `user.name/email` saja; telepon & nama perusahaan tidak ada (hanya `company.phone` di settings = telepon FAC, bukan pelanggan) | **Gap data** | Kolom di AKUN: `user.phone`, `user.whatsapp`, `user.company_name`; diisi saat daftar, dan modal wajib tak bisa ditutup untuk akun yang masih kosong (Google & user lama); standar nomor E.164 dari Jalajogja |
| 9 | Riwayat pemutusan koneksi oleh admin (salah → putus → benar) | `audit_logs` `entity_type='data_usaha'`, `action='disconnect_accurate'` (sudah memuat DB lama, alias, `removedAccount`, admin) | **Gap data** (setengah) | Catat juga sisi *sambung/pilih database* + `alasan` pada dialog putus; endpoint riwayat per Data Usaha |

## 4. Gap skema & pencatatan (perubahan data)

### 4.1 Profil pelanggan (butir 1, 8)
Tambah di `user` (migrasi Drizzle, `docs/architecture/architecture-database.md`):
- `is_internal boolean not null default false`
- `phone varchar(20)` dan `whatsapp varchar(20)` nullable — format baku **E.164 dengan tanda `+`** (mis. `+6281234567890`), mengikuti standar project Jalajogja (`/Users/webane/sites/jalajogja/docs/arsitektur-kontak.md`): satu komponen (`PhoneInput`: pemilih kode negara, default +62, keluaran E.164), satu helper (`normalizePhone()` WAJIB di server saat simpan; `displayPhone()` untuk tampilan `08xx`; `toWaDigits()` untuk tautan `wa.me`, dibangun dari nilai E.164 ASLI, bukan dari hasil `displayPhone()` — bug yang pernah terjadi di Jalajogja), satu format. Port `components/ui/phone-input.tsx` + `lib/phone.ts` dari Jalajogja ke `apps/web`; `normalizePhone` juga di API sebagai pertahanan berlapis. Isian WhatsApp punya opsi "Sama dengan nomor telepon" (kolom `whatsapp` tetap diisi nilainya).
- ⚠ `customer_care_agents.whatsapp_number` (Fase 46) memakai format lain (`628…` tanpa `+`). Dibiarkan, tidak dimigrasi; bila perlu tautan, lewat `toWaDigits()`.
- `company_name varchar(200)` nullable — **nama perusahaan milik AKUN**, diisi pengguna (bukan diturunkan dari Data Usaha). Label UI "Nama Perusahaan"; jangan dicampur dengan menu/konsep Data Usaha.

Catatan penting:
- `user` dikelola Better Auth. Kolom `disabled` sudah pernah ditambahkan sebagai field custom (§ `auth.schema.ts`) → ikuti pola itu;
  **verifikasi** apakah perlu `additionalFields` agar `signUpEmail` menerima `phone/companyName`. Jangan tebak — cek instalasi (pola Fase 106).
- **Alur pengisian (diputuskan user 2026-10-12; koreksi atas persepsi awal):** nama perusahaan, telepon, dan WhatsApp adalah data AKUN dan WAJIB. TIDAK ada pemblokiran akses dan TIDAK ada pengumuman/masa tenggang khusus.
  1. Daftar email+password → form daftar menambah Nama Perusahaan, Telepon, WhatsApp (centang "Sama dengan nomor telepon").
  2. Akun yang masih kosong (Google, user lama, akun tambahan hasil undangan) → otomatis tampil **satu halaman/modal Lengkapi Profil yang tidak bisa ditutup** sampai Nama Perusahaan dan Telepon (+WhatsApp) terisi. Hanya itu; tidak ada pengalihan berulang, kolom penanda, atau notifikasi tambahan.
  3. Berlaku untuk akun berperan customer (pemilik dan User Tambahan). Admin/staf (Tim Internal) dikecualikan. Penegakan di lapisan tampilan web, bukan 403 di API, sehingga import yang berjalan tidak terganggu.
  Diputuskan user 2026-10-12: SEMUA akun customer (pemilik maupun User Tambahan) wajib mengisi ketiganya, tanpa pengecualian. Belum dikonfirmasi: apakah admin/staf (Tim Internal) ikut (asumsi: tidak).
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

### 4.4 Satu akun, dua role (diputuskan user 2026-10-12: "1 email boleh 2 role bila dibutuhkan")
- Fakta kode: email unik di Better Auth (1 email = 1 akun) dan `user_roles` (PK `userId+roleId`) mengizinkan banyak role per akun. Layout `app.` mensyaratkan role `customer` (`app/app/(protected)/layout.tsx`); admin hanya perlu `admin`/`staff`. Jadi secara teknis admin yang juga customer BISA, tetapi hari ini tidak ada cara memberi role itu: daftar ulang dengan email yang sama ditolak (duplikat) dan akun admin tidak otomatis ber-role customer.
- Rancangan dua arah (hanya Super Admin = `users.manage`, tiap aksi tercatat di `audit_logs`):
  - **Aktifkan akses pengguna** (admin/staf → customer): memberi role `customer` pada akun yang sudah ada.
  - **Jadikan admin / Cabut role admin** (customer → admin/staf, dan kebalikannya): memberi atau mencabut role `admin` (Super Admin) / `staff` (Admin) pada akun yang sudah ada, tanpa membuat akun baru dan tanpa mengubah kata sandinya. Hari ini mustahil: `POST /admin/staff` selalu membuat akun BARU dan email yang sudah ada ditolak (`EMAIL_ALREADY_EXISTS`).
  - Pengaman: konfirmasi ketik (ini kenaikan hak akses = risiko eskalasi hak), notifikasi email ke akun yang diangkat/dicabut, tidak bisa mengubah role diri sendiri, tidak bisa mencabut Super Admin terakhir, dan ringkasan dampak sebelum eksekusi.
  - Ringkasan dampak untuk pengangkatan customer → admin: jumlah langganan berbayar aktif yang dimiliki, Data Usaha miliknya, dan total uang terbayar yang akan keluar dari laporan (akun jadi internal otomatis). Tagihan perpanjangan terjadwal untuk langganan berbayar akun itu akan diblokir (kontrol keuangan Lapis 1) — Super Admin diperingatkan agar sengaja memutuskan (mis. langganan dialihkan/ditutup lebih dulu).
- Dampak laporan (**D16 diputuskan user 2026-10-12**): akun yang memegang role `admin`/`staff` dihitung **internal otomatis** di semua laporan, tanpa flag manual — baik admin yang kemudian jadi customer maupun customer yang diangkat jadi admin. `is_internal` tetap untuk akun customer biasa (trainer, mitra). Rumus: internal = `is_internal` ATAU punya role `admin`/`staff`. Konsekuensi: pengangkatan ke admin menghapus riwayat uang akun itu dari laporan (peringatan di atas).

### 4.5 Aksi massal & kebijakan hapus akun (ADR-0045)
- Detail keputusan dan alasan: `docs/decisions/adr-0045-kebijakan-hapus-dan-anonimisasi-akun.md`. Ringkas: Nonaktifkan/Aktifkan (ada) · Hapus permanen hanya untuk akun tanpa jejak bisnis · Anonimisasi untuk akun dengan jejak bisnis yang harus dihapus · semua Super Admin saja, konfirmasi ketik, audit per akun.
- Alasan tidak ada "hapus total semua": `user.id` direferensikan 28 kolom di 16 file skema, hanya `session`/`account`/`user_roles` yang cascade; menghapus invoice/order merusak angka keuangan yang diminta client.
- **Dari audit keamanan 189A:** `audit_logs` menyimpan kontak lama→baru (PII) dari koreksi admin. Hapus permanen/anonimisasi (189H) WAJIB juga menangani `audit_logs` yang memuat kontak akun itu (anonimkan isi `changes`), bukan hanya tabel `user`.
- Dikerjakan sebagai sub-fase 189H (setelah Insight), bukan bersama 189G, karena risikonya jauh lebih tinggi.

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
| `GET /admin/insights/expiring?window=14|30` | langganan akan berakhir + fiturnya + status perpanjangan terjadwal | 6 |
| `GET /admin/insights/trend?year=&metric=` | tren bulanan untuk SATU tahun (12 bulan): nilai per bulan, selisih & % terhadap bulan sebelumnya; `metric` = pengguna terdaftar · pelanggan berlangganan aktif · pelanggan baru · pelanggan berhenti · uang terbayar | 5, 7, uang |
| `GET /admin/insights/tenure?month=` | rincian bulan itu menurut usia langganan: Baru / Tahun ke-2 / Tahun ke-3… (+ yang berhenti) | 7 |
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
- **Habis / aktif (standar baku, diverifikasi di kode 2026-10-12):** langganan *habis* tepat saat `end_at` lewat — job `EXPIRE_SUBSCRIPTIONS` (tiap 10 menit, `job-schedules.ts`) mengubah status ke `expired`; tagihan perpanjangan terbit H-7 (ADR-0042 butir b: "jatuh tempo = tanggal berakhir, tanpa masa tenggang"). **Tidak ada jeda toleransi tambahan di laporan.** Aktif pada tanggal t = ada langganan modul non-trial, bukan `cancelled`, dengan `start_at ≤ t < end_at`. Trial dan seat_addon TIDAK dihitung sebagai "fitur" pelanggan (seat dihitung terpisah sebagai akses).
- **Kohort**: bulan langganan berbayar pertama (non-trial, akun bukan internal) per pelanggan. "Tidak melanjutkan" = tidak ada langganan berbayar aktif sesudah `end_at` (aturan di atas, tanpa toleransi). Pengukuran retensi per **bulan kalender**: pelanggan dihitung aktif di bulan M bila ada langganan berbayar yang masa berlakunya menyentuh bulan M — ini resolusi pengukuran, BUKAN jeda toleransi status (konfirmasi user). Sel yang belum tercapai = kosong, bukan 0%.
- **Nilai rupiah (D3, diputuskan 2026-10-12)** = **total uang yang sudah dibayar** akun komersil, dari invoice/order berstatus lunas (verifikasi nama status di `architecture-invoice.md` saat eksekusi, jangan menebak). Akun internal tidak dihitung. Nilai langganan aktif per bulan TIDAK dibuat (tidak diminta, hindari melebar).
- **Perhatian**: `end_at` bisa diubah manual admin (Fase 173–180, quick-extend) — riwayat kohort mengikuti nilai terkini, bukan nilai asli; dicatat sebagai keterbatasan.

### 5.2 Grafik tren tahunan (diputuskan user 2026-10-12)
- Chart bulanan yang sudah ada (12 bulan bergulir, Fase 59) TETAP; ditambah **filter tahun**: pilih 2026 → 12 bulan 2026; pilih 2027 → 12 bulan 2027. Pilihan tahun diambil dari tahun yang punya data. Default = 12 bulan terakhir (perilaku sekarang).
- Tiap bulan menampilkan: jumlah bulan itu, bulan sebelumnya, selisih, dan % kenaikan (pola `computeGrowthPercent`, hindari ∞/NaN bila bulan sebelumnya 0). Berlaku untuk pelanggan DAN uang.
- **Aktif di bulan M** = ada langganan berbayar yang masa berlakunya menyentuh bulan M, termasuk pelanggan yang bulan M adalah bulan aktif TERAKHIR mereka (diputuskan user: "bahkan ketika bulan itu terakhir kali aktif"). Tanpa jeda toleransi status (lihat § 5.1).
- **Uang** = total terbayar per bulan (invoice `paid`, bulan dari `paid_at` menurut zona waktu perusahaan), akun internal dikecualikan; dua baris terpisah: *Terbayar terverifikasi* dan *Dilunasi admin* (D11).
- Rumus murni di `lib/admin-insights.ts` (diuji dengan data sintetis, termasuk bulan kosong dan lompat tahun); endpoint hanya mengambil data mentah.

### 5.3 Konvensi tabel & aksi cepat
- Tabel Insight WAJIB memakai `DataTable` + `createDataTableColumns` yang ada (gaya sama dengan `/admin/users`), paginasi server-side (`offset`/`limit`), kolom sedikit dan tidak melebar ke samping. Detail lengkap TIDAK dijejalkan sebagai kolom: baris punya tombol **Lihat** yang membuka panel/dialog detail (komponen `dialog.tsx` yang ada).
- **Tombol WhatsApp** di baris tabel dan di halaman detail user (`/admin/users/[id]`): tautan `https://wa.me/<toWaDigits(E.164 asli)>`, buka di tab baru (WhatsApp Web/Desktop). Nomor juga ditampilkan di detail user dan bisa diklik. Tautan SELALU dibangun dari nilai E.164 asli, bukan dari hasil `displayPhone()` (bug Jalajogja).
- Kolom kontak (telepon, WhatsApp, Nama Perusahaan) juga muncul di daftar Pengguna dan detail user.

### 5.4 Aksi massal di `/admin/users`
- Tabel Pengguna mendapat pilihan baris (kotak centang) + bilah aksi massal. `DataTable` sekarang TIDAK punya seleksi baris → ditambah sebagai fitur opsional (aditif, tidak mengubah halaman lain).
- Aksi massal (hanya Super Admin): **Tandai internal / Cabut tanda internal** (189G); **Nonaktifkan / Aktifkan**, **Hapus permanen (aman)**, **Anonimisasi** (189H, ADR-0045). Cakupan seleksi = baris pada halaman yang tampil (≤ 100); "pilih semua hasil filter" ditunda. Tiap perubahan tercatat per akun di `audit_logs`.
- Peringatan wajib: menandai internal akun yang sudah punya invoice lunas → riwayatnya otomatis keluar dari laporan uang.

## 6. Informasi arsitektur halaman (konsep; visual → Fase 190)
Satu area **"Insight"** di sidebar admin, `/admin/insight`, dengan tab:
1. **Ringkasan** — KPI komersil vs internal, nilai, langganan aktif/segera berakhir, koneksi bermasalah.
2. **Pelanggan** — tabel + pencarian + filter tipe; detail ringkas (kontak, Data Usaha, fitur, akses). Tombol WhatsApp/telepon (`wa.me`) langsung dari baris.
3. **Fitur** — fitur → pelanggan pemakai.
4. **Akses** — pelanggan → pemilik + User Tambahan, dengan aksi cabut/mutasi (4.3).
5. **Langganan** — sub-tab *Baru* dan *Akan berakhir* (rentang tanggal, filter fitur).
6. **Tren & Retensi** — grafik bulanan dengan filter tahun (pelanggan aktif, baru, berhenti, uang; selisih dan % vs bulan lalu) + tabel per bulan menurut usia langganan (Baru / Tahun ke-2 / Tahun ke-3…). Bukan segitiga kohort klasik (P4, diputuskan user 2026-10-12).
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
| 189G | Akun internal & kontrol keuangan (D9 Lapis 1) + aksi massal tandai internal di `/admin/users` (seleksi baris `DataTable`) — dikerjakan SETELAH 189A dan SEBELUM 189C | 189A |
| 189B | Pencatatan koneksi (connect/select db + alasan putus) + aksi admin seat (cabut/mutasi) | — (bisa paralel 189A) |
| 189C | API Insight read-only + fungsi murni + tes + index | 189A (kolom), 189B (event) |
| 189D | Halaman Insight fungsional (komponen yang ada) + ekspor CSV | 189C |
| 189E | Dashboard `/admin`: KPI komersil/internal & nilai rupiah | 189C |
| 189F | (Opsional) Log aktivitas user | keputusan terpisah |
| 189H | Aksi massal pengguna: nonaktifkan/aktifkan, hapus permanen aman, anonimisasi (ADR-0045) + aksi role dua arah Super Admin: "Aktifkan akses pengguna", "Jadikan admin"/"Cabut role admin" (§ 4.4) | 189G; audit keamanan penuh |
| **190** | Riset & desain UI → design system admin → redesign dashboard & Insight (arah "Kompak & tajam", admin dulu, pelanggan menyusul) | 189D (agar ada layar nyata untuk di-redesign) |
| 191 | Hibah Akses Internal (D9 Lapis 2): langganan gratis tanpa tanggal akhir, "beri semua fitur", notifikasi kedaluwarsa dimatikan untuk internal | 189G + hasil SQL P11 |

**Urutan eksekusi (keputusan teknis, disetujui user 2026-10-12 "keputusan teknis kamu"):**
1. Persetujuan ADR-0044/0045 + dokumen ini (gerbang SOP — tidak ada kode sebelum disetujui).
2. **189A** — profil akun (kolom, `PhoneInput`, form daftar, modal). Paling awal: data kontak baru terkumpul SETELAH ini live, dan fondasi tabel `user` dipakai fase lain.
3. **189G** — penanda internal + kontrol keuangan + aksi massal tandai internal.
4. **189B** — pencatatan sambung koneksi + alasan putus (bebas, dengan saran) + aksi admin cabut seat (alasan wajib).
5. **189C → 189D → 189E** — API Insight, halaman Insight (tabel `DataTable`, tombol Lihat, tombol WhatsApp), tren tahunan di dashboard. Butuh D1 dan hasil SQL baseline.
6. **189H** — aksi massal pengguna (hapus/anonimisasi) + akses pengguna untuk admin.
7. **Fase 190** (redesign UI admin) → **Fase 191** (hibah akses internal). Fase 188 (Hapus Massal Accurate) ditunda sesuai keputusan user.
Tiap sub-fase: rencana detail di phase doc sendiri → kode → typecheck + lint → tes → security review → tutup dokumen → commit+push `develop` (rilis HANYA atas permintaan eksplisit user).

Rilis: commit+push `develop` per sub-fase; release HANYA bila user meminta eksplisit (aturan berjalan). 189A sebaiknya dirilis lebih awal dari yang lain karena data telepon/perusahaan baru terkumpul SETELAH form berubah.

## 9. Keputusan (D) — status
| ID | Pertanyaan | Rekomendasi | Status |
|---|---|---|---|
| D1 | "Pelanggan" = akun pemilik atau Data Usaha? | Akun pemilik sebagai baris utama, Data Usaha sebagai anak (tab Akses/Fitur per Data Usaha, karena seat & langganan menempel di Data Usaha) | **Menunggu user** |
| D2 | Telepon, WhatsApp, Nama Perusahaan wajib? | Wajib; modal tak bisa ditutup untuk akun yang masih kosong; tanpa pemblokiran akses (§ 4.1) | **Diputuskan user 2026-10-12** |
| D3 | Definisi "nilai rupiah" | Total uang yang sudah dibayar (akun komersil saja) | **Diputuskan user 2026-10-12** |
| D4 | Siapa yang menandai internal & arti flag | Admin (`users.manage`), tercatat di audit. Flag = label status akun untuk laporan; komersil = default | **Diputuskan user 2026-10-12**; sisa: apakah flag mengubah AKSES (D9) |
| D5 | Ekspor CSV: sinkron atau job queue | Unduh langsung, batas baris (mis. ≤ 10.000), ringan; dicatat sebagai pengecualian sadar atas aturan root di ADR | **Diputuskan user 2026-10-12** ("ikut saran, selama ringan") |
| D6 | Izin lihat Insight | Izin baru `insights.view` diberikan ke **Super Admin (role `admin`) DAN Admin (role `staff`)** — sama seperti `users.view` yang sudah memperlihatkan email pelanggan ke keduanya; otomatis lewat pola EXCLUDE-list `seed.ts`. Aksi mengubah (tandai internal, aksi massal) tetap `users.manage` = Super Admin saja; cabut akses seat = `subscriptions.manage` | **Disarankan; user bilang "ikut saran" — menunggu konfirmasi akhir** |
| D7 | Alasan saat admin mencabut/memindah akses | Alasan WAJIB (min. beberapa karakter) dicatat di `audit_logs` (`entity_type='member_seat'`, `action='revoke_seat'`, `changes`: alasan, email, Data Usaha, admin) → jadi riwayat bila akses ditambahkan lagi kelak | **Diputuskan user 2026-10-12** |
| D8 | Log aktivitas user (189F) | Tunda | Disetujui (ditunda) |
| D9 | Flag internal & akses | Dibagi dua: **Lapis 1** (189G): laporan uang mengecualikan internal; invoice/checkout/tagihan otomatis diblokir untuk internal; akses internal hanya mode gratis. **Lapis 2** (Fase 191): hibah akses tanpa tanggal akhir, setelah Insight | **Diputuskan user 2026-10-12** |
| D10 | Alasan saat admin memutus koneksi | Teks bebas, opsional, dengan saran pilihan cepat (salah database / salah akun Accurate / lainnya) | **Diputuskan user 2026-10-12** |
| D11 | Dua baris uang | *Terbayar terverifikasi* vs *Dilunasi admin* (`paid_invoice`) dipisah | **Diputuskan user 2026-10-12** |
| D12 | Satuan "pengguna" | Semua akun manusia (pemilik + User Tambahan), dengan rincian pemilik/tambahan | **Diputuskan user 2026-10-12** |
| D13 | Awal berlangganan (butir 5) | Dari langganan BERBAYAR pertama (bukan tanggal daftar, bukan trial) | **Diputuskan user 2026-10-12** |
| D14 | Daftar "akan berakhir" | Dua preset 14 dan 30 hari; kolom status tagihan perpanjangan (belum terbit/terbit/lunas); tabel ringkas + tombol Lihat + tombol WhatsApp | **Diputuskan user 2026-10-12** |
| D15 | Notifikasi cabut/pindah akses | Ke pemilik Data Usaha saja | **Diputuskan user 2026-10-12** |
| D16 | Akun ber-role admin/staf dihitung internal otomatis di laporan | Ya | **Diputuskan user 2026-10-12** |
| D17 | Akun ber-role ganda / promosi akun | Dua arah, Super Admin saja: "Aktifkan akses pengguna" (admin→customer) dan "Jadikan admin/Cabut role admin" (customer↔admin/staf), dengan konfirmasi ketik, email pemberitahuan, audit, ringkasan dampak (§ 4.4) | **Diputuskan arah oleh user 2026-10-12** |
| D18 | Hapus akun | Tiga tingkat (nonaktifkan / hapus permanen tanpa jejak bisnis / anonimisasi) — ADR-0045 | **Menunggu user (Proposed)** |
| D19 | Metrik grafik tren | 5 metrik: pengguna terdaftar, pelanggan berlangganan aktif, baru, berhenti, uang terbayar; evaluasi kemudian | **Diputuskan user 2026-10-12** |
| D20 | Admin/staf Tim Internal dikecualikan dari modal Lengkapi Profil | Ya, kecuali saat membuka `app.` sebagai ber-role ganda | **Diputuskan user 2026-10-12** |

ADR terkait: **ADR-0044** (data kontak akun, penanda internal, kontrol keuangan; Proposed), **ADR-0045** (kebijakan hapus/anonimisasi akun; Proposed), **ADR-0046** (design system admin, Fase 190; belum ditulis).

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
