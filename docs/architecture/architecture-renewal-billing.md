# Architecture — Perpanjangan Terjadwal & Tagihan Otomatis (Fase 181)

> Keputusan & alasan: `docs/decisions/adr-0042-perpanjangan-terjadwal-tagihan-otomatis.md`. Dasar periode/jangkar/perpanjangan: ADR-0041 + `architecture-subscription.md`. Invoice/pembayaran: `architecture-payment.md`. Pengingat: `lib/subscription-reminders.ts` + job `NOTIFY_EXPIRING_SOON`.

## Alur
```
[Admin assign / detail user]        [Job harian 09:00 zona perusahaan]                [Pelanggan]
 set renewal_interval ───────────►  issueDueRenewalInvoices(now):                      
                                     langganan aktif, non-trial, flagged,               
                                     berakhir ≤ 7 hari, belum ditagih siklus ini         
                                       → kelompokkan per Data Usaha + hari-berakhir     
                                       → buat invoice (origin=renewal, due=berakhir)  ─► notifikasi + email "Tagihan perpanjangan terbit" (link bayar)
                                       → set renewal_invoiced_for_end_at, lastReminder=7
                                     pengingat H-3/H-1 (varian "tagihan belum dibayar") ─► notifikasi + email
                                                                                          bayar → admin setujui
                                                  activateInvoiceItems (SUDAH ADA) ◄──────┘
                                                  → diperpanjang di tempat dari akhir lama (jangkar); flag terbawa
```

## Data (migrasi 0045, semua aditif)
| Tabel | Kolom | Arti |
|---|---|---|
| `subscriptions` | `renewal_interval varchar(10) NULL` | `monthly` / `yearly` / NULL (tidak terjadwal) |
| `subscriptions` | `renewal_invoiced_for_end_at timestamptz NULL` | tanggal berakhir yang sudah ditagih (idempoten per siklus) |
| `invoice_items` | `renewal_interval varchar(10) NULL` | snapshot niat "perpanjangan berikutnya" — dipasang ke langganan saat invoice diaktifkan (mode "Kirim invoice") |
| `orders` | `origin varchar(12) NOT NULL DEFAULT 'checkout'` | `checkout` / `admin` / `renewal` |
Tanpa backfill: semua langganan lama `NULL` → perilaku tidak berubah sampai admin menandai.

## Backend
- `lib/renewal-billing.ts`
  - `RENEWAL_INVOICE_DAYS_BEFORE = max(SUBSCRIPTION_REMINDER_THRESHOLDS)` (7; satu sumber dengan pengingat).
  - `selectDueRenewals(now, tz)`: kandidat (aktif, non-trial, `renewal_interval` ≠ NULL, `end_at` ∈ (now, now+7 hari], `renewal_invoiced_for_end_at` ≠ `end_at`, modul bukan seat) + pengelompokan (Data Usaha × hari-berakhir menurut zona perusahaan).
  - `issueRenewalInvoice(tx, group, …)`: kunci baris langganan `FOR UPDATE` (validasi ulang), cek `inFlightModuleKeys` (ada pesanan berjalan → lewati TANPA menandai), cari paket aktif modul × periode (termurah; tak ada → tandai + notifikasi admin), `createInvoiceAndOrder` (parameter baru `dueDate`, `origin: "renewal"`, penerima = pemilik Data Usaha SAAT INI), set `renewal_invoiced_for_end_at` & `last_reminder_threshold_days = 7`.
  - `issueDueRenewalInvoices(now)`: orkestrasi per kelompok (satu transaksi per kelompok; galat satu kelompok tidak menghentikan yang lain; hasil dilog), dipanggil di AWAL handler `NOTIFY_EXPIRING_SOON` (dibungkus try/catch — pengingat tetap jalan).
