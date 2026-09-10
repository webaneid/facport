# Fase 93 — Fix Bug: Bukti Transfer Tidak Bisa Dibuka (Presigned URL Salah Host)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
User laporan: *"cek invoice dan approving alur pembayaran... terutama
bukti transfer.. tempat saya gk bisa dibuka bukti transfernya.."* —
audit arsitektur + kode alur invoice/approval pembayaran Facport
(billing internal, BUKAN modul import Accurate), fokus ke bug bukti
transfer yang tidak bisa dibuka.

## Root Cause (Ditemukan via Audit)
`GET /admin/orders/:id/proof-url` (`apps/api/src/routes/admin/orders.route.ts`)
generate presigned URL pakai `minioClient` — client ini dikonfigurasi
dari `MINIO_ENDPOINT` yang di **production/staging** adalah nama
service Docker internal (`minio`), CUMA bisa di-resolve dari container
lain di jaringan Docker yang sama. Browser admin (di komputer/HP
mereka) TIDAK PERNAH bisa resolve host itu — presigned URL yang
dihasilkan SELALU gagal dibuka, PERSIS keluhan user.

**Kenapa tidak ketahuan sebelumnya**:
1. `.env` dev lokal (`MINIO_PUBLIC_URL=http://localhost:9000`) SAMA
   PERSIS dengan `MINIO_ENDPOINT` (`localhost`) — bug ini TIDAK PERNAH
   muncul saat development, cuma di environment yang punya reverse
   proxy terpisah (production/staging, § `docs/deployment-new-domain-onboarding.md`).
2. `apps/api/src/routes/admin/orders.route.test.ts` TIDAK PUNYA test
   untuk endpoint `/proof-url` SAMA SEKALI sebelum fase ini (gap
   pre-existing) — dan bahkan kalau ADA test, unit/integration test di
   proses yang sama tidak akan menangkap "apakah host ini bisa
   di-resolve BROWSER SUNGGUHAN" (itu soal environment/network, bukan
   soal logic kode).

## Fix
Client MinIO TERPISAH khusus untuk presigned URL, `minioPublicClient`
(`apps/api/src/lib/minio.ts`), dikonfigurasi dari `MINIO_PUBLIC_URL`
(host publik lewat reverse proxy — SUDAH ada & dipakai bucket
`facport-public`, § ADR-0017, cuma belum pernah dipakai untuk
presigned URL bucket privat).

**Kenapa ini aman** (bukan sekadar tebakan): `presignedGetObject`/
`presignedPutObject` pada SDK MinIO TIDAK PERNAH benar-benar melakukan
koneksi jaringan ke endpoint yang dikonfigurasi saat generate URL —
signature-nya (AWS SigV4) dihitung SECARA LOKAL, murni fungsi dari
access key + secret key + path objek + waktu expiry. Jadi aman
mengonfigurasi client dengan host PUBLIK untuk keperluan signing,
walau server API ini sendiri tidak pernah benar-benar terhubung balik
ke host itu. Nginx reverse proxy (`media.<domain>` → MinIO internal,
`proxy_set_header Host $host` — pola sama subdomain lain) meneruskan
Host header asli, jadi signature yang dihitung "seolah-olah" request
akan datang ke `media.<domain>` tetap valid saat request itu benar-benar
tiba di MinIO (SigV4 tidak menyertakan skema HTTP/HTTPS dalam
komponen yang ditandatangani, jadi SSL termination di nginx tidak
masalah).

## Scope
- [x] Audit arsitektur + kode alur invoice/approval pembayaran
      (`architecture-payment.md`, `orders.route.ts`, `admin/orders.route.ts`,
      `public/orders.route.ts`, halaman admin/customer terkait)
- [x] Root cause presigned URL host internal ditemukan & dikonfirmasi
- [x] Fix: `minioPublicClient` baru + `parseMinioPublicEndpoint` (fungsi
      murni, testable)
