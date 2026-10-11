# ADR-0045: Kebijakan hapus permanen dan anonimisasi akun pelanggan

**Status:** Proposed (menunggu persetujuan user; user menyatakan "boleh" untuk aksi massal termasuk hapus total, 2026-10-12)
**Tanggal:** 2026-10-12
**Terkait:** `docs/architecture/architecture-admin-insight.md` § 5.4 & 5.5, ADR-0027 (nonaktifkan user), Fase 189H

## Context
Admin hanya bisa **menonaktifkan** akun (reversibel, ADR-0027). Tidak ada hapus. User meminta aksi massal di `/admin/users`, termasuk hapus total dari database. Fakta kode (diperiksa 2026-10-12): `user.id` direferensikan 28 kolom di 16 file skema; hanya `session`, `account`, dan `user_roles` yang cascade. Sisanya (`data_usaha`, `subscriptions`, `invoices`, `orders`, `import_batches`, `member_seats`, `audit_logs.actor_id`, dll.) TIDAK cascade. Invoice dan order adalah catatan akuntansi; menghapusnya merusak angka keuangan yang justru diminta client. Preseden: penghapusan akun pelanggan sebelumnya dilakukan manual lewat SQL berantai (lessons-learned 2026-09-17).

## Decision
Tiga tingkat, semua hanya **Super Admin** (`users.manage`):
1. **Nonaktifkan / Aktifkan** (sudah ada) — tersedia juga sebagai aksi massal.
2. **Hapus permanen** — HANYA untuk akun **tanpa jejak bisnis**: tidak punya invoice, order, langganan, import batch, seat aktif/pernah ada, transfer kepemilikan, dan koneksi Accurate; Data Usaha miliknya (bila ada) kosong. Pemeriksaan di server (bukan hanya UI); akun yang tidak lolos ditolak dengan daftar alasan per akun. Hapus berantai hanya pada baris turunan yang kosong (Data Usaha kosong, sesi, akun login, role, notifikasi, objek MinIO miliknya).
3. **Anonimisasi** — untuk akun dengan jejak bisnis yang harus "dihapus" (permintaan pelanggan/UU PDP): nama, email, telepon, WhatsApp, Nama Perusahaan diganti penanda anonim, akun dinonaktifkan, sesi dan akun login dibuang; baris invoice/order/langganan TETAP (angka keuangan utuh).
Pengaman wajib: konfirmasi ketik (mis. jumlah akun atau kata "HAPUS"), ringkasan dampak sebelum eksekusi, tidak bisa menghapus diri sendiri atau Super Admin terakhir, tidak berlaku untuk akun admin/staf (lewat halaman Tim Internal), ditolak bila ada import berjalan di Data Usaha milik akun, audit log per akun (snapshot email, penanda, alasan, admin), dan peringatan backup. Aksi massal dibatasi per halaman tampil (≤ 100 baris) agar sinkron dan ringan.

## Alternatif yang Dipertimbangkan
- Hapus total semua jejak termasuk invoice/order — ditolak: merusak catatan akuntansi dan angka laporan uang; tanpa cascade berarti hapus berantai manual berisiko.
- Hanya nonaktifkan — tidak memenuhi permintaan bersih-bersih akun uji/duplikat dan permintaan penghapusan data pribadi.
- Hapus lunak (flag `deleted_at`) — ditolak: tidak benar-benar menghapus data pribadi, menambah filter di setiap query.

## Konsekuensi
- Pekerjaan sub-fase tersendiri (189H) dengan audit keamanan penuh (subagent `security-auditor`) dan uji untuk setiap FK.
- Pelanggan yang meminta penghapusan data akan menjadi akun anonim di laporan; angka uang tidak berubah.
- Bila client tetap menuntut penghapusan total jejak keuangan, itu keputusan terpisah (ADR baru) dan bukan bagian fase ini.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-0045" di file baru itu.
