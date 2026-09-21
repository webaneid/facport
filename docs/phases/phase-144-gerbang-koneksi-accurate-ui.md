# Fase 144 — Gerbang Koneksi Accurate (Popup Glass, Status per Data Usaha, Halaman Koneksi)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Membuat koneksi Accurate menjadi proses utama yang menuntun customer: setelah membuat Data Usaha dan masuk dashboard, popup
kaca-transparan yang elegan menanyakan "Hubungkan dengan akun Data Usaha Accurate Online Anda" (**Hubungkan Sekarang** = latar warna
utama + teks putih; **Nanti** = border & teks warna utama). Situasi lain (koneksi putus, izin/scope baru dari fitur baru, pilih &
konfirmasi database) memakai SATU mesin status + SATU komponen. Rancangan lengkap, tabel status, narasi, dan spesifikasi visual:
`docs/architecture/architecture-accurate-connect-gate.md`. Melengkapi Fase 143 (ADR-0036/0037); TIDAK dirilis tanpa 143.

## Scope (task)
- [x] T1 Migrasi 0029: `data_usaha.accurate_db_confirmed_at`; `databases/select` mengisinya; `POST /accurate/databases/confirm` & `/reset` (reset diblokir bila ada riwayat import sukses)
- [x] T2 `GET /accurate/gate?dataUsahaId=` (mesin status berprioritas: not_connected[+migrated] > reconnect > update_permissions > select_database > confirm_database > ok; `requiresAccurate`, `importRunning`, `missingModules`, `accounts` & `accountEmail` khusus pemilik) + tes matriks
- [x] T3 Callback OAuth redirect ke dashboard (`/?accurate=connected` / `/?accurate_error=<kode>`); tes
- [x] T4 `GlassDialog` (varian `glass` pada `components/ui/dialog.tsx`) + fallback tanpa `backdrop-filter`/`prefers-reduced-transparency`/`prefers-reduced-motion`; layout mobile (sheet)
- [x] T5 `gateCopy(state, ctx)` — narasi & label tombol tunggal (teruji unit), pemetaan kode galat callback
- [x] T6 `AccurateConnectGate` (popup, alur connect/attach/pilih database/confirm/reset, "Nanti" via sessionStorage) + `AccurateGateBanner` + `AccurateRequiredNotice`; dipasang di `(protected)/layout.tsx`
- [x] T7 Halaman `/accurate` dirombak jadi kartu tunggal per Data Usaha; **kartu "Koneksi Accurate" di dashboard jadi status tunggal per Data Usaha** (bukan daftar per modul); hapus adaptor kompat `subscriptionId` di `/accurate/connect` dan kartu per subscription
- [x] T8 `AccurateRequiredNotice` di 17 halaman import (penghalang informatif; pengiriman tetap dijaga server — tidak dinonaktifkan di UI)
- [x] T9 Admin: status per Data Usaha + salinan dialog "Putuskan Koneksi"; tautan notifikasi "Koneksi terputus"
- [x] T10 Tes web (gateCopy, "Nanti", pemetaan galat) + verifikasi visual di Chrome (akun DEV; izin eksplisit tiap "Beri Akses")
- [x] T11 Docs: architecture-app-dashboard, architecture-accurate-integration (§ alur), lessons-learned; security review (owner-only, tidak ada `accountEmail`/token bocor ke member)

## Keputusan Desain (dari permintaan user 2026-09-22)
- Popup: transparan-kaca (glass); pertanyaan utama "Hubungkan dengan akun Data Usaha Accurate Online Anda"; dua tombol persis: utama solid, sekunder outline.
- Fitur baru / scope baru → tombol utama **Perbarui Izin** (bukan "Hubungkan" — koneksinya sudah ada), sekunder **Nanti**; narasi menyebut nama fitur; nonaktif bila import sedang berjalan.
- Putus/dicabut → **Hubungkan Ulang**. Migrasi cutover → **Hubungkan Ulang** dengan narasi "sekali saja". Pilih database → **Simpan & Lanjut**. Konfirmasi database hasil backfill → **Ya, Sudah Benar** / **Pilih yang Lain**.

