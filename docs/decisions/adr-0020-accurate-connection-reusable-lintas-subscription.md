# ADR-0020: Koneksi Accurate Lepas dari 1:1-ke-Subscription, Jadi Reusable per User

**Status:** Accepted
**Tanggal:** 2026-09-04
**Supersedes:** Poin 3 ADR-0009 ("1 subscription = 1 akun Accurate,
`accurate_connections` unique ke `subscriptions.id`")

## Context
ADR-0009 (Fase 01) menetapkan `accurate_connections.subscriptionId`
**unique** — 1 subscription cuma boleh terhubung 1 akun/Data Usaha
Accurate, dan sebaliknya. Waktu itu asumsinya: 1 subscription = seluruh
akun customer (1 plan bundel berisi banyak modul).

Sejak ADR-0019, 1 subscription = 1 SUB-MODUL. Customer yang beli 2+
sub-modul (mis. Sales Invoice + Purchase Invoice) sekarang punya 2+
subscription row TERPISAH. Kalau aturan lama tetap dipakai apa adanya,
customer itu WAJIB OAuth-connect Accurate 2x terpisah — walaupun kedua
modul itu dipakai untuk **Data Usaha/company Accurate yang SAMA PERSIS**.

User menjelaskan konsekuensi bisnisnya (2026-09-04): **Accurate men-charge
customer per "aplikasi terkoneksi"** ke akun mereka. Kalau Facport
memaksa bikin 2 `accurate_connections` terpisah untuk company yang sama
cuma karena dibeli lewat 2 subscription berbeda, Accurate akan
menganggapnya 2 aplikasi berbeda yang connect — customer di-charge dua
kali untuk sesuatu yang secara nyata cuma 1 koneksi ke 1 company.

## Decision
1. **`accurate_connections` pindah kepemilikan dari `subscriptions` ke
   `user`** — kolom `subscriptionId` (unique FK) diganti `userId` (FK ke
   `user.id`, **TIDAK unique** — 1 user boleh punya banyak baris, 1 per
   Data Usaha berbeda yang pernah dia hubungkan).
2. **`subscriptions` dapat kolom baru `accurateConnectionId`** (nullable,
   FK ke `accurate_connections.id`) — pointer "subscription/modul ini
   pakai koneksi yang mana". Nullable karena diisi BELAKANGAN (customer
   pilih/hubungkan Data Usaha setelah subscription aktif), bukan saat
   checkout/pembayaran.
3. **Saat customer setup 1 subscription/modul yang belum ada koneksinya**,
   UI kasih 2 pilihan (`app/app/(protected)/accurate/page.tsx`):
   - **"Pakai koneksi yang sudah ada"** — dropdown Data Usaha dari
     `accurate_connections` milik user (WHERE `userId` = dia,
     `status:"active"`) yang sudah pernah dihubungkan modul LAIN. Pilih
     ini → `subscriptions.accurateConnectionId` di-set ke connection
     yang dipilih, TIDAK ada OAuth baru, TIDAK ada koneksi baru dibuat.
   - **"Hubungkan Data Usaha Baru"** — OAuth flow penuh seperti biasa
     (Fase 01, alurnya TIDAK berubah), hasil akhirnya bikin
     `accurate_connections` row baru (`userId` = dia) DAN langsung
     assign `subscriptions.accurateConnectionId` ke row baru itu.
4. **Scope OAuth yang di-request saat "Hubungkan Data Usaha Baru"** tetap
   mengikuti modul plan (§ ADR-0009 poin 4, TIDAK berubah) — TAPI karena
   sekarang OAuth dilakukan per Data Usaha (bisa dipicu dari subscription
   modul mana pun yang pertama kali connect ke company itu), scope yang
   diminta sebaiknya union dari SEMUA modul yang subscription-nya nanti
   bakal pakai connection ini — di luar cakupan detail ADR ini, diserahkan
   ke implementasi Fase 14 (opsi paling aman: minta ulang re-authorize
   kalau modul baru butuh scope yang belum diminta, pola yang SUDAH ada
   & terbukti jalan di Fase 04/05 — bukan hal baru).

## Alternatif yang Dipertimbangkan
- **Tetap 1:1 subscription↔connection, customer re-OAuth tiap beli modul
  baru** — ditolak eksplisit oleh user: kalau Data Usaha sama, ini bikin
  Accurate menghitungnya sebagai 2 aplikasi terkoneksi, customer
  di-charge lebih dari seharusnya untuk sesuatu yang secara nyata cuma 1
  koneksi.
- **`accurate_connections` many-to-many ke `subscriptions` lewat join
  table** — dipertimbangkan (lebih "murni" relasional), tapi ditolak
  untuk fase ini: kompleksitas query tambahan (JOIN 3 tabel di semua
  tempat yang sebelumnya cukup 1 FK langsung) tidak sepadan manfaatnya
  dibanding FK sederhana `subscriptions.accurateConnectionId` — 1
  subscription tetap logically "pakai 1 connection pada satu waktu",
  many-to-many cuma diperlukan kalau nanti ada kasus "1 subscription
  butuh lebih dari 1 Data Usaha sekaligus" yang TIDAK ada dalam
  requirement sekarang.

## Konsekuensi
- Semua kode yang query `accurate_connections` by `subscriptionId`
  (representative: `apps/api/src/workers/index.ts` job
  `IMPORT_TO_ACCURATE`/`CANCEL_IMPORT`, `apps/api/src/routes/accurate.route.ts`)
  WAJIB diubah: ambil `subscriptions.accurateConnectionId` dulu, baru
  query `accurate_connections` by `id` — BUKAN lagi query langsung by
  `subscriptionId` (kolom itu hilang dari tabel).
- Halaman "Koneksi Accurate" customer berubah TOTAL dari "1 status
  tunggal" jadi "daftar per subscription/modul yang dimiliki", masing-masing
  baris independen statusnya.
- Kalau customer HAPUS/expire 1 subscription yang connection-nya dipakai
  BERSAMA subscription lain (shared), `accurate_connections` row itu
  TIDAK ikut terhapus (masih dipakai subscription lain) — cukup
  `subscriptions.accurateConnectionId` subscription yang expired itu
  yang jadi tidak relevan lagi (subscription-nya sendiri sudah
  `status:"expired"`, gating sudah otomatis menolak lewat status itu,
  tidak perlu logic tambahan untuk "lepas ikatan" connection).
- Import job (`workers/index.ts`) yang butuh sesi Data Usaha (`openAccurateSession`)
  tetap bekerja identik setelah lookup connection-nya diubah — perilaku
  proses import per-baris/grup TIDAK berubah sama sekali, cuma sumber
  connection record-nya yang beda jalur query.

## Referensi
- Detail eksekusi → `docs/phases/phase-14-fondasi-langganan.md`
- Alur OAuth dasar (tidak berubah) → ADR-0009,
  `docs/architecture/architecture-accurate-integration.md` § 1
- Granularitas sub-modul yang memicu perubahan ini → ADR-0019
