# Fase 205 — Kirim Bertahap ke Dokumen yang Sama & Kirim Ulang Idempoten

**Status:** Done (saklar `IMPORT_STAGED_MODULES` default mati)
**Mulai:** 2026-10-21
**Selesai:** 2026-10-21

## Tujuan
Dokumen 1 nomor berisi ribuan baris dikirim ke Accurate dalam cicilan ke DOKUMEN YANG SAMA (nomor dan isi tidak berubah — Facport DILARANG mengubah dokumen pelanggan), dengan kirim ulang aman sampai sukses. Lebih lambat daripada sekali kirim, tetapi tiap langkah punya batas waktu sendiri dan dapat dilanjutkan. Lihat ADR-0051 (revisi) dan `architecture-staged-send.md`.

## Scope (sub-fase; tiap sub-fase dikonfirmasi sebelum lanjut)
- [x] 205a Uji trial: total/header sementara DITERIMA, penulisan bersamaan diserialkan, update tetap selesai walau klien putus, identik dengan Excel (SR & PP) — hasil di arsitektur § 4
- [x] 205b Pondasi: env, modul murni `staged-send` (rencana cicilan, awalan, estimasi, pelaksana dengan deps) + tes — TANPA tabel baru (arsitektur § 5)
- [x] 205c Eksekutor (`runStagedSend`) + perekat worker (`processStagedGroup`) untuk Sales Receipt, di balik `IMPORT_STAGED_MODULES`
- [x] 205d Pemulihan job hantu: batch yang hanya berisi dokumen bertahap DILANJUTKAN otomatis (job baru, maks `IMPORT_STAGED_MAX_RESUMES`); expire & jalur BESAR mengikuti model waktu (penjadwal berantai tidak diperlukan — satu job idempoten yang dapat dilanjutkan)
- [x] 205e UI: popup persetujuan (`StagedApprovalDialog`) di halaman import Sales Receipt & Purchase Payment; progres = baris `success` bertahap; Retry melanjutkan (petunjuk di ringkasan galat)
- [x] 205f Purchase Payment (jalur sama; uji trial 60+60 baris identik; tes worker)
- [x] 205g Uji end-to-end di trial (1.000–2.000 baris, paksa timeout, matikan worker) + dokumentasi hasil

## Referensi
- Architecture: `docs/architecture/architecture-staged-send.md`
- ADR: `docs/decisions/adr-0051-kirim-bertahap-ke-dokumen-yang-sama-dan-kirim-ulang-idempoten.md`
- Bukti: `docs/architecture/architecture-import-capacity.md` § 11–14

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (subagent `security-auditor`; hasil di Ringkasan)
- [x] Temuan Critical/High diperbaiki (lihat Ringkasan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Lebih lambat daripada sekali kirim (hukum Accurate); dokumen > ~2.000 baris bisa berjam-jam.
- Selama proses, dokumen di Accurate terisi bertahap.
- Modul selain Sales Receipt & Purchase Payment belum tercakup.
- Dokumen ber-PPh (`detailTax`) tidak dicicil (belum terbukti di trial).
- Perkiraan waktu memakai model trial (7e-4·N²); production dapat berbeda — evaluasi setelah tryout.

## Ringkasan Hasil
Dokumen Sales Receipt / Purchase Payment bernomor dengan baris > ambang (default 200) dikirim BERTAHAP ke dokumen Accurate yang SAMA (nomor, header, isi, urutan identik dengan Excel; tidak ada tabel/migrasi baru), di balik `IMPORT_STAGED_MODULES` (default mati). Kemajuan = isi dokumen di Accurate (dibaca by nomor) + baris `success` bertahap; timeout → tunggu & baca ulang (Accurate terbukti menyelesaikan sendiri), kirim ulang hanya bila tak maju; restart/deploy → job dilanjutkan otomatis; popup persetujuan; Retry melanjutkan.
- **Uji:** api 2582+ tes hijau, web 585 hijau, typecheck & lint nol; trial Accurate dengan kode produk: 400/600/300 entri identik dengan Excel; timeout klien dan `kill -9` pulih (capacity § 15).
- **Security review:** subagent `security-auditor` — 0 Critical, 1 High (header tidak dibandingkan) DIPERBAIKI; Medium/Low ditangani/ditetapkan (architecture-staged-send § 6c).
- **Keputusan di tengah eksekusi:** tanpa tabel baru; dokumen ber-PPh tidak dicicil; dokumen dengan perkiraan > 24 jam tidak dicicil; koefisien model 7e-4 (terukur).