- [x] Ganti pemakaian di `admin/orders.route.ts` `/proof-url`
- [x] Test baru: parsing (4 test) + endpoint `/proof-url` (3 test,
      sebelumnya NOL test)
- [x] Update `architecture-payment.md` § "Bucket Bukti Pembayaran"
      (koreksi contoh kode basi) + `architecture-storage.md` (prinsip
      umum, cegah bug serupa di masa depan)

## Temuan Lain (Tidak Ada Bug Tambahan)
Audit menyeluruh terhadap alur invoice/approval (row-locking saat
confirm, idempotency, QRIS EMV, penomoran invoice, link bayar publik)
TIDAK menemukan gap/bug lain — konsisten dengan `architecture-payment.md`.
Cuma 1 usage `presignedGetObject`/`presignedPutObject` di SELURUH
codebase (dicek via grep) — jadi bug ini TERISOLASI, tidak ada tempat
lain yang perlu diperbaiki dengan pola sama.

**Gap non-bug dicatat** (di luar scope fase ini, tidak dikerjakan):
customer TIDAK BISA melihat kembali bukti transfer yang sudah mereka
upload sendiri (cuma admin yang punya endpoint ini) — bukan bug (customer
sudah tahu apa yang mereka upload), tapi bisa jadi permintaan fitur
kalau diminta nanti.

## File yang Diubah
- `apps/api/src/lib/minio.ts` — `parseMinioPublicEndpoint` (fungsi
  murni baru) + `minioPublicClient` (client baru khusus presigned URL).
- `apps/api/src/lib/minio.test.ts` (BARU) — 4 test parsing.
- `apps/api/src/routes/admin/orders.route.ts` — `/proof-url` pakai
  `minioPublicClient`, bukan `minioClient`.
- `apps/api/src/routes/admin/orders.route.test.ts` — 3 test baru untuk
  `/proof-url` (sebelumnya nol test).
- `docs/architecture/architecture-payment.md`,
  `architecture-storage.md` — koreksi + prinsip umum.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru (7 test — 4 parsing + 3 endpoint).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — kredensial sama (access/secret key),
      tidak ada secret baru terekspos, signature tetap dihitung server-side.
      Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- Fix ini TIDAK BISA diverifikasi end-to-end di dev lokal (MINIO_PUBLIC_URL
  dan MINIO_ENDPOINT sama persis di dev) — cuma bisa dikonfirmasi
  benar-benar berfungsi setelah deploy ke production/staging dan admin
  benar-benar coba buka bukti transfer sungguhan. WAJIB diverifikasi
  manual setelah deploy, jangan anggap selesai cuma dari test lolos.
- Asumsi teknis (SigV4 tidak menandatangani skema HTTP/HTTPS, nginx
  reverse-proxy meneruskan Host header apa adanya) didasarkan pada
  pemahaman standar SigV4 + konfigurasi nginx yang didokumentasikan
  (`docs/deployment-new-domain-onboarding.md`) — BUKAN hasil test
  langsung ke MinIO server sungguhan di belakang reverse proxy asli.

## Ringkasan Hasil
Root cause bug "bukti transfer tidak bisa dibuka" ditemukan dan
diperbaiki: presigned URL sebelumnya dibuat dengan host INTERNAL Docker
yang tidak bisa diakses browser sama sekali — sekarang pakai host
PUBLIK (`MINIO_PUBLIC_URL`) via client terpisah, aman karena signing
presigned URL adalah komputasi lokal, bukan koneksi jaringan sungguhan.
Bug ini murni environment-specific (production/staging saja) sehingga
tidak pernah ketahuan dari development lokal maupun test — 7 test baru
ditambahkan (termasuk untuk endpoint yang sebelumnya nol test sama
sekali). `bun run typecheck` 0 error, `apps/api` 591 pass/0 fail (7
baru), `apps/web` 50 pass/0 fail. **WAJIB diverifikasi manual di
production/staging setelah deploy** — tidak bisa dipastikan 100% dari
dev lokal saja.
