# Fase 176 — Perpanjangan dini

**Status:** Done · **Mulai:** 2026-10-07 · **Selesai:** 2026-10-07 · ADR-0041 poin 4

## Tujuan
Pelanggan (dan admin) boleh memperpanjang langganan yang MASIH AKTIF kapan saja; akhir baru dihitung dari TANGGAL & JAM BERAKHIR saat ini (bukan dari saat pembayaran disetujui), sehingga tidak ada hari yang hilang. Yang sudah habis saat disetujui → langganan baru dari saat disetujui.

## Scope
- [x] `computeRenewalEnd` (subscription-period.ts, murni, dipakai server & web): selaras jangkar → jangkar + total bulan; tidak selaras (jangkar kosong/diubah manual/zona berbeda di batas bulan) → jangkar baru di akhir saat ini
- [x] Tabel `subscription_renewals` (migrasi 0043) + `lib/subscription-renewal.ts` (`findRenewableSubscription`, `renewSubscriptionInPlace` dengan row lock, `paymentVerifiedBody`)
- [x] Konfirmasi order: modul aktif non-trial & end_at > sekarang → diperpanjang di tempat (tanpa baris baru, tanpa dibatalkan); sudah lewat end_at → ditandai expired + langganan baru; trial tetap digantikan; seat tidak berubah
- [x] Checkout: modul aktif boleh dibeli lagi; hanya pesanan yang belum selesai (in-flight) yang memblokir — kode baru `MODULE_ORDER_IN_PROGRESS`
- [x] Assign admin tanpa `endAt` untuk modul aktif = perpanjangan (`renewed: true`); dengan `endAt` = override (alur lama)
- [x] Invoice (admin + PDF) menampilkan "Perpanjangan: akhir lama – akhir baru" (`attachSubscriptionDates` + `isRenewal`)
- [x] Notifikasi "Pembayaran terverifikasi" menyebut tanggal+jam berlaku sampai; reminder (`lastReminderThresholdDays`) direset
- [x] Web: halaman subscribe menawarkan "Perpanjang" (periode tidak dikunci, pratinjau akhir baru WIB identik dengan server); toast admin menyebut jumlah diperpanjang
- [x] `cleanup-test-data.ts` menghapus `subscription_renewals`
- [ ] DITUNDA: perpanjangan dini SEAT (ADR-0041 poin 6; logika yang sama, UI/slot terpisah)
- [ ] DITUNDA ke Fase 177: UI admin (`SubscriptionPicker`) dengan mode Perpanjang — API-nya sudah ada

## Keputusan Kecil Selama Eksekusi
- Perpanjangan memakai periode paket YANG DIBELI (snapshot invoice item): tahunan di atas bulanan = +12 bulan dari jangkar yang sama (total 13).
- Pembayaran disetujui SETELAH langganan habis tidak "menyambung" ke akhir lama (keputusan pemilik: pelanggan tidak memakai fitur di masa jeda, tidak ada hak terambil).
- Zona tanpa DST: selisih zona tetap → jangkar tetap selaras kecuali di batas akhir bulan yang berbeda hari antar-zona (ditangani: re-anchor, tidak menggeser tanggal lama).
- `renewSubscriptionInPlace` mengunci baris (FOR UPDATE) dan menghitung ulang dari nilai terbaru — dua perpanjangan bersamaan tidak saling menimpa.
- Kode galat checkout diganti `MODULE_ORDER_IN_PROGRESS` (arti lama "sudah aktif" tidak berlaku lagi); `MODULE_ALREADY_SUBSCRIBED` tetap dipakai jalur TRIAL (tidak bisa trial modul yang sudah berlangganan).

## Ringkasan Hasil
API: 2020 tes lulus (tes baru: perpanjangan konfirmasi order ×5, assign admin ×3, `computeRenewalEnd` ×6, notifikasi ×3, checkout diperbarui); web: panel harga ×3 dan seluruh suite lulus; typecheck & lint bersih.

## Known Limitations
- Seat belum bisa diperpanjang dini. UI admin untuk "Perpanjang" menunggu Fase 177 (dialog lama menyembunyikan paket modul yang aktif). Belum dilihat di browser.
- Migrasi 0042 + 0043 belum di production (deploy Full + `db:migrate` saat rilis).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual): perpanjangan HANYA terjadi saat admin menyetujui pembayaran (`orders.manage`) atau admin assign (`subscriptions.manage`); Data Usaha order sudah divalidasi kepemilikan saat checkout; row lock mencegah lost update; tanpa raw SQL kecuali `FOR UPDATE` parameterized
- [x] Temuan Medium/Low dicatat bila ditunda (seat; lihat di atas)
- [x] `docs/PROGRESS.md` diupdate
