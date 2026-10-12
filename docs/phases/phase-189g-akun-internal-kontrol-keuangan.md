# Fase 189G — Akun Internal & Kontrol Keuangan (Lapis 1) + Aksi Massal Tandai Internal

**Status:** Done
**Mulai:** 2026-10-12
**Selesai:** 2026-10-12

## Tujuan
Membedakan pengguna **komersil** dari **internal** (trainer, karyawan, mitra) di data, dan mengunci angka keuangan agar akun internal tidak mengotori laporan uang maupun nomor invoice. Super Admin menandai akun internal satu per satu atau massal di `/admin/users`. Keputusan: ADR-0044 (Accepted), D9 Lapis 1, D16 (role admin/staf otomatis internal). Induk: `phase-189-insight-pelanggan-admin.md`; rancangan: `architecture-admin-insight.md` § 4.4, 5.4.

## Definisi (baku)
- **Internal** = `user.is_internal = true` **ATAU** memegang role `admin`/`staff` (D16). **Komersil** = akun role `customer` yang bukan internal — status AKUN, bukan trial/langganan.
- Satu sumber kebenaran: `apps/api/src/lib/internal-accounts.ts` (helper `isInternalAccount`, `internalUserIdsSubquery`, `commercialCustomerIdsSubquery`). Laporan 189C–E WAJIB memakainya.

## Mode kerja
Menyentuh jalur uang (pembuatan invoice/order) + migrasi + aksi massal Super Admin → eksekusi langsung di sesi utama, TDD, security review subagent di akhir.

## Scope
**Backend (`apps/api`)**
- [x] B1 Skema: `user.is_internal boolean not null default false` (migrasi `0049_user_is_internal`, aditif; cek `when` jurnal).
- [x] B2 `lib/internal-accounts.ts`: helper di atas + `InternalAccountBillingError` (403 `INTERNAL_ACCOUNT_NO_BILLING`, `toResponse()` agar bekerja tanpa `.onError`); cabang eksplisit di `app.ts` `.onError` (tanpa itu berakhir 500 + Sentry).
- [x] B3 **Guard tunggal** di `createInvoiceAndOrder` (semua pembuatan invoice melewatinya: checkout pelanggan, kursi, tagihan terjadwal, 3 jalur admin; `createPaidInvoiceAndOrder` memanggilnya juga) → akun internal tidak bisa punya invoice/order baru, apa pun asalnya. Akses internal hanya lewat mode admin "gratis" (tanpa invoice).
- [x] B4 Tagihan perpanjangan terjadwal: `findDueRenewalCandidates` mengecualikan pemilik (penerima tagihan) yang internal → job harian tidak membuat invoice; penerbitan manual admin untuk internal ditolak oleh guard (403).
- [x] B5 Daftar admin: `GET /admin/users` mengembalikan `isInternal` (efektif), `internalFlag`, `internalReason` (`flag`|`role`|null) dan filter `type=all|commercial|internal`.
- [x] B6 Aksi massal (hanya `users.manage` = Super Admin): `POST /admin/users/internal/preview` (ringkasan dampak, tanpa mengubah) dan `POST /admin/users/internal` (terapkan; satu transaksi; 1–100 akun; audit log per akun `isInternal` dari→ke). Dampak yang ditampilkan: akun yang benar-benar berubah, sudah di status itu, internal karena role, jumlah + total invoice LUNAS yang akan keluar dari laporan uang, langganan berbayar aktif, tagihan perpanjangan terjadwal yang akan berhenti, invoice belum dibayar yang tertinggal.
- [x] B7 Tes API: helper (flag/role admin/role staff/customer biasa), guard (diblokir internal, lolos komersil, `createPaidInvoiceAndOrder`), route checkout pelanggan internal 403, admin invoice/paid_invoice ke internal 403 dan mode gratis lolos, job tagihan melewati internal, daftar + filter, preview/terapkan (izin staff 403, validasi 0/101 akun, idempoten, audit, dampak angka).

