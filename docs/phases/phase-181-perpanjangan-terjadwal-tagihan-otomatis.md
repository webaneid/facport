# Fase 181 — Perpanjangan terjadwal & tagihan otomatis

**Status:** Done (menunggu verifikasi manual pemilik sebelum rilis) · **Mulai:** 2026-10-08 · ADR-0042 · `docs/architecture/architecture-renewal-billing.md`

## Tujuan
Langganan bisa ditandai "diperpanjang Bulanan/Tahunan"; tagihan perpanjangan terbit otomatis 7 hari sebelum berakhir (sejalan dengan pengingat), dikirim lewat notifikasi + email dengan link bayar; setelah dibayar & disetujui masa aktif bertambah dari tanggal berakhir (tanpa kehilangan hari).

## Scope
- [ ] Migrasi 0045: `subscriptions.renewal_interval`, `subscriptions.renewal_invoiced_for_end_at`, `invoice_items.renewal_interval`, `orders.origin`
- [ ] `lib/renewal-billing.ts` (pemilihan kandidat, pengelompokan, penerbitan, orkestrasi) + `createInvoiceAndOrder` menerima `dueDate`/`origin`
- [ ] Job: terbit di awal `NOTIFY_EXPIRING_SOON`; pengingat H-3/H-1 varian "tagihan belum dibayar"; notifikasi `renewal_invoice_issued` & `admin_renewal_invoice_failed` (+ email)
- [ ] `activateInvoiceItems` / `assignPlanToDataUsaha` / bulk / users / manual-subscription membawa `renewalInterval`
- [ ] Endpoint: set penanda (admin), terbitkan manual (admin), matikan (pelanggan)
- [ ] Web: `RenewalIntervalField` (Tambah User, Kelola Langganan), lencana + edit di detail user, tombol "Terbitkan tagihan sekarang", panel pelanggan + "Matikan", lencana "Tagihan perpanjangan" di /billing
- [ ] Tes (murni + DB + endpoint + web), typecheck, lint, security review (fase besar → subagent `security-auditor` bila disetujui), dokumen, lessons-learned

## Di luar scope (fase terpisah)
- Notifikasi mode Gratis & perubahan masa aktif oleh admin → Fase 182
- Perpanjangan kursi (Slot User Tambahan), termasuk perpanjangan terjadwal untuk kursi → Fase 183
- Pelanggan menyalakan perpanjangan terjadwal sendiri (keputusan komersial)
- Penarikan dana otomatis

## Keputusan Kecil Selama Eksekusi
- Endpoint pelanggan `PATCH /me/subscriptions/:id/renewal` hanya menerima `{renewalInterval: null}` (hanya MEMATIKAN); pemilik Data Usaha saja.
- Penerbitan manual tanpa penanda tidak menyalakan siklus berulang setelah dibayar.
- Item seat/trial tidak pernah diberi penanda.
- Hasil audit keamanan (0 Critical/High, 3 Medium): penerbitan sekarang mengunci baris user pemilik sebelum membaca pesanan berjalan; galat notifikasi/email pasca-commit dicatat tanpa menjadikan kelompok gagal; pengingat H-3/H-1 tagihan perpanjangan dikirim ke pemilik Data Usaha SAAT INI.

## Ringkasan Hasil
Migrasi 0045 (aditif): `orders.origin`, `subscriptions.renewal_interval` + `renewal_invoiced_for_end_at`, `invoice_items.renewal_interval`. Job harian `NOTIFY_EXPIRING_SOON` menerbitkan tagihan perpanjangan H-7 (satu invoice per Data Usaha per hari berakhir, jatuh tempo = tanggal berakhir), notifikasi + email link bayar; H-3/H-1 mengingatkan tagihan belum dibayar. Admin: atur penanda (tambah user, kelola paket, dialog masa aktif) + "Terbitkan tagihan sekarang". Pelanggan: info + tombol Matikan. Lencana "Tagihan perpanjangan". Tes: API 2104 lulus, web 396 lulus; typecheck & lint nol.

## Known Limitations
- Pelanggan belum bisa menyalakan sendiri (keputusan komersial, v1).
- Tagihan dibatalkan tidak terbit ulang otomatis di siklus yang sama.
- Tidak ada tes konkurensi paralel untuk penerbitan ganda (dijaga row lock user).
- `renewalPayUrl` fallback ke localhost bila `APP_ORIGIN_PROD` kosong; `/me/subscriptions` menampilkan penanda juga ke member seat (tidak sensitif); PATCH admin renewal tanpa WHERE status atomik (Low).
- Deploy butuh migrasi 0045 → runbook Full + backup.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Security review dijalankan (skill `security-review` / subagen `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] Verifikasi manual (lokal/staging) oleh pemilik SEBELUM merge ke `main`
- [x] `docs/PROGRESS.md` diupdate
