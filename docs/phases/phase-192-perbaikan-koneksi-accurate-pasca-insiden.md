# Fase 192 — Perbaikan Koneksi Accurate Pasca Insiden 2026-10-13

**Status:** In Progress
**Mulai:** 2026-10-13
**Selesai:** —

## Tujuan
Insiden produksi (klien PT Buana Indah + akun uji tim FAC, 2026-10-13) menyingkap tiga celah: (1) galat "hak Administrator" dari Accurate tampil sebagai pesan generik; (2) pesan "sudah terhubung ke akun Facport lain" tidak memberi jalan keluar dan penolakannya tak berjejak; (3) penukaran kode OAuth yang berujung ditolak diam-diam mematikan token pemilik yang sah. Keputusan: ADR-0047.

## Mode kerja
Menyentuh jalur token (sensitif) di API + web + docs → eksekusi langsung bertahap + TDD; security review oleh subagent `security-auditor` di akhir. Tidak ada migrasi DB. Tidak dirilis sampai user memerintahkan.

## Scope
**API**
- [ ] A1 `parseAdminRequired(err)` di `lib/accurate.ts` (deteksi galat + ekstraksi `installUrl` tervalidasi host `account.accurate.id`) + tes murni.
- [ ] A2 `POST /accurate/databases/select`: `422 ACCURATE_ADMIN_REQUIRED {installUrl}`, log peringatan tanpa pesan Accurate + tes.
- [ ] A3 Callback OAuth: pada `accurate_account_in_use`, pulihkan token baris pemilik (hanya `active`/`expired`, kunci `accurate_user_id`), catat `connect_rejected` + log `conflictingConnectionId` + tes (termasuk `revoked` tidak dihidupkan; pemanggil tidak mendapat penunjuk).
- [ ] A4 Aksi `connect_rejected` di `DATA_USAHA_EVENT`; tidak masuk laporan Insight.
**Web**
- [ ] W1 `accurate-gate-copy`: pesan "sudah dipakai" baru; `accurate-gate-provider`: tangani `ACCURATE_ADMIN_REQUIRED` (penjelasan + tombol tautan, host divalidasi ulang) + tes.
- [ ] W2 `data-usaha-history.ts`: kalimat untuk `connect_rejected` + tes.
**Dokumen**
- [ ] D1 `architecture-accurate-integration.md` / `architecture-accurate-connect-gate.md` (alur penolakan & galat Administrator), lessons-learned, PROGRESS.

## Di luar scope
Mengubah aturan 1 akun Accurate ↔ 1 akun Facport; mengisi ulang koneksi yang sudah diputus admin; penanganan galat Administrator di jalur import/refresh (hanya pemilihan database); data klien PT Buana (urusan operasional).

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review (subagent `security-auditor`)
- [ ] Temuan Critical/High diperbaiki; Medium/Low diperbaiki atau dicatat
- [ ] Dokumen + PROGRESS + lessons-learned

## Known Limitations
-

## Ringkasan Hasil
