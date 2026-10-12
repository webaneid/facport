# Architecture — Akun Internal vs Komersil & Kontrol Keuangan

> Fase 189G, ADR-0044 (Accepted). Sumber kebenaran: siapa dihitung "internal" vs "komersil", bagaimana invoice akun internal dicegah, dan bagaimana laporan
> uang WAJIB mengecualikan mereka. Latar kebutuhan client: `architecture-admin-insight.md` § 3 butir 1.

## Definisi (baku, jangan ditafsir ulang di laporan)
- **Internal** = `user.is_internal = true` (ditandai Super Admin: trainer, karyawan, mitra) **ATAU** memegang role `admin`/`staff` (D16, otomatis, tanpa flag).
- **Komersil** = akun role `customer` yang bukan internal. Ditentukan oleh **status AKUN**, bukan trial atau langganan (pengguna trial tetap komersil).
- Alasan (`InternalReason`): `"role"` mengalahkan `"flag"`; `null` = komersil. Mencabut flag dari akun ber-role admin/staf TIDAK mengubah statusnya (tetap internal karena role).

## Satu sumber kebenaran: `apps/api/src/lib/internal-accounts.ts`
| Fungsi | Dipakai untuk |
|---|---|
| `deriveInternalReason(flag, roleNames)` | murni; daftar admin yang sudah punya nama role tiap akun |
| `getInternalReason(userId, executor?)` | satu akun (guard, detail user) |
| `internalUserIdsSubquery()` | subquery id internal efektif (flag ATAU role admin/staf) |
| `commercialCustomerIdsSubquery()` | subquery id KOMERSIL (role customer & bukan internal) — **dasar semua hitungan/laporan uang pengguna komersil (189C–E)** |
| `assertBillable(executor, userId)` / `InternalAccountBillingError` | guard keuangan |
**Aturan:** laporan/hitungan baru TIDAK BOLEH membaca `user.is_internal` langsung atau menebak role sendiri — pakai subquery di atas.

## Kontrol keuangan Lapis 1
1. **Guard terpusat** — `assertBillable(tx, userId)` di AWAL `createInvoiceAndOrder` (`lib/invoice-order.ts`), sebelum nomor invoice diambil. Semua pembuatan invoice/order melewati fungsi ini (checkout pelanggan, kursi/tim, tagihan perpanjangan terjadwal, `createPaidInvoiceAndOrder`, 3 jalur admin; diverifikasi: tidak ada `insert(invoices|orders|invoiceItems)` lain). Akun internal → `InternalAccountBillingError` → **403 `INTERNAL_ACCOUNT_NO_BILLING`**.
   - Error berproperti `status`/`toResponse()` sehingga Elysia memetakannya ke 403 JSON sendiri walau aplikasi tes tanpa `.onError`; `app.ts` `.onError` punya cabang eksplisit (tanpa itu jatuh ke 500 + Sentry).
   - Pemeriksaan memakai **penerima tagihan** (`userId` yang ditagih): pembeli untuk checkout, target untuk admin, **pemilik Data Usaha** untuk perpanjangan terjadwal (ADR-0042).
2. **Tagihan perpanjangan terjadwal** — `findDueRenewalCandidates` mengecualikan pemilik internal (job harian tidak membuat invoice); penerbitan manual admin ditolak guard; balapan (ditandai internal di antara pencarian dan penerbitan) dilewati, bukan dihitung gagal.
3. **Akses internal hanya lewat mode admin "Gratis"** (tanpa invoice). UI dialog Kelola Langganan mengunci pilihan ke "Gratis" untuk akun internal. Hibah tanpa tanggal akhir = Fase 191 (selesai).
4. **Tidak mengubah gerbang akses** (`subscription-gate.ts`) maupun `/admin/stats` lama.

## Aksi massal (Super Admin = `users.manage`)
- `GET /admin/users?type=all|commercial|internal` — menambah `isInternal`, `internalFlag`, `internalReason` per baris.
- `POST /admin/users/internal/preview` `{userIds[1..100], isInternal}` — TIDAK mengubah apa pun. Mengembalikan kategori (`becomeInternal`/`becomeCommercial`, `alreadyInState`, `internalByRole`, `notFound`) dan `impact` untuk akun yang STATUS EFEKTIFnya berubah: `paidInvoiceCount`+`paidTotal` (uang yang keluar dari/masuk ke laporan), `activePaidSubscriptions`, `scheduledRenewals`, `unpaidInvoices` (tertinggal, tidak dibatalkan otomatis).
- `POST /admin/users/internal` — menerapkan dalam satu transaksi; `audit_logs` per akun yang berubah (`entityType:"user"`, `changes:{isInternal:{from,to}, bulk}`); idempoten.
- UI: kolom kotak centang di `/admin/users` (state di halaman, `DataTable` tidak diubah), lencana, tab filter, bilah aksi, dialog dampak dengan kotak persetujuan wajib bila ada uang lunas / perpanjangan terjadwal terdampak. Detail user: lencana + tombol 1 akun.
- **Reversibel & tidak menghapus data**: invoice lama tetap ada; hanya masuk/keluar hitungan laporan.

