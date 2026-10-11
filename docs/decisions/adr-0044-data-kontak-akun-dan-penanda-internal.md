# ADR-0044: Data kontak melekat pada AKUN, penanda internal, dan kontrol keuangan akun internal

**Status:** Proposed (menunggu persetujuan user; keputusan-keputusan di bawah sudah diucapkan user 2026-10-12)
**Tanggal:** 2026-10-12
**Terkait:** `docs/architecture/architecture-admin-insight.md`, Fase 189, ADR-0042, ADR-0027

## Context
Client FAC (Excel "Kebutuhan Data di Portal Admin New Facport", 10/10/2026) butuh: jumlah pengguna komersil vs internal, kontak pelanggan (telepon/WhatsApp/perusahaan), dan nilai rupiah hanya dari pengguna komersil. Saat ini tabel `user` hanya punya nama dan email; tidak ada penanda internal; gerbang akses dan laporan keuangan tidak membedakan akun internal (trainer, karyawan, mitra). Risiko nyata: invoice/pembayaran akun internal (termasuk mode admin `paid_invoice` atau bukti transfer asal-asalan) mengotori angka keuangan.

## Decision
1. **Data kontak = data AKUN, bukan Data Usaha.** Kolom baru di `user`: `company_name` (label UI "Nama Perusahaan"), `phone`, `whatsapp`. Terpisah total dari `data_usaha` (workspace Accurate; tidak diturunkan dari namanya). Format nomor: E.164 dengan `+` (standar Jalajogja: `PhoneInput`, `normalizePhone`, `displayPhone`, `toWaDigits`). Nullable di DB (data lama kosong), WAJIB di antarmuka.
2. **Pengisian:** form daftar email menambah ketiga isian (WhatsApp punya centang "Sama dengan nomor telepon"). Akun mana pun yang membuka surface `app.` dengan data kosong (Google, user lama, akun tambahan) otomatis melihat satu modal Lengkapi Profil yang tidak bisa ditutup sampai terisi. Tanpa pemblokiran API, tanpa pengumuman/masa tenggang. Admin/staf yang hanya memakai surface `admin.` tidak ditanya.
3. **Penanda internal:** `user.is_internal boolean default false`. **Komersil adalah default** setiap akun customer yang tidak ditandai — ditentukan status AKUN, bukan trial/langganan. Hanya Super Admin (`users.manage`) yang mengubah; tiap perubahan tercatat di `audit_logs`. Satu flag; subkategori (Trainer/Karyawan/Mitra) ditunda.
4. **Kontrol keuangan akun internal (Lapis 1):** laporan uang mengecualikan akun internal sepenuhnya; invoice, checkout, dan tagihan perpanjangan terjadwal untuk akun internal ditolak di API; akses internal hanya lewat mode admin "gratis" (tanpa invoice). Laporan uang memisahkan *Terbayar terverifikasi* dan *Dilunasi admin*. Hibah akses tanpa tanggal akhir (Lapis 2) = Fase 191 terpisah.
5. **Satu akun boleh dua role.** Email unik (Better Auth) dan `user_roles` mengizinkan banyak role per akun, jadi admin/staf bisa sekaligus customer. Syaratnya aksi eksplisit Super Admin memberi role `customer` (belum ada UI; pendaftaran ulang dengan email sama ditolak). Akun berperan ganda yang membuka `app.` otomatis kena modal Lengkapi Profil. Diusulkan: akun ber-role admin/staf dihitung **internal otomatis** di laporan tanpa flag manual (menunggu persetujuan).
6. **Satuan "pengguna"** di laporan = akun manusia (pemilik dan User Tambahan), dengan rincian pemilik/tambahan.

## Alternatif yang Dipertimbangkan
- Kolom kontak di `data_usaha` — ditolak: client meminta data milik orang yang mendaftar; satu orang bisa punya banyak Data Usaha.
- Role khusus "internal" — ditolak user (2026-10-12): flag di akun lebih sederhana dan tidak mengubah RBAC.
- Memblokir akses sampai profil lengkap — ditolak user: modal tak bisa ditutup cukup, tidak mengganggu import berjalan.
- Hanya label laporan tanpa kontrol keuangan — ditolak: invoice internal tetap mengotori nomor invoice dan angka uang.

## Konsekuensi
- Migrasi aditif pada `user` (3 kolom kontak + `is_internal`); wajib verifikasi `additionalFields` Better Auth dan uji alur daftar email, Google, dan undangan User Tambahan.
- Semua pelanggan lama melihat modal sekali pada kunjungan berikutnya; tidak ada pemblokiran sehingga risiko operasional rendah.
- Guard baru di pembuatan invoice/order/job tagihan terjadwal dan di mode pemberian langganan admin; perlu tes agar pelanggan komersil tidak terpengaruh.
- Ketergantungan lintas project: komponen `PhoneInput` dan helper nomor diport dari Jalajogja (salinan, bukan paket bersama).

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-0044" di file baru itu.