- **Dikonfirmasi user 2026-09-22:** "Nanti" menyembunyikan popup selama sesi browser itu dan muncul lagi di sesi berikutnya (banner + penghalang import tetap tampil); popup ditampilkan di **dashboard + halaman import** (halaman lain hanya banner).

## Di luar scope
Pengumuman/email ke customer, skrip health-check token, carry-over koneksi hidup, hapus kolom legacy, runbook deploy (Fase 145).

## Keputusan Kecil (diambil saat eksekusi)
- **Konteks tunggal:** `AccurateGateProvider` (dipasang di `(protected)/layout.tsx`) memegang status, popup, banner; kartu dashboard, halaman `/accurate`, dan penghalang import membaca konteks yang SAMA (`useAccurateGate`) — tidak ada fetch/UI koneksi lain. Status diambil server-side per render layout (`no-store`); setelah aksi, `router.refresh()` memuat ulang status (tanpa state salinan di client).
- **"Nanti"** = `sessionStorage` per Data Usaha + status (`useSyncExternalStore`, aman SSR); popup otomatis HANYA di `/` dan `*/import*`; kembali dari OAuth (`?accurate=connected` / `?accurate_error=`) membuka popup mengabaikan "Nanti". Popup juga bisa dibuka manual (kartu/banner/penghalang) di halaman mana pun, termasuk `/accurate`.
- **`migrated` = belum terhubung + database tersimpan belum dikonfirmasi** (bukan sekadar "ada database terakhir"): koneksi yang diputus admin/transfer setelah dikonfirmasi memakai narasi biasa dengan "Sebelumnya terhubung ke …".
- **Penghalang import informatif saja** (kartu + tombol); pengiriman TIDAK dinonaktifkan di UI (server sudah menggagalkan batch dengan pesan jelas; menonaktifkan berarti menyentuh 18 form & puluhan tes route). Dipasang mekanis di 18 halaman import.
- **`?accurate_error=<kode>` tidak pernah dipantulkan mentah** ke UI: kode dipetakan ke kalimat tetap (`oauthErrorMessage`), kode asing → kalimat generik (anti-injeksi teks; ada tesnya).
- **Adaptor kompat `subscriptionId` di `/accurate/connect` dihapus**; `/accurate/subscriptions` & `/connections` tetap ada (tidak lagi dipakai web; dibuang di Fase 145 bila tetap tanpa pemakai).
- **Tes komponen me-mock modul pembungkus `lib/use-accurate-gate-navigation.ts`, bukan `next/navigation`**: `mock.module` bun bersifat global per proses dan tes auth/* me-mock `next/navigation` dengan bentuk lain (saling menimpa, tes jadi bergantung urutan file).
- **Dev: `ACCURATE_REDIRECT_URI` harus lewat proxy web** (`http://app.localhost:6209/api-proxy/accurate/oauth/callback`) karena callback terikat sesi login (Fase 143) dan cookie dev milik `app.localhost` — URI itu juga harus didaftarkan di portal developer Accurate. Didokumentasikan di `.env.example` dan `architecture-accurate-integration.md` § Redirect URI.

- **Koreksi admin "Putuskan Koneksi" (2026-09-22, temuan user):** T9 awal hanya mengubah backend & salinan dialog; UI detail user admin masih
  menampilkan kolom koneksi + tombol "Putuskan" PER BARIS subscription (3 fitur = 3 tombol untuk 1 koneksi) dan endpoint dikunci ke
  subscription. Diperbaiki: `POST /admin/data-usaha/:id/disconnect-accurate` (menggantikan `POST /admin/subscriptions/:id/disconnect-accurate`,
  dihapus), `GET /admin/users/:id/subscriptions` kini mengembalikan daftar `dataUsaha` (status koneksi + akun + database per Data Usaha,
  termasuk Data Usaha tanpa langganan) dan baris subscription TANPA kolom koneksi; halaman detail user = ringkasan koneksi + SATU tombol
  per Data Usaha. Belum diverifikasi visual di browser admin (tes API + typecheck + lint saja).

## Known Limitations
- **Verifikasi end-to-end lewat UI SELESAI (2026-09-22, akun DEV, aplikasi facport local, Retail Demo):** login → buat Data Usaha → popup "Hubungkan Sekarang" → Accurate (kali ini TANPA layar persetujuan; scope sama sudah pernah disetujui) → callback lewat proxy terikat sesi → dashboard `?accurate=connected` dengan popup di langkah pilih database → "Simpan & Lanjut" → kartu "Terhubung ke Retail Demo" → popup menutup, kartu dashboard "✓ Terhubung · Database: Retail Demo". Redirect URI lewat proxy (`http://app.localhost:6209/api-proxy/accurate/oauth/callback`) sudah didaftarkan di portal developer Accurate (di samping URI langsung) dan `apps/api/.env` dev diarahkan ke sana.
- **Tampilan mobile (sheet) belum dilihat langsung:** ekstensi Chrome tidak mengubah viewport; CSS `.glass-card` mobile hanya ditinjau dari kode. Desktop terverifikasi (popup `not_connected` & `reconnect`, "Nanti", banner, kartu dashboard, halaman `/accurate`, penghalang import).
- Status `update_permissions`, `select_database`, `confirm_database` diverifikasi lewat tes API + tes komponen, belum secara visual di browser (butuh token Accurate hidup untuk daftar database).
- Kartu per subscription di halaman `/accurate` dan adaptor kompat sudah dihapus; tautan notifikasi "Koneksi terputus" tetap ke `/accurate` (popup dapat dibuka dari kartu di sana).
- Pengumuman/email ke customer, skrip health-check token, carry-over koneksi hidup, penghapusan kolom legacy → Fase 145. Rilis 143+144 satu paket setelah customer diberi tahu.
- Tinjauan keamanan Fase 144 dilakukan langsung (bukan subagent): `gate` Accessible dengan `hasAccessToDataUsaha` lebih dulu, `accountEmail`/`accounts` hanya untuk pemilik (ada tes member seat), `confirm`/`reset` owner-only dan `reset` diblokir riwayat import sukses, `/accurate/*` kena rate limit, tidak ada pantulan nilai URL mentah ke UI.

## Ringkasan Hasil
Popup gerbang koneksi Accurate (kaca-transparan) muncul setelah pemilik masuk dashboard Data Usaha yang belum siap: "Hubungkan dengan akun Data Usaha Accurate Online Anda" dengan **Hubungkan Sekarang** (solid warna utama, teks putih) dan **Nanti** (border & teks warna utama). Situasi lain memakai mesin status yang sama: terputus (**Hubungkan Ulang**), fitur/scope baru (**Perbarui Izin**, menyebut nama fitur, ditahan bila ada import berjalan), pilih database, dan konfirmasi database (**Ya, Sudah Benar** / **Pilih yang Lain**). Kartu Koneksi Accurate di dashboard dan halaman `/accurate` kini SATU status per Data Usaha (bukan per modul).
- Backend: `GET /accurate/gate` (mesin status), `POST /accurate/databases/confirm` & `/reset`, migrasi 0029 (`accurate_db_confirmed_at`), redirect callback ke dashboard, `subscriptionId` dihapus dari `/accurate/connect`.
- Web: `GlassDialog` (varian `glass` + fallback), `gateCopy` (narasi tunggal), `AccurateGateProvider` (popup/banner/kartu/penghalang), 18 halaman import, dialog admin "Putuskan Koneksi" level Data Usaha.
- Typecheck (api+web) & lint bersih; **1437 tes API** dan **97 tes web** lolos (naik dari 1420 dan 76). Verifikasi visual di Chrome (login dengan akun uji, buat Data Usaha → dashboard) pada desktop.
