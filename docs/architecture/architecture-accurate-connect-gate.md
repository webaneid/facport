# Architecture — Gerbang Koneksi Accurate (Popup Glass di Dashboard)

> Fase 144. Melengkapi model koneksi Fase 143 (`docs/decisions/adr-0037-cutover-koneksi-per-akun-dipegang-data-usaha.md`)
> dengan UI yang BENAR-BENAR menuntun customer sampai terhubung. Tanpa ini, koneksi Accurate tersembunyi di halaman
> `/accurate` dan customer baru sering mulai import lalu gagal karena belum terhubung.

## Prinsip
1. **Koneksi adalah proses utama, bukan pengaturan.** Begitu customer masuk dashboard sebuah Data Usaha yang belum siap,
   popup muncul dan menuntun langkah berikutnya — bukan menunggu customer menemukan menu.
2. **Satu komponen, satu mesin status.** Semua situasi (belum terhubung, putus, izin baru, pilih database, konfirmasi database)
   diturunkan dari SATU endpoint status per Data Usaha dan dirender oleh SATU komponen. Dilarang membuat popup/banner koneksi
   lain di tempat lain (pola sama "SATU pintu" otorisasi, ADR-0036).
3. **Selalu ada jalan keluar yang jujur.** Tombol "Nanti" selalu ada (kecuali langkah yang sedang berjalan), tapi menunda tidak
   menyembunyikan masalahnya: banner tipis tetap tampil dan halaman import menampilkan penghalang informatif (import memang akan gagal).
4. **Hanya pemilik yang bisa menghubungkan** (ADR-0037). Member seat tidak melihat popup aksi; mereka melihat banner informasi.

## Mesin Status — `GET /accurate/gate?dataUsahaId=` (Fase 144, backend)
Read-only, Accessible (pemilik ATAU member seat aktif, `hasAccessToDataUsaha`). Mengembalikan SATU status berprioritas:

| `state` | Kondisi | Aksi utama (tombol) | Aksi sekunder |
|---|---|---|---|
| `not_connected` | Data Usaha tanpa koneksi berakun. Varian `migrated` bila ada database terakhir yang BELUM dikonfirmasi (koneksi lama sebelum cutover) | **Hubungkan Sekarang** (varian `migrated`: **Hubungkan Ulang**) | **Nanti** |
| `reconnect` | Koneksi ada tapi `status` ≠ `active` (token mati/dicabut) | **Hubungkan Ulang** | **Nanti** |
| `update_permissions` | Koneksi aktif, tapi scope yang diberikan kurang untuk modul yang DIBELI Data Usaha ini (fitur baru dibeli, modul baru, atau scope katalog bertambah) | **Perbarui Izin** | **Nanti** |
| `select_database` | Koneksi aktif, database Accurate belum dipilih | **Simpan & Lanjut** (langkah pilih database di dalam popup) | **Nanti** |
| `confirm_database` | Database sudah terisi tapi BELUM dikonfirmasi (hasil backfill migrasi 0028 / dipertahankan saat hubungkan ulang) | **Ya, Sudah Benar** | **Pilih yang Lain** |
| `ok` | Semua siap | — (tidak ada popup) | — |

Field tambahan: `isOwner`, `requiresAccurate`, `accountEmail` (HANYA pemilik), `accurateDbAlias`, `lastKnownDbAlias`,
`missingScopes` + `missingModules` (nama fitur untuk narasi), `importRunning` (ada batch `processing/cancelling`),
`accounts` (akun Accurate milik pemilik yang sudah terhubung, untuk opsi "pakai akun yang sama", HANYA pemilik).

Aturan turunan:
- `requiresAccurate` = Data Usaha punya subscription aktif berproduk `facport` (butuh Accurate) ATAU belum punya subscription sama
  sekali (Data Usaha baru). Data Usaha yang hanya berlangganan Konverter/AutoProduksi TIDAK memicu gerbang (`state: "ok"`).
- `update_permissions` dihitung dari modul yang **dibeli** Data Usaha ini (`missingScopes(granted, modulAktif)`), BUKAN seluruh
  katalog — customer tidak dinag soal fitur yang tidak dia pakai. Scope katalog yang bertambah tetap terkirim sebagai
  `catalogMissingScopes` (informasi, tanpa popup) supaya saat modul baru dibeli tidak ada kejutan.
- `importRunning` menonaktifkan tombol utama `update_permissions`/`reconnect` (otorisasi ulang mematikan token yang dipakai
  import, terbukti Fase 141 E2) dengan keterangan "Tunggu import selesai".