**Web (`apps/web`)**
- [x] W1 Daftar Pengguna: kolom kotak centang (tanpa mengubah `DataTable`; state pilihan di halaman, centang-semua = baris halaman tampil), lencana "Internal" (dan "Internal · admin" bila karena role), filter tipe, bilah aksi massal (hanya `users.manage`): "Tandai internal" / "Cabut tanda internal".
- [x] W2 Dialog konfirmasi aksi massal: memanggil preview lebih dulu, menampilkan dampak (peringatan uang bila ada), kotak persetujuan wajib bila ada invoice lunas/perpanjangan terjadwal terdampak, lalu terapkan; hasil dilaporkan.
- [x] W3 Detail user: lencana Internal + tombol tandai/cabut (dialog yang sama, 1 akun).
- [x] W4 Dialog beri langganan admin: untuk akun internal pilihan pembayaran dikunci ke "Gratis" + keterangan.
- [x] W5 Pesan ramah di checkout/tim bila API membalas `INTERNAL_ACCOUNT_NO_BILLING`.
- [x] W6 Tes (Testing Library): pilihan baris + bilah aksi, dialog dampak + persetujuan, lencana, dialog langganan internal.

**Dokumen**
- [x] D1 `architecture-admin-insight.md` § 4.4/5.4 status; `docs/architecture/architecture-internal-accounts.md` (definisi, helper, guard, aksi massal, cara memakai helper di laporan); peta `CLAUDE.md`; glosarium.
- [x] D2 PROGRESS/phase 189, lessons-learned bila ada temuan.

## Keputusan desain
- Guard di SATU fungsi pusat, bukan per route (aturan root: authorization/kontrol terpusat); error kustom ber-`status`/`toResponse()` supaya aman di aplikasi tes tanpa `.onError`.
- Menandai internal TIDAK menghapus/membatalkan data: invoice lama tetap ada; ia hanya keluar dari laporan uang (helper). Invoice belum dibayar yang tertinggal dilaporkan di dampak (pembatalan manual, di luar fase ini).
- Tidak mengubah `/admin/stats` (angka dashboard lama) — KPI komersil/internal di 189E.
- Tidak mengubah gerbang akses (`subscription-gate.ts`): internal tetap memakai langganan gratis biasa (Lapis 2 = Fase 191).
- Konfirmasi ketik hanya untuk aksi destruktif (189H); di sini cukup pratinjau dampak + kotak persetujuan karena reversibel.
- Plan "dampak" memakai pembeli (`subscriptions.userId`) untuk langganan berbayar dan pemilik Data Usaha (penerima tagihan) untuk perpanjangan terjadwal.

## Di luar scope
Laporan/endpoint Insight (189C–E); hapus & anonimisasi akun, peran admin dua arah (189H); hibah akses tanpa tanggal akhir (Fase 191); membatalkan otomatis invoice yang tertinggal.

## Referensi
- ADR: `docs/decisions/adr-0044-data-kontak-akun-dan-penanda-internal.md` (butir 3, 4, 5)
- Rancangan: `docs/architecture/architecture-admin-insight.md` § 2, 4.4, 5.4, 9 (D9, D16)
- Pembuatan invoice: `apps/api/src/lib/invoice-order.ts`; tagihan terjadwal: `apps/api/src/lib/renewal-billing.ts` (ADR-0042)

