# Fase 174 — Konsolidasi jalur aktivasi langganan

**Status:** Done · **Mulai:** 2026-10-06 · **Selesai:** 2026-10-06 · ADR-0041

## Tujuan
Semua jalur yang membuat langganan memakai fungsi periode yang sama (`computeSubscriptionPeriod`), dengan satu `now` per transaksi, jangkar tercatat, dan admin tetap bisa mengatur tanggal+jam akhir sendiri. Trial tidak disentuh.

## Scope
- [x] `computeSubscriptionPeriod` (subscription-period.ts) + tes
- [x] Konfirmasi order (`admin/orders.route.ts`): mulai = saat disetujui, akhir kalender, periode dari SNAPSHOT invoice → periode paket → tebakan hari; jangkar diisi; satu `now` per order
- [x] Tambah User "sudah dibayar" (`lib/manual-subscription.ts`; mencakup seat) — kalender + jangkar
- [x] Assign admin (`POST /admin/subscriptions`): `endAt` opsional — tanpa `endAt` dihitung dari periode paket; dengan `endAt` = override (jangkar kosong)
- [x] Ubah tanggal manual (`PATCH /admin/subscriptions/:id`): jangkar dikosongkan
- [x] Web: komponen `DateTimeField` (tanggal+jam WIB), dialog Ubah Masa Aktif (tombol +1 bulan/+3 bulan/+1 tahun kalender, hanya kirim bila diubah), dialog Kelola Langganan di /users (pratinjau otomatis dari paket + "atur sendiri")
- [x] Trial TIDAK diubah (tetap hari)

## Keputusan Kecil Selama Eksekusi
- Konfirmasi order memakai SNAPSHOT `invoice_items.interval` (yang ditagihkan) — bukan periode paket saat ini — supaya paket yang diedit setelah invoice terbit tidak mengubah hak pelanggan.
- Pratinjau "berakhir ..." di dialog assign dihitung klien dengan fungsi yang sama dengan server tetapi ditandai "dihitung saat tombol Assign ditekan" (selisih detik antara klik dan server tidak disembunyikan).
- Tombol cepat +1 bulan/+3 bulan/+1 tahun di dialog Ubah Masa Aktif menghitung dari akhir saat ini (kalender); karena PATCH mengosongkan jangkar, perpanjangan berantai oleh admin bisa menggeser tanggal akhir-bulan — digantikan perpanjangan berbasis jangkar di Fase 176.
- Dialog assign/ubah masa aktif nanti digantikan `SubscriptionPicker` (Fase 177); perubahan di sini minimal agar perilaku benar sampai saat itu.
- Supersede (batalkan langganan aktif modul yang sama lalu mulai baru) TIDAK diubah di fase ini — diganti perpanjangan dini di Fase 176.

## Ringkasan Hasil
Empat jalur aktivasi memakai satu fungsi; tes baru: `subscriptions.route.test.ts` (sebelumnya tidak ada; 5 tes), orders & users diperbarui ke semantik kalender, `date-time-field.test.tsx` (4), `timezone.test.ts` (3), `subscription-period.test.ts` (+2). Typecheck, lint, 341 tes web & tes API terkait lulus.

## Known Limitations
- Gerbang akses belum mengecek `end_at` (Fase 175). UI belum dilihat di browser.
- Migrasi 0042 + perilaku baru belum di production (deploy Full + `db:migrate` bersama 175).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual, ≤3 file route: permission `subscriptions.manage`/`orders` tidak berubah; `endAt` tetap divalidasi `date-time` & harus di masa depan; tanpa raw SQL; tanpa endpoint baru)
- [x] Temuan Medium/Low dicatat bila ditunda (tidak ada)
- [x] `docs/PROGRESS.md` diupdate
