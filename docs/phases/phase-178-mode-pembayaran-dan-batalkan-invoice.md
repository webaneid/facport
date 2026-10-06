# Fase 178 — Mode pembayaran saat assign + batalkan invoice

**Status:** Done · **Mulai:** 2026-10-07 · **Selesai:** 2026-10-07

## Tujuan
Dua celah ditemukan 2026-10-07: (1) saat admin memberi paket (Tambah User & Kelola Langganan) hanya ada "aktifkan langsung tanpa invoice" — tidak ada opsi "kirim invoice" di Kelola Langganan dan tidak ada invoice yang OTOMATIS LUNAS (catatan/PDF untuk pembukuan); (2) tidak ada cara membatalkan invoice sama sekali (status `void`/`expired` ada di skema tapi tidak pernah diisi) — padahal order yang belum selesai memblokir pembelian & perpanjangan modul yang sama (Fase 176).

## Keputusan (pemilik, 2026-10-07)
- **3 mode pembayaran** di Tambah User & Kelola Langganan: **Kirim invoice** (customer bayar sendiri), **Sudah dibayar** (invoice dibuat OTOMATIS LUNAS + langganan langsung aktif & tertaut ke invoice), **Gratis / tanpa invoice** (perilaku lama, dipertahankan untuk hadiah/kompensasi).
- **Batalkan invoice** oleh admin DAN oleh customer sendiri. Invoice yang sudah lunas TIDAK bisa dibatalkan di sini (refund/pembalikan langganan di luar scope).
- **Invoice yang belum dibayar kedaluwarsa otomatis.**
- **Kode unik = 0** untuk invoice yang dilunasi admin.
- 1 invoice = 1 Data Usaha (desain sengaja, tidak berubah); multi-langganan dalam 1 invoice sudah didukung.

## Aturan yang dipilih saat eksekusi
- Bayar-oleh-admin & gratis hanya lewat `subscriptions.manage`; kirim-invoice dari Kelola Langganan juga butuh `invoices.manage`.
- Tanggal akhir kustom (override) HANYA untuk mode Gratis (kontrak khusus); mode invoice mengikuti periode paket (invoice menampilkan masa berlaku).
- Batalkan: order `pending` | `submitted` | `rejected` → order `cancelled`, invoice `void`, alasan + jejak audit + notifikasi ke customer (jika admin yang membatalkan). Customer hanya boleh membatalkan `pending` | `rejected` (bukti sudah diunggah = menunggu admin, tidak dibatalkan sepihak).
- Kedaluwarsa otomatis: hanya order `pending` (belum ada bukti) yang `due_date`-nya lewat → order `expired`, invoice `expired`, notifikasi ke customer. `submitted`/`rejected` TIDAK pernah kedaluwarsa otomatis.

## Scope
- [x] `lib/order-activation.ts`: aktivasi item invoice (perpanjang/supersede/buat/seat) diekstrak dari konfirmasi order — dipakai konfirmasi & jalur "sudah dibayar"
- [x] Invoice lunas oleh admin: `createPaidInvoiceAndOrder` (invoice paid, order paid, method `manual`, kode unik 0, `confirmedBy`) + aktivasi
- [x] `POST /admin/subscriptions/bulk` & `POST /admin/users`: parameter `payment` (`invoice` | `paid_invoice` | `free`), `markAsPaid` lama dipetakan ke `free`
- [x] Batalkan: kolom `orders.cancelled_at/cancelled_by/cancel_reason` (migrasi 0044), `POST /admin/orders/:id/cancel`, `POST /orders/:id/cancel` (customer)
- [x] Job `EXPIRE_UNPAID_ORDERS` (tiap jam) + 2 tipe notifikasi baru (`order_cancelled`, `order_expired`)
- [x] Web: pilihan mode pembayaran (Tambah User, Kelola Langganan), dialog Buat Invoice memakai SubscriptionPicker, tombol Batalkan (admin: invoice & orders; customer: tagihan), badge status

## Referensi
- `docs/architecture/architecture-payment.md`, `docs/architecture/architecture-subscription.md` (ADR-0041)
- ADR terkait: `docs/decisions/adr-0041-periode-langganan-kalender.md`

## Keputusan Kecil Selama Eksekusi
- Default mode: Tambah User = "Kirim invoice" (perilaku lama); Kelola Langganan = "Sudah dibayar" (sebelumnya tanpa invoice) agar default-nya meninggalkan catatan pembukuan; "Gratis" tetap tersedia.
- "Buat Invoice" admin (/invoices) memakai SubscriptionPicker; `POST /admin/invoices` kini juga menolak fitur yang masih tertahan pesanan belum selesai (konsisten).
- Ditemukan & ditutup: race unggah bukti × pembatalan/kedaluwarsa (update status bersyarat) — `docs/lessons-learned.md` 2026-10-07.
- `inFlightModuleKeys` & `NON_TERMINAL_ORDER_STATUSES` dipindah ke `lib/invoice-order.ts` (satu sumber: checkout, bulk, buat invoice).
- Halaman pembayaran PUBLIK (tanpa login) sengaja TIDAK punya tombol batalkan; `OrderPayFlow` menerima `allowCancel` hanya dari halaman login.
- Tes `expireOverdueOrders` bekerja pada SEMUA order pending yang lewat jatuh tempo di DB dev (fungsinya global) — order pending lama di dev ikut kedaluwarsa saat tes dijalankan.

## Ringkasan Hasil
API 2050 tes lulus (+tes: mode pembayaran bulk ×5, Tambah User ×4, pembatalan admin/customer/kedaluwarsa ×13, riwayat user, invoice, buat-invoice in-flight, orderStatus); web 368 lulus (+dialog batalkan ×4, mode pembayaran ×2, rute notifikasi); typecheck & lint bersih. Migrasi 0044 (kolom pembatalan di orders).

## Known Limitations
- Belum dilihat di browser (dialog baru, ikon Batalkan di /billing, /invoices, /orders, pilihan mode pembayaran).
- Invoice LUNAS belum bisa dibatalkan/di-refund (di luar scope). Kedaluwarsa pertama di production akan mengedaluwarsakan semua pending lama sekaligus.
- Migrasi 0042–0044 belum di production.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual, banyak file): endpoint bulk tetap `subscriptions.manage` (+`invoices.manage` untuk mode invoice, diperiksa server); `POST /admin/orders/:id/cancel` `orders.manage`, alasan wajib & dibatasi 500 karakter; cancel customer hanya pemilik (order orang lain = 404), hanya pending/rejected; semua pembatalan/aktivasi memakai row lock `FOR UPDATE` di transaksi; kode unik 0 hanya untuk jalur admin; tanpa raw SQL selain `FOR UPDATE` parameterized; race upload×batal ditutup
- [x] Temuan Medium/Low dicatat bila ditunda (lihat Known Limitations)
- [x] `docs/PROGRESS.md` diupdate
