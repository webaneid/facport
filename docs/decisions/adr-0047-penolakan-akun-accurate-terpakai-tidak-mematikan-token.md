# ADR-0047: Penolakan "akun Accurate sudah dipakai" tidak boleh mematikan token pemilik yang sah

**Status:** Accepted (disetujui user 2026-10-13: "kerjakan Fase 192 sekarang" setelah usulan perbaikan 1–3 dipaparkan)
**Tanggal:** 2026-10-13
**Terkait:** ADR-0036 (koneksi per akun Accurate), ADR-0037 (cutover), Fase 143, Fase 189B (riwayat Data Usaha), `architecture-accurate-integration.md`, Fase 192

## Context
Insiden produksi 2026-10-13 (klien PT Buana Indah + akun uji tim FAC):
1. Callback OAuth menukar kode dengan token SEBELUM tahu akun Accurate mana yang menyambung (identitas `user.id` baru ada di respons token). Terbukti Fase 141 E2: otorisasi baru untuk akun Accurate yang sama MEMATIKAN token lama. Jadi ketika akun Facport B mencoba menyambung ke akun Accurate yang sudah dimiliki akun Facport A, penukaran kode sudah terlanjur mematikan token A; lalu penyimpanan token B ditolak (`accurate_account_in_use`) — A diam-diam putus tanpa jejak.
2. Penolakan itu tidak tercatat di riwayat dan log hanya memuat id Data Usaha, sehingga tim tidak bisa melacak akun mana yang bentrok.
3. Galat Accurate "Anda memerlukan hak Administrator untuk mulai menginstall Aplikasi …" (pemilik akun Accurate bukan Administrator database) jatuh ke pesan generik "Gagal menyimpan pilihan database. Coba lagi." — pelanggan mengulang tanpa tahu apa yang harus dilakukan.

## Decision
1. **Pemulihan token pada penolakan.** Saat callback mendapati akun Accurate (`accurate_user_id`) dimiliki pemilik Facport lain, token baru yang baru saja diterbitkan DISIMPAN ke baris koneksi pemilik tersebut (token, refresh, kedaluwarsa, scope, status `active`) — HANYA bila baris itu berstatus `active` atau `expired`. Baris `revoked` tidak dihidupkan kembali (itu keputusan sengaja pemutusan). Pemanggil (B) tetap ditolak dan TIDAK mendapat apa pun: tidak ada penunjuk koneksi, tidak ada data milik A. Pengaman: update berkunci `accurate_user_id` yang sama persis dengan identitas dari respons token.
2. **Jejak penolakan.** Aksi riwayat Data Usaha baru `connect_rejected` pada Data Usaha B: `{reason: "account_in_use", conflictingConnectionId, tokenRestored}` — TANPA email/nama pemilik lain (privasi). Log peringatan memuat `conflictingConnectionId` (bukan PII). Aksi ini TIDAK dimasukkan ke laporan Insight "Riwayat Koneksi" (agar hitungan koreksi tidak berubah).
3. **Pesan "sudah dipakai" yang bisa ditindaklanjuti**: menyebut bahwa akun Accurate itu sudah dipakai akun Facport lain (tanpa menyebut siapa), dan memberi dua jalan: minta pemilik memutus koneksinya, atau pakai fitur User Tambahan di Data Usaha pemilik.
4. **Galat "hak Administrator"** dikenali di `POST /accurate/databases/select`: respons `422 {code: "ACCURATE_ADMIN_REQUIRED", installUrl}`; `installUrl` hanya diteruskan bila `https` dan host persis `account.accurate.id` (selain itu `null`). Web menampilkan penjelasan + tombol buka tautan instalasi (tab baru, `rel="noopener noreferrer"`), dan memvalidasi ulang host. Dicatat sebagai peringatan (kondisi yang diharapkan), bukan galat Sentry.

## Alternatif yang Dipertimbangkan
- **Tidak menukar kode sebelum tahu pemiliknya** — tidak mungkin: identitas akun hanya ada setelah penukaran.
- **Biarkan seperti sekarang + hanya perbaiki pesan** — ditolak: pemilik sah tetap bisa putus diam-diam setiap ada percobaan orang lain.
- **Hidupkan kembali baris `revoked`** — ditolak: membatalkan pemutusan yang disengaja.
- **Izinkan dua akun Facport berbagi satu akun Accurate** — ditolak: tiap otorisasi saling mematikan token (Fase 141 E2); berbagi dilakukan lewat User Tambahan.

## Konsekuensi
- Orang yang bisa login ke akun Accurate itu (syarat menyelesaikan OAuth) dapat me-refresh token pemilik — tidak memberi kemampuan baru (ia memang dapat mencabut/otorisasi ulang di Accurate), dan sebelumnya justru memutus pemilik.
- Test lama "koneksi pemilik lama tidak tersentuh" diubah: pemilik TETAP milik A (user, penunjuk), token diperbarui.
- Satu aksi riwayat baru (panjang 16 ≤ 20) dan satu kode galat baru.
- **Risiko residual (audit Fase 192, Low, diterima):** dua callback bersamaan untuk akun Accurate yang sama (pemilik menyambung ulang + percobaan akun lain dalam beberapa detik) bisa membuat DB memegang token yang bukan terbitan terakhir (urutan tulis ≠ urutan terbit). Gejalanya 401 → `expired`, pulih dengan Hubungkan Ulang; tidak ada kebocoran data. Penjaga `expires_at` tidak dipasang karena memblokir pemulihan baris `expired` yang `expires_at`-nya masih di masa depan.
- **Hardening (audit Info):** tautan instalasi juga ditolak bila memuat port (`url.port` harus kosong), di API dan web.

