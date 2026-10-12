# Architecture — Riwayat Data Usaha (Koneksi Accurate & Akses User Tambahan)

> Fase 189B. Satu aliran peristiwa per Data Usaha di `audit_logs`, dipakai halaman admin (panel "Akses & Riwayat" di detail user) dan laporan lintas pelanggan
> "Riwayat Koneksi" (189C–D) untuk butir 4 dan 9 kebutuhan client FAC (`architecture-admin-insight.md`). Kode: `apps/api/src/lib/data-usaha-events.ts`,
> `lib/seat-actions.ts`, `routes/admin/seats.route.ts`; UI: `apps/web/lib/data-usaha-history.ts`, `components/admin/data-usaha-access-panel.tsx`.

## Bentuk data
`audit_logs` dengan `entity_type = 'data_usaha'`, `entity_id` = id Data Usaha, `actor_id` = pelaku, `changes` JSONB. `action` ≤ 20 karakter (kolom `varchar(20)`).
Pembaca WAJIB menyaring `action` ke daftar di bawah (`listDataUsahaEvents`) karena entitas yang sama juga memuat aksi lain (mis. `transfer_ownership`, `update`).

## Kamus peristiwa
| `action` | Pelaku | `changes` | Arti untuk laporan |
|---|---|---|---|
| `connect_accurate` | pemilik | `via` (`oauth`/`attach`), `accurateConnectionId`, `accountEmail` | pelanggan menyambungkan akun Accurate — `accountEmail` membantu melihat "salah akun" |
| `select_database` | pemilik | `accurateDbId`, `alias` | pilihan database Accurate |
| `confirm_database` | pemilik | `accurateDbId`, `alias` | konfirmasi database yang tersimpan |
| `reset_database` | pemilik | `previousDbId`, `previousAlias` | **koreksi mandiri** ("Pilih yang Lain") — pelanggan salah pilih lalu memperbaiki sendiri |
| `disconnect_accurate` | admin | `previousConnectionId`, `previousAccurateDbId`, `previousAccurateDbAlias`, `removedAccount`, `affectedDataUsahaIds`, **`reason: {code, note} \| null`** | admin memutus koneksi. `code`: `salah_database` · `salah_akun` · `lainnya`; `note` catatan internal. Data lama (pra-189B) tidak punya `reason` |
| `invite_seat` | pemilik / admin(*) | `seatId`, `email`, `by` | undangan User Tambahan |
| `revoke_seat` | pemilik / admin | `seatId`, `previousStatus`, `email`, `memberUserId`, `by`, `reason?` (WAJIB bila admin), `newInviteEmail?` | pencabutan / pemindahan akses |
(*) admin mengundang hanya lewat pemindahan (`newInviteEmail` pada `revoke_seat`); tidak ada `invite_seat` oleh admin.

## Cara membaca cerita "salah → putus → benar" (butir 9)
Urutan per Data Usaha, terbaru dulu: `select_database "PT Salah"` → `reset_database` (koreksi mandiri) ATAU `disconnect_accurate` (admin, `reason.code`) → `connect_accurate` → `select_database "PT Benar"`.
- "Salah koneksi" = pelanggan yang Data Usahanya punya `reset_database` atau `disconnect_accurate`.
- Klasifikasi admin hanya ada bila `reason.code` diisi (opsional, D10); sisanya "tidak diklasifikasi".
- Sisi "benar" untuk data SEBELUM 189B diturunkan dari keadaan sekarang (`data_usaha.accurate_db_alias`), bukan peristiwa historis.

## Aturan pakai (kode)
- **Dalam transaksi**: `insertDataUsahaEvent(tx, …)` — melempar bila gagal supaya aksi dan jejaknya selalu bersama (dipakai `seat-actions`).
- **Alur pelanggan yang tak boleh gagal** (callback OAuth, pilih database): `recordDataUsahaEvent(…)` — NON-FATAL, kegagalan dicatat tanpa PII.
- Aksi baru yang mengubah koneksi/akses WAJIB mencatat peristiwa dan menambah baris di kamus ini + `describeDataUsahaEvent` (web) + tesnya.
- Nama aksi baru ≤ 20 karakter.

## Seat (User Tambahan) — aksi admin
`POST /admin/data-usaha/:id/seats/:seatId/revoke {reason (3–500 setelah trim, wajib), newEmail?}`
- Izin `subscriptions.manage` (admin & staf); baca `GET /admin/data-usaha/:id/access` (`users.view`).
- Seat HARUS milik `:id` (selain itu 404 `SEAT_NOT_FOUND`); slot sudah tersedia → 400 `SEAT_ALREADY_AVAILABLE`; dua aksi bersamaan dijalankan bergiliran (kunci baris).
- Sesi member dicabut (SEMUA sesi akunnya — perilaku lama dipertahankan; non-fatal bila gagal). Pemilik mendapat notifikasi in-app (`seat_access_changed_by_admin`, tujuan `/team`) DAN email, keduanya generik **tanpa** alasan; member tidak diberi tahu.
- Pindahkan akses: `newEmail` → slot langsung `invited`; email dikirim atas nama "Tim Facport" dan hanya mengklaim hal yang dipenuhi sistem ("pemilik telah diberi tahu"); token mentah hanya di tautan email, hash di DB. Menerima undangan bersyarat (`linkSeatToMember`: slot masih `invited` + hash token sama) agar slot yang baru dicabut tidak hidup lagi.
- Alasan = catatan INTERNAL; hanya tampil di panel admin.

## Keterbatasan
- Riwayat dimulai sejak 189B (kecuali `disconnect_accurate` lama).
- `audit_logs` menyimpan email member/undangan/akun Accurate (PII) → kebijakan hapus/anonimisasi akun (189H, ADR-0045) harus mencakup `changes` riwayat.
- Belum ada indeks `(entity_type, action, created_at)`; cukup pada volume sekarang — evaluasi di 189C bila laporan lintas pelanggan lambat.
- Belum tercatat: penerimaan undangan (`accept_seat`) dan kirim ulang (`resend_seat`) — kandidat 189C/D.
- "Hapus akun Accurate" menulis entri `disconnect_accurate` untuk SETIAP Data Usaha terdampak (`viaDataUsahaId` menunjuk yang diklik admin).
- Izin `newEmail` sama dengan cabut (`subscriptions.manage`); pengetatan = keputusan D22.
- Laporan lintas pelanggan "Riwayat Koneksi" belum ada (189C–D).
