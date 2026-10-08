# Fase 181 — Perpanjangan terjadwal & tagihan otomatis

**Status:** Planned (menunggu konfirmasi rencana) · ADR-0042 · `docs/architecture/architecture-renewal-billing.md`

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
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error
- [ ] Lint nol error
- [ ] Security review dijalankan (skill `security-review` / subagen `security-auditor`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] Verifikasi manual (lokal/staging) oleh pemilik SEBELUM merge ke `main`
- [ ] `docs/PROGRESS.md` diupdate
