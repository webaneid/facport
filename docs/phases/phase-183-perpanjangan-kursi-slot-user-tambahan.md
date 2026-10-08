# Fase 183 — Perpanjangan kursi (Slot User Tambahan)
**Status:** Done (menunggu verifikasi manual pemilik sebelum rilis) · **Mulai:** 2026-10-08 · ADR-0043

## Tujuan
Kursi bisa diperpanjang per slot (aktif → diperpanjang di tempat; habis → slot yang sama dihidupkan kembali dari saat pembayaran disetujui), termasuk saat pelanggan punya banyak slot, dan ikut perpanjangan terjadwal (ADR-0042).

## Scope
- Migrasi 0046 `invoice_items.renew_subscription_id`; `createInvoiceAndOrder` menerima target slot per item.
- `activateInvoiceItems`: cabang perpanjangan/hidupkan-kembali kursi (+ fallback slot baru).
- Pelanggan: `POST /me/team/renew` (banyak slot, 1 invoice) + tombol di halaman Tim.
- Perpanjangan terjadwal: kandidat/kunci in-flight per slot untuk kursi; penanda kursi (admin PATCH & opsi "ulangi otomatis").
- Tes API + web; security review; dokumen.

## Di luar scope
- Admin memilih slot spesifik di dialog Assign (admin memakai Perpanjang cepat / penanda per langganan).
- Perubahan model harga kursi.

## Keputusan Kecil Selama Eksekusi
- Dasar harga perpanjangan kursi = paket `seat_addon` aktif termurah untuk periode yang dipilih (dihitung server).
- Perpanjang kursi dari halaman Tim: pilih beberapa slot sekaligus → 1 invoice, 1 item per slot; opsi "Ulangi otomatis" memasang penanda terjadwal per slot.
- Audit keamanan (0 Critical/High, 2 Medium, 4 Low) — semua ditindaklanjuti: guard tagihan terbuka di-scope per Data Usaha (bukan pembuat invoice, aman setelah transfer kepemilikan; berlaku juga untuk modul); fallback slot baru dicatat di audit log; slot trial ditolak; target aktivasi harus benar-benar kursi (`member_seats`) dan dikunci `FOR UPDATE` sebelum memilih cabang; rate limit `/me/team/renew` 10/menit.

## Ringkasan Hasil
Migrasi 0046 (aditif: `invoice_items.renew_subscription_id`). Kursi aktif diperpanjang di tempat; kursi habis dihidupkan kembali di slot yang sama dari saat pembayaran disetujui (anggota tetap); target dibatalkan → slot baru. Pelanggan: `POST /me/team/renew` + dialog di halaman Tim (multi-slot). Perpanjangan terjadwal ikut mencakup kursi (kunci `seat:<id>`, digabung per Data Usaha per hari berakhir). Admin: penanda per langganan kini boleh kursi. Tes: API 2118, web 400 lulus.

## Known Limitations
- Admin tidak memilih slot spesifik di dialog Assign (Assign kursi = slot baru); admin memakai penanda/Perpanjang cepat per langganan.
- Admin yang mencabut (membatalkan) slot tidak otomatis membatalkan tagihan perpanjangan terbuka — bila dibayar, pelanggan mendapat slot baru (tercatat di audit).
- `renew_subscription_id` tanpa FK/indeks (aditif; dapat ditambah bila performa perlu).
- Pengingat H-3/H-1 kursi memakai label "User Tambahan".
- Deploy butuh migrasi 0046 → runbook Full + backup.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Security review dijalankan
- [x] Temuan Critical/High diperbaiki
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` bila ditunda
- [ ] Verifikasi manual pemilik sebelum merge ke `main`
- [x] `docs/PROGRESS.md` diupdate