## Cara memakai di laporan baru (189C–E)
```ts
// pelanggan komersil saja
db.select(...).from(invoices).where(and(eq(invoices.status, "paid"), inArray(invoices.userId, commercialCustomerIdsSubquery())))
```
Untuk "uang terbayar": hanya akun komersil; pisahkan *Terbayar terverifikasi* vs *Dilunasi admin* (D11). Akun yang berubah status mengubah laporan retroaktif — itu perilaku yang disengaja dan diperingatkan di dialog dampak.

## Keterbatasan yang diketahui
- **Invoice/order yang SUDAH terbit** untuk akun yang kemudian ditandai internal tidak dibatalkan otomatis (dilaporkan sebagai `unpaidInvoices`) dan TETAP bisa dibayar + dikonfirmasi admin (guard hanya pada pembuatan). Uang nyata dari akun itu tidak masuk laporan komersil. **Keputusan D21 terbuka** (`architecture-admin-insight.md` § 9): (a) batalkan otomatis saat ditandai (dengan persetujuan di dialog), (b) tolak konfirmasi pembayaran akun internal, atau (c) biarkan dan sediakan baris "Kas dari akun internal" di laporan uang agar rekonsiliasi kas utuh (saran). Sampai diputuskan, setiap laporan uang HARUS tetap bisa dirinci per tipe akun, bukan menghilangkan uang internal.
- Penandaan vs pembuatan invoice saling menunggu lewat kunci baris (`FOR UPDATE` di aksi massal, `FOR SHARE` di guard); satu invoice yang commit lebih dulu dari penandaan tetap sah dan masuk `unpaidInvoices`.
- Transfer kepemilikan Data Usaha dari/ke akun internal mengubah penagihan terjadwal (komersil→internal: berhenti diam-diam; internal→komersil: mulai terbit); belum ada peringatan di dialog transfer.
- Subquery `NOT IN (internal)` memakai OR + IN join role: cukup pada skala sekarang; bila tabel `user` besar pertimbangkan `NOT EXISTS` dan index `user.is_internal` / `user_roles.user_id`.
- Mengangkat customer berbayar menjadi admin (189H) otomatis menjadikannya internal → riwayat uangnya keluar dari laporan; peringatan di dialog 189H.
- Perubahan kepemilikan Data Usaha (transfer) memindahkan penerima tagihan perpanjangan; guard memakai pemilik SAAT penerbitan.

## Referensi
- ADR: `docs/decisions/adr-0044-data-kontak-akun-dan-penanda-internal.md`; rancangan induk `architecture-admin-insight.md` § 4.4, 5.4, 9
- Phase doc: `docs/phases/phase-189g-akun-internal-kontrol-keuangan.md`
- Pembuatan invoice: `apps/api/src/lib/invoice-order.ts`; perpanjangan terjadwal: `apps/api/src/lib/renewal-billing.ts` (ADR-0042)

## Hibah akses internal (Fase 191, D9 Lapis 2)
- Langganan modul dengan `end_at = NULL` + `subscriptions.internal_grant = true`, tanpa order/invoice; dibuat lewat `POST /admin/users/:id/internal-grant` (`subscriptions.manage`), pratinjau di `/internal-grant/preview`, dicabut lewat `/internal-grant/revoke` — `lib/internal-grants.ts`, panel "Akses Internal" di detail user.
- `end_at NULL` dianggap tanpa batas oleh gerbang akses dan diabaikan job kedaluwarsa/pengingat/tagihan perpanjangan — tidak ada notifikasi kedaluwarsa.
- Aturan: hanya akun internal efektif yang menerima (409 `NOT_INTERNAL`); Data Usaha harus milik akun; tidak boleh ke diri sendiri; hibah dicabut otomatis saat akun kembali komersil (aksi massal internal, aksi peran), saat Data Usaha berpindah ke pemilik komersil (transfer admin & self-service), dan saat anonimisasi. Pencabutan menurut PEMILIK Data Usaha saat ini. Gerbang akses menolak hibah bila pemilik Data Usaha saat ini bukan internal (pertahanan berlapis). Laporan Insight tidak menghitung hibah (`COUNTED_SUBSCRIPTION`).
