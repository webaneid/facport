# Fase 91 — Tombol "Hubungkan Ulang" & Fix Status Koneksi Accurate

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Saat memakai halaman `/app/accurate` untuk testing sesi ini (Fase
86/90), koneksi Sales Receipt/Purchase Invoice yang tadinya
"✓ Terhubung" ternyata TOKEN-nya sudah mati (revoked Accurate,
`invalid_grant`) — TAPI tidak ada cara memperbaikinya dari UI sama
sekali, harus di-edit manual lewat database. User minta dicek & (kalau
lebih baik diperbaiki daripada dihapus) diperbaiki fitur "Pakai Koneksi
yang Sudah Ada" di halaman ini.

## Root Cause Analysis (Sebelum Eksekusi)
Ditemukan: masalahnya BUKAN spesifik di fitur "reuse" (ADR-0020) —
masalahnya lebih dasar: `GET /accurate/subscriptions` field `connected`
cuma cek "ada baris koneksi tersimpan" (`!!connection`), BUKAN cek
statusnya. Koneksi bisa `status: "expired"` di DB tapi tetap dilaporkan
`connected: true`. Ini terjadi baik pada koneksi hasil OAuth BARU
maupun hasil "reuse" — BUKAN masalah spesifik reuse.

Ditemukan juga: gap ini SUDAH DICATAT sejak Fase 01/04
("tombol 'Hubungkan Ulang' terpisah dari tombol utama BELUM dibangun")
tapi tidak pernah ditindaklanjuti setelah ADR-0020 (Fase 14) menambah
guard 409 `ALREADY_CONNECTED` yang justru MEMBLOKIR cara lama
("panggil connect lagi") untuk reconnect.

Diberikan pilihan ke user: hapus fitur reuse (usulan awal) vs perbaiki
akar masalah (tambah tombol Hubungkan Ulang + fix status). User pilih
**perbaiki akar masalah** — fitur reuse TETAP ADA (manfaat ADR-0020
menghindari Accurate charge "aplikasi terpisah" tetap terjaga).

## Scope
- [x] `GET /accurate/subscriptions` — `connected` sekarang cek
      `status === "active"`, field baru `connectionStatus` ditambah
- [x] `POST /accurate/connect` — terima `reconnect: true` opsional,
      melewati guard 409 SECARA EKSPLISIT (ownership check TETAP utuh)
- [x] `markConnectionExpired()` — helper baru (diekstrak dari job
      `REFRESH_ACCURATE_TOKEN`), DIPANGGIL JUGA saat `openAccurateSession()`
      gagal SAAT IMPORT (2 lokasi: proses import & cancel import) —
      sebelumnya cuma job refresh terjadwal yang menandai `expired`
- [x] Halaman `/app/accurate` — tombol "Hubungkan Ulang" di 2 tempat:
      kartu sehat (kecil, jaga-jaga) & kartu bermasalah (besar + badge
      peringatan, kondisi BARU yang sebelumnya tidak ada UI-nya sama
      sekali)
- [x] Test baru: `accurate.route.test.ts` (reconnect bypass 409,
      connected/connectionStatus akurat)

## Keputusan Kecil Selama Eksekusi
- **Fitur reuse TIDAK dihapus** — akar masalah (deteksi status +
  reconnect) diperbaiki, bukan simtomnya.
- **`reconnect` sebagai flag eksplisit** (bukan menghapus guard 409
  begitu saja) — supaya niat "reconnect sengaja" berbeda dari
  "connect ganda tidak sengaja" tetap jelas di level API/log.
- **Koneksi LAMA tidak dihapus/dibersihkan otomatis saat reconnect** —
  konsisten pola existing ("Ganti Data Usaha WAJIB lewat koneksi baru,
  bukan endpoint select"), subscription lain yang share koneksi lama
  (ADR-0020) TIDAK ikut ke-migrasi otomatis, tetap perlu reconnect
  sendiri-sendiri kalau perlu.
- **Test pre-existing yang gagal** (`503 ACCURATE_NOT_CONFIGURED kalau
  ACCURATE_CLIENT_ID kosong`) — DIKONFIRMASI gagal juga di `develop`
  HEAD SEBELUM perubahan Fase 91 (dicek via `git stash`), murni karena
  `.env` lokal sekarang punya kredensial Accurate ASLI (dipakai test
  call nyata Fase 90) — BUKAN regresi dari fase ini. Tetap lolos normal
  di CI (tidak ada kredensial asli). Test baru Fase 91 SENGAJA tidak
  fiks ke 1 status code, assert "bukan 409" ditambah pengecekan
  kondisional 200/503 supaya robust terhadap env yang beda.

## File yang Diubah
- `apps/api/src/routes/accurate.route.ts` — `connected`/`connectionStatus`
  di `/accurate/subscriptions`, `reconnect` di `/accurate/connect`.
- `apps/api/src/routes/accurate.route.test.ts` — 2 test baru.
- `apps/api/src/workers/index.ts` — `markConnectionExpired()` helper
  baru, dipanggil di job refresh (refactor) + 2 lokasi baru (import gagal
  buka sesi, cancel import gagal buka sesi).
- `apps/web/app/app/(protected)/accurate/page.tsx` — tombol "Hubungkan
  Ulang" (2 tempat), branch render baru untuk koneksi bermasalah.
- `docs/architecture/architecture-accurate-integration.md` — section
  baru "Deteksi Token Mati Lebih Dini + Hubungkan Ulang", koreksi
  "notifikasi email" → in-app.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru (2 test — reconnect bypass 409, connected/connectionStatus
      akurat).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — ownership check TETAP utuh (flag
      `reconnect` cuma lewati business-rule 409, bukan auth/ownership),
      tidak ada endpoint baru. Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- Belum ada verifikasi visual di browser (klik tombol "Hubungkan Ulang"
  sungguhan) — logic backend sudah dites (unit test), tapi alur UI
  end-to-end (klik → redirect OAuth → callback → badge berubah) belum
  dicoba langsung di browser sesi ini.
- Deteksi token mati masih REAKTIF (baru ketahuan saat DIPAKAI — job
  refresh terjadwal ATAU import gagal), BUKAN proaktif real-time —
  kalau token di-revoke dan subscription itu tidak pernah dipakai
  import sampai job refresh jalan, user baru tahu lewat notifikasi
  paling lambat keesokan harinya.

## Ringkasan Hasil
Gap yang dicatat sejak Fase 01/04 ("tombol Hubungkan Ulang belum
dibangun") akhirnya ditutup — user bisa self-service memperbaiki
koneksi Accurate yang mati langsung dari UI, tidak perlu lagi minta
developer edit database manual. Sekaligus diperbaiki bug terkait:
`connected` di API sebelumnya tidak cek status koneksi asli, sekarang
akurat. Deteksi kegagalan koneksi diperluas dari "cuma job refresh
terjadwal" ke "juga saat import gagal buka sesi" — notifikasi ke user
lebih cepat. `bun run typecheck` 0 error, 577 test apps/api (2 baru) +
50 test apps/web, semua pass.