## Keputusan Kecil Selama Eksekusi
- Guard terpusat di `createInvoiceAndOrder` (6 pemanggil) bukan per route; error kustom ber-`status`/`toResponse()`; cabang eksplisit di `app.ts` `.onError` supaya bukan 500 + Sentry.
- Tagihan terjadwal: kandidat job mengecualikan pemilik internal; balapan ditandai-internal antara pencarian dan penerbitan dilewati (warn), bukan dihitung gagal.
- Daftar admin tanpa perubahan `DataTable`: kolom pilihan dibuat di halaman (state halaman), pilihan dibersihkan saat pindah halaman/cari/ganti filter (maks 20 = ukuran halaman, jauh di bawah batas 100 server).
- Tes halaman memakai `usePermissions` (ekspor yang sama dengan `<Can>`) karena `mock.module` bocor lintas file: tes lain hanya menyediakan `usePermissions`; memakai `usePermission` membuat impor halaman gagal saat suite penuh.
- Dari audit: aksi massal dimuat+diubah+diaudit dalam SATU transaksi dengan `FOR UPDATE` (urut id), guard memakai `FOR SHARE` pada baris user → penandaan dan pembuatan invoice saling menunggu; menandai (true) TIDAK menulis flag pada akun ber-role admin/staf (status sudah internal karena role; flag di sana tidak bermakna), mencabut (false) tetap membersihkan flag lama.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Lint bersih
- [x] Tes API + web hijau; data test dibersihkan (`db:cleanup-test-data`)
- [x] Security review (subagent `security-auditor`: jalur uang + aksi massal Super Admin)
- [x] Temuan Critical/High diperbaiki; Medium/Low dicatat di `docs/lessons-learned.md`
- [x] Dokumen D1–D2 selesai; `docs/PROGRESS.md`/phase 189 diupdate
- [x] Catat: UI belum dilihat di browser — verifikasi visual oleh user belum dilakukan

## Known Limitations
- **Invoice/order yang SUDAH terbit** untuk akun yang kemudian ditandai internal tetap bisa dibayar dan dikonfirmasi admin (guard hanya pada PEMBUATAN). Uang nyata dari akun itu tidak muncul di laporan komersil. Dialog menampilkan jumlahnya (`unpaidInvoices`); penanganan menunggu keputusan user (D21, lihat `architecture-admin-insight.md` § 9). Laporan 189C–E harus punya baris "kas dari akun internal" agar rekonsiliasi kas tetap cocok bila opsi (c) dipilih.
- Transfer kepemilikan Data Usaha dari/ke akun internal mengubah penerima tagihan terjadwal (guard memakai pemilik saat penerbitan); belum ada peringatan di dialog transfer.
- Subquery `NOT IN (internal)` (OR + IN join role) cukup pada skala sekarang; bila tabel `user` besar, pertimbangkan `NOT EXISTS` dan index `user.is_internal`/`user_roles.user_id`.
- Tidak ada rate limit khusus `/admin/users/internal*` (dilindungi `users.manage`).
- UI belum dilihat di browser; tampilan bilah aksi, tab filter, dan lebar kolom dengan kolom pilihan perlu dicek user.

## Ringkasan Hasil
Akun kini dibedakan **komersil vs internal** (flag `is_internal` ATAU role admin/staf, D16) lewat satu helper `lib/internal-accounts.ts`. Kontrol keuangan Lapis 1: guard terpusat di `createInvoiceAndOrder` sehingga akun internal tidak bisa punya invoice/order baru dari jalur mana pun (403 `INTERNAL_ACCOUNT_NO_BILLING`); tagihan perpanjangan terjadwal melewati pemilik internal; akses internal hanya lewat mode admin "Gratis" (UI mengunci). Super Admin dapat menandai/mencabut tanda internal 1–100 akun di `/admin/users` dengan pratinjau dampak (uang yang keluar dari laporan, langganan, perpanjangan terjadwal), kotak persetujuan, dan audit log per akun; daftar punya lencana dan filter tipe. Migrasi aditif `0049_user_is_internal`.

**Verifikasi:** typecheck API+web bersih; lint web bersih; tes API 2.190 lulus; tes web 466 lulus (+ helper, guard, job, daftar/aksi massal, route checkout & admin, lencana, dialog dampak, halaman Pengguna). Data uji dibersihkan.
**Security review** (subagent `security-auditor`): 0 Critical, 0 High; 2 Medium (invoice yang sudah terbit tetap bisa dibayar → **keputusan D21 terbuka, didokumentasikan**; TOCTOU penandaan vs invoice → **diperbaiki** dengan kunci baris + transaksi tunggal); 4 Low (audit "from" basi → diperbaiki; flag pada akun admin/staf → diperbaiki; pilihan >100 → tidak berlaku, dibatasi ukuran halaman; fallback UI basi → backend tetap menolak, pesan ramah ada); 4 Info (dicatat).
**Commit:** `4b1671e` (API), `1ed1256` (web), lalu perbaikan audit + dokumen.