- Pengingat H-3/H-1 untuk langganan flagged dengan tagihan terbuka memakai teks varian ("tagihan INV/… belum dibayar") + link; selain itu teks lama.
- Notifikasi baru: `renewal_invoice_issued` (pelanggan, link `/billing`), `admin_renewal_invoice_failed` (admin).
- `activateInvoiceItems`: setelah membuat/memperpanjang langganan, pasang `renewal_interval` dari `invoice_items.renewal_interval` (bila ada).
- `assignPlanToDataUsaha` (mode Gratis) & `createManualSubscriptions`/bulk/users: parameter `renewalInterval` (diabaikan untuk seat).
- Endpoint (semua `subscriptions.manage` kecuali dinyatakan lain):
  - `PATCH /admin/subscriptions/:id/renewal` `{ renewalInterval: monthly|yearly|null }` — hanya non-trial modul aktif.
  - `POST /admin/subscriptions/:id/renewal-invoice` (+ `invoices.manage`) — terbitkan manual sekarang (abaikan jendela 7 hari; tetap ikut guard in-flight & paket), menandai siklus.
  - `POST /admin/subscriptions/bulk` & `POST /admin/users`: field `renewalInterval`.
  - `PATCH /me/subscriptions/:id/renewal` `{ renewalInterval: null }` — pelanggan (pemilik Data Usaha, BUKAN member) hanya mematikan.

## Web
- `components/subscription/renewal-interval-field.tsx` — "Perpanjangan berikutnya: Tidak ada / Bulanan / Tahunan" + keterangan "Tagihan perpanjangan terbit otomatis 7 hari sebelum berakhir"; dipakai Tambah User & Kelola Langganan (tidak untuk seat/trial).
- Detail user: lencana "Perpanjangan: Tahunan" per langganan; dialog Ubah Masa Aktif memuat pilihan yang sama (+ tombol "Terbitkan tagihan sekarang").
- Pelanggan: panel fitur di `/subscribe` menampilkan "Perpanjangan terjadwal: Tahunan — tagihan terbit 7 hari sebelum berakhir" + tombol "Matikan"; invoice dari job tampil biasa di `/billing` dengan lencana "Tagihan perpanjangan" (`orders.origin`).

## Kasus tepi & jawaban
| Kasus | Perilaku |
|---|---|
| Sudah diperpanjang manual sebelum H-7 | `end_at` bergeser → tidak masuk jendela / `renewal_invoiced_for_end_at` ≠ `end_at` lagi → siklus berikutnya normal |
| Ada pesanan berjalan untuk modul itu | dilewati tanpa menandai (dicoba lagi besok); tidak ada tagihan dobel |
| Tagihan dibatalkan | tidak diterbitkan ulang di siklus itu; admin bisa terbitkan manual |
| Tidak dibayar sampai berakhir | langganan berakhir seperti biasa; invoice kedaluwarsa otomatis (jatuh tempo = berakhir); penanda tidak berpindah ke langganan baru |
| Dibayar setelah berakhir | (jika invoice masih `pending`) disetujui → langganan baru dari saat disetujui |
| Langganan multi-fitur berakhir bersamaan | 1 invoice multi-item per Data Usaha per hari-berakhir; jatuh tempo = berakhir terawal |
| Kepemilikan Data Usaha dipindah | tagihan ke pemilik SAAT INI; penanda tetap pada langganan |
| Harga paket berubah | tagihan memakai harga paket saat terbit |
| Trial / seat | tidak pernah diberi penanda |
| Job gagal separuh jalan | satu transaksi per kelompok + penanda per langganan → aman diulang |

## Pengujian (rencana)
Murni: pemilihan kandidat/jendela 7 hari, pengelompokan, batas hari (zona WIB), idempoten. DB: terbit tepat sekali per siklus; tidak terbit untuk trial/seat/tanpa penanda/di luar jendela/dengan pesanan berjalan; paket tak ada → penanda + notifikasi admin; jatuh tempo = berakhir terawal; pengingat varian; aktivasi memperpanjang dari akhir lama & membawa penanda; endpoint (izin, kepemilikan, validasi); web: field, lencana, tombol matikan.

## Rilis
Migrasi aditif (deploy Full + `db:migrate` + backup). Fase besar & menyentuh pembayaran → verifikasi manual (lokal/staging) SEBELUM merge ke `main` (SOP). Sebelum rilis, hitung dampak: berapa langganan akan ditandai (awalnya 0 — tidak ada perubahan perilaku).
