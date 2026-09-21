# ADR-0035: Konteks Data Usaha Aktif Dikirim ke Server (Gerbang Modul Tidak Boleh Menebak)

**Status:** Accepted
**Tanggal:** 2026-09-21

## Context
Customer nyata (Pak Untung, 2 Data Usaha: PT MAGINET INDONESIA dan
INTERTOUCH MALAYSIA, keduanya berlangganan Purchase Invoice) melaporkan
import gagal "open-db.do gagal: HTTP 401". Diagnosis production
(2026-09-21) menunjukkan gejala 401 hanya pemicu — akar masalahnya:

`subscriptionGatePlugin.moduleAccess` (`lib/subscription-gate.ts`)
memilih subscription lewat `activeSubs.find(s => s.plan.modules.includes(moduleKey))`
pada daftar SEMUA subscription aktif milik user (semua Data Usaha),
terurut `createdAt DESC`. "Data Usaha aktif" (cookie `active_data_usaha_id`,
Fase 109) HANYA ada di sisi web: cookie host-only di `app.*`, TIDAK
pernah terkirim ke `api.*`, dan API tidak pernah membacanya. Akibatnya
user dengan modul yang sama di >1 Data Usaha SELALU mendapat
subscription TERBARU, apa pun Data Usaha yang dia pilih di sidebar —
terbukti: subscription Malaysia (18 Sep) lebih baru dari Maginet
(17 Sep), semua 3 batch hari itu masuk Malaysia walau user baru saja
menghubungkan ulang koneksi Maginet 21 detik sebelumnya.

Dampak nyata: kalau koneksi Accurate subscription yang salah itu
sehat, data perusahaan A diposting DIAM-DIAM ke database Accurate
perusahaan B. Insiden sebelumnya (2026-09-17, semua upload Purchase
Invoice customer yang sama mendarat di "Database 2") sempat
disimpulkan "salah pilih Data Usaha oleh customer" — kemungkinan besar
itu bug yang sama.

## Decision
1. **Web mengirim Data Usaha aktif di setiap request API** lewat header
   `X-Data-Usaha-Id` (dibaca dari cookie `active_data_usaha_id`, hanya di
   browser). Satu titik: opsi `headers` pada `treaty()` di
   `apps/web/lib/api-client.ts`. Cookie TIDAK dipindah domain (tetap
   preferensi tampilan) — header eksplisit lebih jelas dan tidak
   membuka cookie baru lintas subdomain.
2. **`moduleAccess` menyaring subscription per Data Usaha**:
   - Header ada → WAJIB Data Usaha itu milik user ATAU user punya seat
     aktif di sana (validasi server-side, bukan percaya header); kalau
     tidak → `403 DATA_USAHA_FORBIDDEN`. Cari subscription modul HANYA di
     dalam Data Usaha itu; tidak ada → `403 MODULE_NOT_SUBSCRIBED`.
   - Header tidak ada → hanya lolos kalau modul tersebut ada di TEPAT
     SATU Data Usaha user (tidak ambigu; klien lama / user 1 Data Usaha
     tetap jalan). Kalau ada di >1 Data Usaha → **fail closed**:
     `409 DATA_USAHA_REQUIRED`. Prinsip: request gagal jelas lebih baik
     daripada memposting ke perusahaan yang salah.
3. Perubahan CUMA di gerbang (satu titik pemilihan subscription — dicek
   via grep, tidak ada `modules.includes` lain di `apps/api/src`), jadi
   SEMUA endpoint import ikut terlindungi tanpa edit per-modul.

4. **Pengecualian unduh template**: `GET .../import/template` (link
   `<a href>` biasa, tidak bisa membawa header; isi statis per modul, tidak
   menyentuh data tenant) TIDAK ditolak 409 walau user multi-Data-Usaha.
   Tetap wajib berlangganan modulnya. Hanya GET dengan path berakhiran
   `/import/template`; POST upload dll tetap fail-closed.
5. **Multi-tab**: cookie dipakai bersama semua tab. Saat tab kembali aktif
   (`focus`/`visibilitychange`) dan cookie berubah dari yang terakhir
   terlihat, halaman dimuat ulang supaya tampilan dan request sinkron.
   Ganti Data Usaha di tab yang sama memanggil `markActiveDataUsahaSeen()`.

## Consequences
- Route yang membandingkan `batch.subscriptionId !== subscription.id`
  akan 404 kalau batch milik Data Usaha lain dari yang aktif — konsisten
  dengan arsip yang sudah di-scope per Data Usaha (Fase 113).
- Batch lama yang sudah salah-Data-Usaha TIDAK dimigrasi otomatis;
  perlu audit read-only (user-run) untuk customer lain yang punya modul
  sama di >1 Data Usaha (lihat phase doc Fase 140).
- Header ini bukan otorisasi: klaim user selalu divalidasi terhadap
  kepemilikan/seat di DB.