- Prioritas bila beberapa kondisi sekaligus: `not_connected` > `reconnect` > `update_permissions` > `select_database` > `confirm_database`.

### Perubahan backend pendukung
- Kolom baru `data_usaha.accurate_db_confirmed_at timestamptz` (migrasi 0029, aditif): diisi saat customer memilih database
  (`databases/select`) atau mengonfirmasi; baris hasil backfill 0028 = NULL → memicu `confirm_database`.
- `POST /accurate/databases/confirm {dataUsahaId}` (owner-only): mengisi `accurate_db_confirmed_at`.
- `POST /accurate/databases/reset {dataUsahaId}` (owner-only): mengosongkan database HANYA bila Data Usaha belum punya riwayat
  import sukses (invarian ADR-0037 #5: database tidak boleh diganti setelah ada riwayat); selain itu 409
  `DATABASE_HAS_IMPORT_HISTORY` dengan arahan hubungi support.
- Callback OAuth redirect ke dashboard (`/?accurate=connected` atau `/?accurate_error=<kode>`), bukan `/accurate`, supaya popup
  melanjutkan langsung ke langkah pilih database. Kode galat dipetakan ke narasi ramah (lihat § Narasi).

## Komponen UI
### `GlassDialog` (`components/ui/dialog.tsx`, varian baru — bukan Modal baru)
Memakai Radix Dialog yang sama (focus-trap, portal, ESC teruji), ditambah `variant="glass"`:
- Overlay: `bg-black/25 backdrop-blur-sm` (latar dashboard tetap terlihat samar).
- Kartu: `bg-white/60 backdrop-blur-2xl border border-white/50 ring-1 ring-black/5 rounded-3xl`, bayangan lembut
  `shadow-[0_30px_80px_rgba(16,24,40,.25)]`, garis cahaya tipis di tepi atas (highlight).
- Fallback: `@supports not (backdrop-filter: blur(1px))` dan `prefers-reduced-transparency` → `bg-white/95` (tetap terbaca).
- Ikon `Link2` dalam lingkaran `primary-50` dengan glow halus; animasi masuk singkat (fade + scale 0.98→1), dimatikan pada
  `prefers-reduced-motion`.
- Mobile (<640px): kartu penuh lebar menempel bawah (sheet), tombol bertumpuk penuh lebar, target sentuh ≥44px.

### Tombol (token desain yang ada, `primary-*`)
- **Utama** ("Hubungkan Sekarang", "Hubungkan Ulang", "Perbarui Izin", "Simpan & Lanjut", "Ya, Sudah Benar"):
  `bg-primary-600 text-white hover:bg-primary-700` (fokus ring `primary-300`).
- **Sekunder** ("Nanti", "Pilih yang Lain"): `border border-primary-600 text-primary-700 bg-transparent hover:bg-primary-50`.
- Keadaan memuat: teks berganti ("Mengarahkan ke Accurate…") + spinner, tombol dinonaktifkan; jangan ada klik ganda.

### `AccurateConnectGate` (`components/accurate/accurate-connect-gate.tsx`)
Client component dipasang SEKALI di `app/app/(protected)/layout.tsx` (sudah mengambil Data Usaha aktif). Menerima `gate` dari server
(`/accurate/gate`), merender popup sesuai `state`, dan mengurus alur (`connect` → redirect Accurate; `attach`; `databases`;
`select`; `confirm`; `reset`). Fungsi murni `gateCopy(state, ctx)` memegang SEMUA narasi & label tombol (teruji unit).
- Popup muncul di dashboard (`/`) dan halaman import; di halaman lain hanya banner (tidak mengganggu billing/subscribe/tim).
  Di `/accurate` popup tidak otomatis, tetapi bisa dibuka manual dari kartu (halaman itu menampilkan status lengkap).
- **"Nanti"**: menyembunyikan popup (`sessionStorage`, per Data Usaha + `state`); kembali muncul di sesi browser berikutnya. Banner
  tetap ada (lihat bawah). ESC/klik luar = "Nanti".
- **Banner** (`AccurateGateBanner`): strip tipis di atas konten, warna netral-hangat (bukan merah), ikon + satu kalimat + tombol
  teks "Selesaikan sekarang". Untuk member seat: kalimat informasi tanpa tombol.
- **Penghalang di halaman import** (`AccurateRequiredNotice`): bila `state ≠ ok` kartu di atas form unggah menjelaskan bahwa import
  akan gagal dan membuka popup yang sama; unggah tetap boleh dan pengiriman dijaga server (batch gagal dengan pesan jelas).
- Setelah sukses: kartu konfirmasi singkat "Terhubung ke {alias}" (±1,5 dtk) lalu popup menutup sendiri; `router.refresh()`.
- Aksesibilitas: `role="dialog"`, `aria-labelledby/-describedby`, fokus awal pada tombol utama, urutan Tab utama → sekunder, pesan
  galat `role="alert"`.

### Pilihan akun (langkah dalam popup `not_connected`/`reconnect`)
Bila pemilik sudah punya akun Accurate terhubung (`accounts`), popup menawarkan dulu **"Pakai akun {email}"** (`POST /accurate/attach`,
tanpa OAuth ulang — OAuth ulang mematikan token yang dipakai Data Usaha lain) dengan tautan teks "Gunakan akun Accurate lain"
(`connect`). Tanpa akun terhubung, langsung tombol utama.

## Narasi (Bahasa Indonesia, hangat & lugas — sumber tunggal di `gateCopy`)
Nada: sapaan "Anda", kalimat pendek, jelaskan MENGAPA sebelum meminta tindakan, tidak menakut-nakuti, tidak berjanji berlebihan.

**not_connected** — Judul: "Hubungkan dengan akun Data Usaha Accurate Online Anda". Isi: "Supaya data dari Excel bisa langsung
masuk ke Accurate, hubungkan akun Accurate milik perusahaan Anda. Prosesnya singkat: Anda diarahkan ke Accurate untuk memberi
izin, lalu kembali ke sini. Izin itu hanya dipakai untuk memproses impor Anda, dan bisa dicabut kapan saja dari Accurate."
Catatan kecil: "Belum siap? Pilih Nanti — Anda bisa menghubungkan kapan saja dari menu Koneksi Accurate."
Tombol: **Hubungkan Sekarang** / **Nanti**.

**not_connected (migrated)** — Judul: "Hubungkan ulang akun Accurate Anda — sekali saja". Isi: "Kami menyederhanakan cara Facport
terhubung ke Accurate: cukup satu koneksi per akun, dipakai untuk semua Data Usaha Anda. Karena itu Anda perlu menghubungkan
ulang satu kali. Pengaturan dan riwayat import Anda tetap aman." Tombol: **Hubungkan Ulang** / **Nanti**.

**reconnect** — Judul: "Koneksi ke Accurate terputus". Isi: "Akses Facport ke Accurate sudah tidak berlaku — biasanya karena izin
dicabut, atau akun Accurate diotorisasi ulang di tempat lain. Hubungkan ulang agar import bisa berjalan lagi. Data yang sudah
pernah Anda impor tidak terpengaruh." Tombol: **Hubungkan Ulang** / **Nanti**.

**update_permissions** — Judul: "Ada izin baru yang perlu Anda setujui". Isi (dengan nama fitur): "Fitur {nama fitur} yang baru Anda
gunakan membutuhkan izin tambahan di Accurate. Izin yang sudah ada tetap berlaku dan data Anda tidak berubah — Anda hanya perlu
menyetujuinya sekali lagi di Accurate, lalu lanjut seperti biasa." Bila `importRunning`: "Ada import yang sedang berjalan. Perbarui
izin setelah selesai agar prosesnya tidak terputus." (tombol utama nonaktif). Tombol: **Perbarui Izin** / **Nanti**.
- Pemicu nyata: (a) customer membeli fitur baru di Data Usaha yang sudah terhubung, (b) rilis Facport menambah modul/scope baru
  yang mencakup modul yang sudah dibeli. Keduanya diselesaikan lewat SATU alur otorisasi (semua scope), tanpa alur baru.

**select_database** — Judul: "Pilih database Accurate untuk {Data Usaha}". Isi: "Akun Accurate Anda terhubung. Pilih database
yang dipakai untuk Data Usaha ini. Setelah ada riwayat import, pilihan ini tidak bisa diganti — pastikan sudah benar." Daftar
radio (database trial/kedaluwarsa nonaktif, yang sudah dipakai Data Usaha lain diberi keterangan). Tombol: **Simpan & Lanjut** / **Nanti**.

**confirm_database** — Judul: "Apakah ini database yang benar?". Isi: "Sebelumnya Data Usaha ini terhubung ke **{alias}**. Pastikan
cocok agar data tidak masuk ke perusahaan yang salah." Tombol: **Ya, Sudah Benar** / **Pilih yang Lain**. Bila `Pilih yang Lain`
ditolak (`DATABASE_HAS_IMPORT_HISTORY`): "Data Usaha ini sudah punya riwayat import, jadi database-nya tidak bisa diganti sendiri.
Hubungi tim kami dan kami bantu." (+ tautan support).

**Galat callback** (`?accurate_error=`): `accurate_account_in_use` — "Akun Accurate ini sudah terhubung ke akun Facport lain. Gunakan
akun Accurate yang berbeda, atau minta pemilik sebelumnya memutuskannya." · `missing_account` — "Accurate tidak mengirim identitas
akun. Coba lagi; kalau tetap begini, hubungi kami." · `invalid_state` — "Sesi penghubungan kedaluwarsa atau berbeda. Mulai lagi dari
awal ya." · `access_denied` — "Izin tidak jadi diberikan. Tidak apa-apa — Anda bisa mencoba lagi kapan saja." · `exchange_failed`
— "Gagal menyelesaikan koneksi dengan Accurate. Coba beberapa saat lagi." Semuanya tampil di popup dengan tombol **Coba Lagi** / **Nanti**.

**Banner** — `not_connected`: "Data Usaha ini belum terhubung ke Accurate — import belum bisa dikirim." · `reconnect`: "Koneksi ke
Accurate terputus." · `update_permissions`: "Ada izin baru yang perlu disetujui untuk {fitur}." · `select_database`: "Pilih database Accurate
untuk melanjutkan." · `confirm_database`: "Konfirmasi database Accurate Data Usaha ini." · Member seat: "Pemilik Data Usaha perlu
menghubungkan Accurate sebelum import bisa dikirim."

## Cakupan Halaman/Permukaan
- `app/app/(protected)/layout.tsx` — mount `AccurateGateProvider` (konteks status + popup + banner; satu fetch `/accurate/gate`, `no-store`, cookie diteruskan manual). Konteks ini dipakai kartu dashboard, halaman `/accurate`, dan penghalang import supaya SATU sumber data.
- **Kartu "Koneksi Accurate" di dashboard** (`app/app/(protected)/page.tsx`) — SATU status per Data Usaha (bukan daftar per modul),
  diturunkan dari `/accurate/gate` yang sama dengan popup: badge status (Terhubung / Belum terhubung / Terputus / Perlu izin baru /
  Pilih database), nama akun Accurate & database, dan satu tombol sesuai `state` (membuka popup yang sama). Kartu ini tetap ada
  supaya koneksi selalu terlihat walau popup sudah di-"Nanti"-kan.
- `app/app/(protected)/accurate/page.tsx` — dirombak jadi kartu tunggal per Data Usaha (status, akun, database, tombol sesuai `state`),
  menggantikan kartu per subscription dan adaptor kompat Fase 143 (`subscriptionId`).
- 17 halaman import — `AccurateRequiredNotice` (satu komponen, membaca status dari konteks layout; dipasang mekanis tepat di bawah
  pembuka `return (` tiap halaman). Bentuknya penghalang informatif (kartu + tombol pembuka popup); pengiriman ke Accurate TIDAK
  dinonaktifkan di UI — server sudah menggagalkan batch dengan pesan jelas (Fase 142/143) dan mengubahnya berarti menyentuh 17 form
  serta puluhan tes route import.
- Admin (`admin/(protected)/users/[id]/page.tsx`, `disconnect-accurate-dialog.tsx`) — status & salinan tombol mengikuti level Data Usaha.
- Notifikasi (`lib/notification-routes.ts`) — tautan "Koneksi Accurate terputus" mengarah ke dashboard (popup `reconnect`).

## Pengujian
- API: matriks `GET /accurate/gate` (tiap `state`, prioritas, `requiresAccurate` false untuk Konverter/AutoProduksi, member seat
  tanpa `accountEmail`/`accounts`, `importRunning`, `update_permissions` hanya untuk modul yang dibeli); `confirm`/`reset`
  (owner-only, riwayat import memblokir reset); callback redirect + kode galat.
- Web: tes unit `gateCopy` (semua state × varian, label tombol tepat), logika "Nanti" (sessionStorage), pemetaan kode galat; verifikasi
  visual manual di Chrome (glass, mobile, tanpa `backdrop-filter`) pada akun DEV dengan izin eksplisit untuk tiap "Beri Akses".

## Yang sengaja tidak dikerjakan di fase ini
Email/pengumuman ke customer, skrip health-check token, carry-over koneksi hidup, penghapusan kolom legacy (Fase 145).
