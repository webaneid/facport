# ADR-0036: Koneksi Accurate 1-per-Akun Accurate, Selalu Semua Scope, dan Mesin Scope Tunggal

**Status:** Accepted
**Tanggal:** 2026-09-22
**Menggantikan sebagian:** ADR-0019, ADR-0020 (koneksi per subscription/modul)
**Bukti:** `docs/phases/phase-141-bukti-otorisasi-accurate-dan-rencana-gerbang-tunggal.md` § Hasil (E0–E8, akun DEV)

## Context
Alur sekarang membuat koneksi Accurate BARU tiap subscription modul (UI: "Hubungkan
tiap fitur langganan"), dengan scope hanya milik modul itu; callback OAuth selalu
`INSERT`. Customer nyata berakhir dengan 15 koneksi/2 perusahaan, dan sebagian
import gagal 401 (Pak Untung).

Percobaan Fase 141 membuktikan (bukan asumsi) perilaku Accurate yang tidak ada di
dokumentasi resmi:
1. **Satu akun Accurate × satu aplikasi = satu otorisasi hidup.** Otorisasi baru
   (akun sama) MEMATIKAN access token DAN refresh token sebelumnya (401
   `invalid_token` / 400 `invalid_grant`) dan MENGGANTI seluruh scope (tidak
   kumulatif). Ini akar 401: subscription modul baru mematikan koneksi modul lama.
2. Token terikat ke AKUN Accurate, bukan database: `db-list.do` mengembalikan semua
   database, dipilih per panggilan lewat `open-db.do?id=`.
3. Meminta seluruh 34 scope sekaligus DITERIMA; satu token melayani lintas modul.
4. Respons token memuat `scope` dan `user{id,email,name}` (sekarang dibuang);
   `approved-scope.do` mengembalikan daftar yang identik.
5. Refresh token dirotasi penuh dan sekali-pakai (pakai ulang → 400); access token
   lama langsung mati; masa berlaku ~15 hari diperpanjang tiap refresh.
6. Scope kurang → HTTP 403 body XML `insufficient_scope` + `<scope>nama</scope>`
   (bukan envelope `{s,d}`).
7. Login manual ke web Accurate TIDAK mematikan token (hipotesis Fase 91 gugur).
8. Runtime tidak selalu menegakkan scope spec (`purchase-invoice/delete.do`
   lolos tanpa `_delete`), jadi 403 runtime adalah sumber kebenaran, bukan spec.

## Decision
1. **Model koneksi: 1 koneksi per akun Accurate**, kunci unik pada `accurateUserId`
   (id dari respons token). Beberapa Data Usaha yang memakai akun Accurate yang sama
   MEMBAGI satu koneksi; Data Usaha hanya menyimpan `accurateDbId` (database mana).
   `subscriptions.accurateConnectionId` dibekukan (tidak dipakai lagi); worker
   menurunkan koneksi lewat Data Usaha. Satu database Accurate ↔ satu Data Usaha
   per owner tetap berlaku.
2. **Otorisasi selalu meminta gabungan SEMUA scope katalog** lewat SATU endpoint
   "hubungkan/perbarui izin". Callback bersifat upsert: memperbarui baris koneksi
   yang sama (kunci `accurateUserId`), TIDAK PERNAH `INSERT` baris kedua untuk akun
   yang sama. Menyimpan `grantedScopes` (dari respons token), `accurateUserId`,
   email akun Accurate.
3. **Satu akun Accurate = satu pemilik Facport.** Jika akun Accurate itu sudah
   terhubung ke owner lain, callback ditolak dengan pesan jelas (kalau tidak,
   otorisasi owner B diam-diam mematikan koneksi owner A — pola bug yang sama).
4. **Mesin scope 3 lapisan** (Fase 142): (a) registri tunggal endpoint→modul, scope
   diturunkan dari snapshot spec resmi (skrip sinkron); (b) satu fungsi
   `missingScopes(koneksi, modul)` dipakai di `/accurate/reuse`, sebelum import
   dijadwalkan (`ACCURATE_SCOPE_MISSING`), awal worker, dan status UI ("Perbarui
   izin"); (c) pengaman CI (tiap endpoint di kode terdaftar; tiap scope valid).
   Deteksi runtime: HTTP 403 + `insufficient_scope`, parse `<scope>` dari XML.
   Toleransi spec≠runtime: 403 runtime menang; scope `_delete` tetap dimasukkan
   ke katalog walau belum ditegakkan.
5. **Refresh token aman terhadap rotasi:** (a) hanya satu jalur refresh (job harian
   + on-demand memakai fungsi yang sama) dengan kunci per koneksi
   (`SELECT ... FOR UPDATE`/advisory lock) dan baca ulang token setelah dapat lock;
   (b) HANYA 400 `invalid_grant` yang menandai `expired`/"hubungkan ulang" — galat
   jaringan/5xx di-retry, JANGAN langsung `markConnectionExpired` (kode sekarang
   menandai expired untuk SEMUA error, `workers/index.ts` job refresh); (c) simpan
   token baru segera setelah respons refresh.
6. **Transfer kepemilikan Data Usaha:** koneksi diputus pada Data Usaha itu;
   pemilik baru menghubungkan ulang (akun Accurate-nya sendiri).
7. **Modul baru:** cukup deklarasi endpoint di registri (Decision 4a); DILARANG
   membuat alur otorisasi/reconnect baru. Checklist § 3b
   `architecture-accurate-integration.md` diperbarui.

## Consequences
- Menghilangkan penyebab terbukti 401 berulang; jumlah koneksi turun dari
  N-per-modul ke 1-per-akun.
- **Migrasi (Fase 145) sensitif:** koneksi lama customer nyata sebagian besar sudah
  mati diam-diam; hanya yang terakhir diotorisasi per akun yang hidup. Skrip
  kesehatan (user-run, read-only) menandai yang mati; customer WAJIB otorisasi ulang
  SEKALI (semua scope) — banner "hubungkan ulang", tanpa menghapus baris lama.
- Otorisasi ulang oleh siapa pun untuk akun itu mematikan token lama seketika;
  UI harus memperingatkan bahwa menghubungkan ulang dari perangkat/tab lain
  menggantikan koneksi (dan jangan otorisasi dua kali paralel).
- Batasan percobaan: hanya akun DEV (1 database aktif, jadi "1 token melayani ≥2
  database" terbukti secara struktural, bukan end-to-end); perilaku role/hak akses
  Accurate customer tidak direplikasi.

## Alternatives Considered
- **Koneksi per Data Usaha (rencana awal):** ditolak — dua Data Usaha dari akun
  Accurate yang sama akan saling mematikan (terbukti E2).
- **Tetap per subscription + cegah mati dengan refresh:** mustahil, otorisasi baru
  selalu membatalkan yang lama di sisi Accurate.
- **Pakai API Token (bukan OAuth):** di luar lingkup; OAuth sudah jadi standar
  proyek dan tidak membutuhkan penyalinan token manual oleh customer.
