# Fase 192 — Perbaikan Koneksi Accurate Pasca Insiden 2026-10-13

**Status:** Done
**Mulai:** 2026-10-13
**Selesai:** 2026-10-13

## Tujuan
Insiden produksi (klien PT Buana Indah + akun uji tim FAC, 2026-10-13) menyingkap tiga celah: (1) galat "hak Administrator" dari Accurate tampil sebagai pesan generik; (2) pesan "sudah terhubung ke akun Facport lain" tidak memberi jalan keluar dan penolakannya tak berjejak; (3) penukaran kode OAuth yang berujung ditolak diam-diam mematikan token pemilik yang sah. Keputusan: ADR-0047.

## Mode kerja
Menyentuh jalur token (sensitif) di API + web + docs → eksekusi langsung bertahap + TDD; security review oleh subagent `security-auditor` di akhir. Tidak ada migrasi DB. Tidak dirilis sampai user memerintahkan.

## Scope
**API**
- [x] A1 `parseAdminRequired(err)` di `lib/accurate.ts` (deteksi galat + ekstraksi `installUrl` tervalidasi host `account.accurate.id`) + tes murni.
- [x] A2 `POST /accurate/databases/select`: `422 ACCURATE_ADMIN_REQUIRED {installUrl}`, log peringatan tanpa pesan Accurate + tes.
- [x] A3 Callback OAuth: pada `accurate_account_in_use`, pulihkan token baris pemilik (hanya `active`/`expired`, kunci `accurate_user_id`), catat `connect_rejected` + log `conflictingConnectionId` + tes (termasuk `revoked` tidak dihidupkan; pemanggil tidak mendapat penunjuk).
- [x] A4 Aksi `connect_rejected` di `DATA_USAHA_EVENT`; tidak masuk laporan Insight.
**Web**
- [x] W1 `accurate-gate-copy`: pesan "sudah dipakai" baru; `accurate-gate-provider`: tangani `ACCURATE_ADMIN_REQUIRED` (penjelasan + tombol tautan, host divalidasi ulang) + tes.
- [x] W2 `data-usaha-history.ts`: kalimat untuk `connect_rejected` + tes.
**Dokumen**
- [x] D1 `architecture-accurate-integration.md` / `architecture-accurate-connect-gate.md` (alur penolakan & galat Administrator), lessons-learned, PROGRESS.

## Di luar scope
Mengubah aturan 1 akun Accurate ↔ 1 akun Facport; mengisi ulang koneksi yang sudah diputus admin; penanganan galat Administrator di jalur import/refresh (hanya pemilihan database); data klien PT Buana (urusan operasional).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error; lint bersih
- [x] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [x] Security review (subagent `security-auditor`)
- [x] Temuan Critical/High diperbaiki; Medium/Low diperbaiki atau dicatat
- [x] Dokumen + PROGRESS + lessons-learned

## Known Limitations
- Race tulis token antar dua callback bersamaan untuk akun Accurate yang sama (audit Low, diterima; ADR-0047 § risiko residual) — pulih lewat Hubungkan Ulang.
- Pesan galat "hak Administrator" hanya dikenali di pemilihan database; jalur import/refresh yang bisa memicu pesan serupa belum ditangani.
- Pembacaan galat bergantung pada teks Accurate ("hak Administrator"); bila Accurate mengubah redaksinya, UI jatuh kembali ke pesan generik (aman, bukan rusak).
- Log lama `Gagal buka Data Usaha Accurate` untuk galat selain Administrator masih memuat `err.message` Accurate (pra-ada).
- UI belum dilihat di browser.

## Ringkasan Hasil
Tiga perbaikan dari insiden produksi 2026-10-13: (1) galat "hak Administrator" dari Accurate dikenali → `422 ACCURATE_ADMIN_REQUIRED {installUrl}`, UI menjelaskan + tombol tautan instalasi (host divalidasi di API dan web: https, `account.accurate.id`, tanpa port/kredensial); (2) pesan "akun sudah dipakai" memberi jalan keluar (putuskan oleh pemilik / User Tambahan / akun lain) dan penolakan tercatat sebagai `connect_rejected` (tanpa data pemilik lain); (3) penolakan tidak lagi memutus pemilik sah diam-diam: token baru dipulihkan ke baris pemilik (`active`/`expired` saja, terkunci identitas akun).
**Verifikasi:** typecheck + lint bersih; API 2.350 lulus; web 559 lulus; data uji dibersihkan.
**Security review** (`security-auditor`): 0 Critical, 0 High, 0 Medium, 2 Low (race token → diterima & dicatat; `conflictingConnectionId` di audit → memang tujuan fitur), 4 Info (hardening port → diperbaiki; sisanya tidak perlu tindakan).
**Status rilis:** BELUM dirilis.
