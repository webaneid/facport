# Fase 205 — Kirim Bertahap ke Dokumen yang Sama & Kirim Ulang Idempoten

**Status:** Planned
**Mulai:** —
**Selesai:** —

## Tujuan
Dokumen 1 nomor berisi ribuan baris dikirim ke Accurate dalam cicilan ke DOKUMEN YANG SAMA (nomor dan isi tidak berubah — Facport DILARANG mengubah dokumen pelanggan), dengan kirim ulang aman sampai sukses. Lebih lambat daripada sekali kirim, tetapi tiap langkah punya batas waktu sendiri dan dapat dilanjutkan. Lihat ADR-0051 (revisi) dan `architecture-staged-send.md`.

## Scope (sub-fase; tiap sub-fase dikonfirmasi sebelum lanjut)
- [ ] 205a Uji trial dulu: total/header sementara, penulisan bersamaan, update timeout, identik dengan Excel (skrip eksperimen, tanpa kode produk)
- [ ] 205b Pondasi: env, pemotong cicilan murni + tes, migrasi `import_staged_documents`, mesin status + klaim atomik
- [ ] 205c Eksekutor Sales Receipt (baca nomor → cicilan → verifikasi → backoff) di balik `IMPORT_STAGED_MODULES`
- [ ] 205d Penjadwal berantai + adaptasi pemulihan job hantu (requeue) + penutupan batch
- [ ] 205e UI: popup persetujuan, progres, coba lagi, batal
- [ ] 205f Purchase Payment
- [ ] 205g Uji end-to-end di trial (1.000–2.000 baris, paksa timeout, matikan worker) + dokumentasi hasil

## Referensi
- Architecture: `docs/architecture/architecture-staged-send.md`
- ADR: `docs/decisions/adr-0051-kirim-bertahap-ke-dokumen-yang-sama-dan-kirim-ulang-idempoten.md`
- Bukti: `docs/architecture/architecture-import-capacity.md` § 11–14

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md`
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- Lebih lambat daripada sekali kirim (hukum Accurate); dokumen > ~2.000 baris bisa berjam-jam.
- Selama proses, dokumen di Accurate terisi bertahap.
- Modul selain Sales Receipt & Purchase Payment belum tercakup.

## Ringkasan Hasil
(diisi saat Done)
