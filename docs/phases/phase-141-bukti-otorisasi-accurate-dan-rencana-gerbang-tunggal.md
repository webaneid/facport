# Fase 141 — Bukti Perilaku Otorisasi Accurate + Rencana Gerbang Otorisasi Tunggal

**Status:** Done (percobaan E0–E8 + pemeriksaan production P1–P3 selesai 2026-09-22 → ADR-0036 Accepted)
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Sebelum mengubah model koneksi, BUKTIKAN perilaku Accurate yang tidak
didokumentasikan resmi, lalu tetapkan ADR untuk dua hal yang saling
bergantung: (1) model koneksi 1-per-Data-Usaha dengan SEMUA scope, (2)
mesin scope tunggal yang otomatis mendeteksi scope belum terotorisasi
saat sub-modul baru ditambah (sekarang 18 modul live, target 21+).

## Latar (fakta terbukti, 2026-09-22)
- Alur sekarang memaksa koneksi per subscription (UI: "Hubungkan tiap
  fitur langganan"); callback OAuth selalu `INSERT` koneksi baru dengan scope
  satu modul → 15 koneksi/2 perusahaan pada customer nyata.
- `/accurate/reuse` TIDAK mengecek scope; tabel `accurate_connections` tidak
  menyimpan scope; respons token (`scope`, `user`) dibuang.
- Spec resmi memetakan 322/333 operasi → scope (kebutuhan scope bisa
  diturunkan otomatis). Kode memanggil 30 endpoint data.
- Bug laten kandidat: `purchase-invoice/delete.do` dipanggil (Batal Import)
  tapi scope `purchase_invoice_delete` tidak diminta modul mana pun.
- Dokumentasi resmi (accurate.id/api-integration/oauth/) TIDAK menjelaskan:
  otorisasi ulang, apakah token baru membatalkan token lama, rotasi refresh
  token, pencabutan, `approved-scope.do`.
- Penyebab 401 Pak Untung (token 3 hari ditolak) BELUM terbukti.

## Prasyarat (dari user)
- Ekstensi Chrome tersambung ke akun utama (login FAC Kurikulum di portal
  developer Accurate sudah aktif di browser itu).
- Izin eksplisit di chat SEBELUM tiap persetujuan OAuth (klik "Beri Akses").
- Redirect URI dev `http://localhost:3001/accurate/oauth/callback` terdaftar
  di aplikasi Accurate kita (dicek di E0); port 3001 kosong saat percobaan.

## Protokol Percobaan (akun Accurate DEV saja, TIDAK menyentuh token/DB customer)
Skrip sekali pakai di direktori scratchpad (bukan repo): server lokal kecil
menangkap `code` di redirect URI, menukar token, menyimpan token di file
scratchpad (TIDAK pernah dicetak/di-log), dihapus setelah selesai.

| # | Percobaan | Yang dicatat | Menjawab |
|---|---|---|---|
| E0 | Portal developer (baca saja): halaman Aplikasi | scope terdaftar, redirect URI, pengaturan token | Apakah 34+ scope boleh diminta? |
| E1 | Otorisasi 1 dengan scope set A (1 modul) | field respons token (`scope`, `user`, `expires_in`); `approved-scope.do`, `auth-info.do`, `userinfo.do`; `db-list.do`, `open-db.do` | Isi `scope`/`user`; kecocokan `approved-scope.do` |
| E2 | Otorisasi 2, akun Accurate SAMA, scope set B | apakah layar persetujuan muncul lagi; uji ulang token 1 (`open-db`, `approved-scope`) | Apakah token baru membatalkan token lama? (akar 401) |
| E3 | Otorisasi 3 dengan SEMUA scope (34) | diterima/ditolak; scope yang diberikan; token 1 & 2 masih hidup? | Kelayakan "semua scope"; dampak ke token lama |
| E4 | Refresh token pada token 3 | token baru; akses lama & refresh lama masih berlaku? pakai ulang refresh lama? | Rotasi/sekali-pakai (kunci job refresh harian) |
| E5 | 1 token → 2 database (jika akun dev punya ≥2) | `open-db` ke keduanya | Apakah 1 koneksi bisa melayani >1 Data Usaha |
| E6 | Token scope sempit memanggil endpoint yang butuh scope lain | status HTTP + bentuk body error | Rancangan deteksi `ACCURATE_SCOPE_MISSING` (403 vs pesan) |
| E7 | Login manual ke web Accurate dengan user yang sama, lalu uji ulang token | token masih hidup? | Hipotesis "login manual mematikan token" (§ Fase 91) |
| E8 (opsional, perlu izin terpisah) | `*/delete.do` tanpa scope delete pada data uji | diterima/ditolak | Konfirmasi bug laten Batal Import |

Kriteria: setiap percobaan menghasilkan fakta tertulis (pass/fail + bukti
ringkas TANPA token) di bagian "Hasil" dokumen ini.

## Pemeriksaan Production (read-only, user-run, pola docker exec yang sudah terbukti)
- P1: riwayat batch vs koneksi lebih baru (query yang sudah diberikan) — menguji
  hipotesis pembatalan token di data nyata.
- P2: inventaris: jumlah customer, Data Usaha, baris koneksi, status koneksi
  (bahan strategi migrasi).
- P3: pemakaian Batal Import (baris `cancelled`, error 403 saat cancel).

## Rancangan yang Diuji (HASIL: ADR-0036 — model DIKOREKSI jadi 1-koneksi-per-AKUN-Accurate, bukan per Data Usaha; lihat `docs/decisions/adr-0036-koneksi-accurate-per-akun-dan-mesin-scope.md`)
1. **Model:** koneksi 1-per-Data-Usaha (pointer `data_usaha.accurate_connection_id`,
   kolom sudah ada & unik), `subscriptions.accurateConnectionId` dibekukan.
   BILA E2/E3 menunjukkan token baru mematikan token lama per akun Accurate →
   pisahkan: koneksi (token) per akun Accurate + `accurateDbId` di Data Usaha,
   Data Usaha kedua memakai token yang ada dan hanya memilih database.
2. **Mesin scope (3 lapisan):**
   - Deklarasi: modul mendeklarasikan endpoint Accurate di SATU registri;
     scope diturunkan dari snapshot spec resmi (file kecil di repo, dibuat
     ulang oleh 1 skrip dari spec publik).
   - Otorisasi: 1 endpoint "hubungkan/perbarui izin", selalu meminta gabungan
     SEMUA scope katalog, memperbarui baris koneksi yang sama (tidak pernah
     `INSERT`), menyimpan `grantedScopes` + identitas akun Accurate.
   - Verifikasi: 1 fungsi `missingScopes(koneksi, modul)` dipakai di
     `/accurate/reuse`, sebelum import dijadwalkan (`ACCURATE_SCOPE_MISSING`),
     pemeriksaan awal worker, dan status UI ("Perbarui izin").
   - Pengaman CI: tiap endpoint di kode terdaftar di ≥1 modul; tiap scope
     valid menurut snapshot; registri = katalog modul.
3. **Transfer kepemilikan:** koneksi diputus; pemilik baru menghubungkan ulang.
4. **Satu database Accurate ↔ satu Data Usaha** per owner.
5. **Dokumentasi modul baru:** langkah baru di checklist § 3b
   `architecture-accurate-integration.md` (deklarasi endpoint di 1 tempat, CI
   hijau, DILARANG membuat alur otorisasi/reconnect baru).

## Fase Lanjutan (urutan yang disarankan)
- **142 — Mesin scope (independen dari model koneksi, risiko rendah, nilai
  langsung):** snapshot + skrip sinkron, registri endpoint, tes CI, simpan
  `grantedScopes`/identitas akun, cek di `/accurate/reuse` & sebelum import,
  perbaiki scope `_delete` (jika E8/P3 mengonfirmasi).
- **143 — Model koneksi per Data Usaha (backend):** skema, callback in-place,
  semua scope, worker via Data Usaha, transfer memutus koneksi.
- **144 — Frontend:** langkah koneksi saat membuat Data Usaha, halaman koneksi
  per Data Usaha, status di /subscribe & dashboard, halaman admin.
- **145 — Migrasi & rollout:** skrip cek kesehatan (user-run), tandai legacy
  (tanpa hapus), banner "hubungkan ulang", runbook deploy Full.

## Referensi
- Fase 140 / ADR-0035 (gerbang Data Usaha) — tetap berlaku, ortogonal.
- `docs/architecture/architecture-accurate-integration.md` § 1, § 3b.
- `docs/decisions/adr-0019`, `adr-0020` (sebagian akan digantikan ADR-0036).

## Known Limitations (rencana)
- Percobaan hanya di akun DEV; perilaku akun customer (mis. role/hak akses
  Accurate per user) tidak bisa direplikasi penuh.
- Fase 140 belum di-release; keputusan release ditahan sampai bukti 401 jelas.

## Hasil (isi saat percobaan berjalan)

### E0 — Portal developer (2026-09-22) — PASS
- Chrome tersambung, login portal developer (FAC Kurikulum) aktif.
- Aplikasi terdaftar: 4turStok, Data Analyst, Sample, clientfac1, facport,
  facport local, facwebuat. Untuk percobaan dipakai `facport local`.
- `facport local` → tab OAuth: callback `http://localhost:3001/accurate/oauth/callback`
  sudah terdaftar (prasyarat terpenuhi); Platform Website `http://localhost:6209`.
- Dashboard app: "dapat tersambung ke semua database Accurate Online lewat
  API Token atau OAuth" — TIDAK ada pengaturan scope/token di sisi aplikasi;
  scope diminta saat otorisasi (menyokong rancangan "minta semua scope",
  tapi diterima/tidaknya 34 scope tetap harus dibuktikan di E3).
- Halaman "Daftar API" (`api-docs.do`) 1,2 MB, dirender JS; tidak terbaca
  oleh ekstraktor teks. Untuk peta scope pakai spec resmi (Fase 142).

### E1 — Otorisasi 1, scope set A (`purchase_invoice`, 8 scope) — PASS (2026-09-22)
- Layar persetujuan tampil (aplikasi "facport local (FAC)"); redirect kembali
  dengan `code`+`state`; token exchange HTTP 200.
- Respons token: `access_token`, `refresh_token`, `token_type`,
  `expires_in` = 1.295.999 dtk (~15 hari), **`scope`** (spasi-terpisah, persis
  8 scope yang diminta), **`user`** `{id, name, nickname, email, referrer, mobile}`.
  → `grantedScopes` + identitas akun Accurate BISA disimpan dari respons token
  (sekarang dibuang).
- `approved-scope.do` (Bearer) → `d` = array 8 scope, IDENTIK dengan `scope` token
  → bisa dipakai verifikasi sisi server.
- `auth-info.do` & `userinfo.do` → identitas user (id 60245).
- `db-list.do` → 2 database di akun DEV (1 trial kedaluwarsa, 1 sample "Retail
  Demo"); tiap item punya `id`, `alias`, `dataAccessType`, `admin`. E5 layak.
- `open-db.do?id=` → `host`, `session`, `dataVersion`, `licenseEnd`.

### E6 — Endpoint di luar scope token — PASS (2026-09-22)
- Token t1 (scope purchase_invoice) → `purchase-invoice/list.do` HTTP 200 (kontrol).
- `sales-invoice/list.do`, `sales-order/list.do` → **HTTP 403**, body **XML** (bukan
  envelope `{s,d}`): `<InsufficientScopeException><error>insufficient_scope</error>
  ...<scope>sales_invoice_view</scope>`. Nama scope yang kurang ikut disebut.
  → Rancangan deteksi `ACCURATE_SCOPE_MISSING`: 403 + `insufficient_scope`,
  parse `<scope>` (jangan `res.json()` — akan gagal parse).

### E5 — 1 token → 2 database — SEBAGIAN (2026-09-22)
- `db-list.do` dengan token t1 mengembalikan KEDUA database akun → token terikat ke
  AKUN Accurate + aplikasi, bukan ke satu database; database dipilih per-panggilan
  lewat `open-db.do?id=`.
- Database "Retail Demo" terbuka & terpanggil normal. Database "Test Facport" tidak
  bisa dibuka: HTTP 500 `s:false` "Masa ujicoba ... sudah berakhir" (trial kedaluwarsa
  — bukan masalah token). Jadi "1 token melayani 2 database aktif" belum
  terbukti penuh (akun DEV cuma punya 1 database aktif); bukti struktural kuat.
- Catatan: `open-db.do` gagal punya bentuk `{s:false,d:[pesan]}` dengan HTTP 500.

### E2 — Otorisasi 2, akun SAMA, scope set B (`sales_invoice`) — TERBUKTI (2026-09-22)
- Layar persetujuan MUNCUL LAGI (akun sama, aplikasi sama, tanpa "ingat pilihan").
- Token 2: HTTP 200, `scope` = HANYA set B (8 scope sales_invoice); TIDAK kumulatif
  dengan set A.
- **Token 1 langsung MATI:** `approved-scope.do` → HTTP 401 `invalid_token`;
  refresh token 1 → HTTP 400 `invalid_grant` ("Invalid refresh token"). Token 2
  tetap hidup dan tidak terpengaruh percobaan refresh token 1.
- Token 2 memanggil `sales-invoice/list.do` 200, tetapi `purchase-invoice/list.do`
  403 `insufficient_scope` (scope set A hilang).
- **KESIMPULAN (akar 401 + cacat desain terbukti):** untuk 1 akun Accurate × 1
  aplikasi, hanya SATU otorisasi yang hidup. Setiap otorisasi baru (mis. tiap
  subscription modul baru = koneksi baru) MEMBATALKAN token+refresh token
  sebelumnya dan MENGGANTI seluruh scope. Model "koneksi per subscription"
  (15 koneksi/2 perusahaan) menghasilkan koneksi lama yang sudah mati diam-diam.
  → Model koneksi WAJIB "1 koneksi per AKUN Accurate" (bukan per Data Usaha/modul)
  dan SELALU meminta gabungan SEMUA scope; otorisasi ulang = memperbarui baris
  yang sama. (Kalau 1 owner punya >1 akun Accurate, tiap akun = 1 koneksi.)

### E3 — Otorisasi 3, SEMUA scope katalog (34) — TERBUKTI (2026-09-22)
- Diminta 34 scope (gabungan `MODULE_ACCURATE_SCOPES`, URL ~850 char); layar
  persetujuan sama (tanpa daftar per-scope), token exchange 200, `scope` token &
  `approved-scope.do` = ke-34 scope (tidak ada yang ditolak/dipotong).
- Token 3 memanggil `purchase-invoice/list.do` DAN `sales-invoice/list.do` → 200
  (satu token melayani lintas modul).
- Token 1 & token 2 → 401 `invalid_token` (otorisasi baru mematikan yang lama,
  konsisten E2).
- → "Minta semua scope sekali" LAYAK. Catatan: 34 = scope yang dipakai kode hari ini;
  katalog resmi 222 scope — mesin scope (Fase 142) menurunkan daftar dari registri
  endpoint, bukan hardcode.

### E4 — Refresh token — TERBUKTI (2026-09-22)
- Refresh token 3 → HTTP 200, token baru; `expires_in` ~15 hari LAGI; scope
  TETAP sama (tidak menyusut).
- **Rotasi penuh:** access token & refresh token KEDUANYA baru; access token lama
  langsung 401; refresh token lama **sekali-pakai** (dipakai ulang → 400
  `invalid_grant`); token baru tetap hidup setelah percobaan pakai-ulang.
- **Implikasi desain (WAJIB):** (1) refresh harus ATOMIK per koneksi — 2 proses
  (worker import + job harian) yang refresh bersamaan → yang kalah memakai refresh
  token basi → koneksi MATI permanen. Butuh kunci per koneksi (`SELECT ... FOR
  UPDATE` / advisory lock) + baca ulang token setelah dapat lock. (2) Simpan token
  baru dalam transaksi yang sama dengan pemanggilan refresh; kalau respons hilang
  (crash sebelum simpan) koneksi mati → butuh jalur "hubungkan ulang" yang jelas.
  (3) Cek kode refresh yang ada terhadap dua hal ini di Fase 143.

### E7 — Login manual ke web Accurate, lalu uji token — TIDAK MEMATIKAN TOKEN (2026-09-22)
- User login manual ke account.accurate.id (akun DEV yang sama) SETELAH token 4
  dibuat. Token 4 sesudahnya: `approved-scope.do`, `db-list.do`, dan
  `purchase-invoice/list.do` + `sales-invoice/list.do` di "Retail Demo" → semua 200.
- → Hipotesis "login manual mematikan token" (§ Fase 91) TIDAK terbukti untuk
  login ke portal akun. Batasan: belum diuji masuk ke DALAM database (UI aplikasi
  Accurate) bersamaan dengan panggilan API, dan sesi `open-db` (X-Session-ID)
  tidak diuji terhadap login manual. Penyebab 401 yang TERBUKTI adalah E2
  (otorisasi baru mematikan token lama).

### E8 — `delete.do` tanpa scope `_delete` (id FIKTIF, tanpa menyentuh data) — BUG LATEN TIDAK TERKONFIRMASI (2026-09-22)
- Token 4 (punya `purchase_invoice_save`, TIDAK punya `purchase_invoice_delete`).
- `DELETE purchase-invoice/delete.do?id=999999999` (method sama dengan kode
  `accurate-purchase-invoice.ts:96`) → HTTP 200 `{s:false,d:["Faktur Pembelian tidak
  ditemukan atau sudah dihapus"]}` — LOLOS pemeriksaan scope (bukan 403). Sama untuk
  `sales-invoice/delete.do` (spec memang menyebut `sales_invoice_save`).
- Kontrol: `bank-transfer/delete.do` (scope `bank_transfer_delete` tidak dimiliki) →
  403 `insufficient_scope` → pemeriksaan scope berjalan SEBELUM pencarian data,
  jadi lolosnya purchase-invoice bukan artefak "id tidak ada".
- Spec resmi mencatat `purchase_invoice_delete` untuk endpoint ini, tapi Accurate
  runtime tidak menegakkannya. Delete NYATA atas faktur uji tidak dilakukan
  (data destruktif, tidak perlu). → Batal Import kemungkinan besar berfungsi;
  tetap masukkan `purchase_invoice_delete` ke katalog scope (aman, sejalan spec
  bila Accurate mengetatkan kelak). Perilaku runtime ≠ spec bisa berubah: JANGAN
  mengandalkan perilaku ini.
- Temuan sampingan: spec resmi adalah sumber yang bisa sedikit menyimpang dari
  runtime → mesin scope harus punya jalur toleransi (403 runtime = sumber kebenaran).

## Hasil Pemeriksaan Production P1–P3 (read-only, user-run, 2026-09-22)

**P2 — inventaris**
- 59 koneksi milik 9 user: `active` 46, `expired` 6, `revoked` 7. Status `active` di
  DB TIDAK bisa dipercaya sebagai "token hidup": tidak ada yang menandai koneksi yang
  ditimpa otorisasi baru (E2).
- 5 dari 9 user punya >1 koneksi; 3 user memegang 49 dari 59 (22, 16, 11 koneksi)
  dengan hanya 3, 2, 4 database Accurate berbeda → rata-rata ~5–8 koneksi per database.
- 24 Data Usaha, hanya 8 yang terhubung (16 belum/lewati dulu).
- 29 subscription aktif punya koneksi; **20 (69%) koneksinya sudah tertimpa** koneksi
  lebih baru milik user yang sama (kandidat token mati). Perkiraan kasar: dihitung per
  `user_id`, bukan per akun Accurate (belum tersimpan), jadi bisa berlebih bila 1 owner
  memakai >1 akun Accurate.

**P1 — bukti 401 di data nyata**
- 5 batch (semua `purchase_invoice`, semua `failed`) dibuat SETELAH koneksinya
  tertimpa. Terpisah, 5 batch `failed` (10 baris) berpesan galat 401/`invalid_token`.
  Jumlahnya sama persis dan sama-sama hanya `failed`; konsisten dengan E2. (Belum
  dibuktikan sebagai himpunan yang identik — tidak di-join; tidak diperlukan untuk
  keputusan.)
- Hanya 5 batch gagal walau 20 subscription tertimpa: kebanyakan koneksi mati itu
  belum dipakai import sejak tertimpa. Bom waktu, bukan insiden yang sudah meledak.

**P3 — Batal Import**
- 0 baris `cancelled`, 0 galat scope. Fitur belum pernah dipakai di production →
  E8 tidak bisa dikonfirmasi/dibantah dari data nyata; tetap "tidak terkonfirmasi",
  dan `purchase_invoice_delete` dimasukkan ke katalog scope demi aman (ADR-0036).

**Implikasi migrasi (Fase 145)**
- Skala kecil (9 user, 59 koneksi): migrasi manual-terpandu layak; tidak perlu
  otomatisasi rumit.
- Untuk tiap user, hanya koneksi TERBARU per akun Accurate yang mungkin hidup;
  sisanya mati. Skrip kesehatan (read-only, `approved-scope.do` tiap koneksi
  terbaru) menentukan siapa yang perlu "hubungkan ulang". Memanggil endpoint baca
  dengan token customer adalah keputusan terpisah yang perlu persetujuan sebelum dijalankan.
- `accurate_connections.status='active'` tidak boleh dijadikan dasar "sehat".
