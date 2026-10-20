# Fase 205 — Pecah Dokumen Bernomor Sama & Kirim Ulang Idempoten

**Status:** Planned
**Mulai:** —
**Selesai:** —

## Tujuan
Dokumen 1 nomor berisi ribuan baris dipecah jadi dokumen kecil dan dikirim bertahap, dengan kirim ulang aman sampai sukses. Alasan: Accurate memproses dokumen ∝ N² dan bangun-bertahap tidak menolong (capacity § 14). Lihat ADR-0051 dan `architecture-document-splitting.md`.

## Scope (sub-fase; tiap sub-fase dikonfirmasi sebelum lanjut)
- [ ] 205a Pondasi: env, pemecah murni + tes, migrasi `import_batch_parts`, mesin status + klaim atomik
- [ ] 205b Eksekutor bagian Sales Receipt (cek-nomor → save → verifikasi → backoff) di balik `IMPORT_SPLIT_MODULES`
- [ ] 205c Penjadwal berantai + adaptasi pemulihan job hantu (requeue) + penutupan batch
- [ ] 205d UI Rencana/persetujuan, progres per bagian, coba lagi, batal
- [ ] 205e Purchase Payment
- [ ] 205f Uji end-to-end di trial (5.000 baris, paksa timeout, matikan worker) + dokumentasi hasil
- [ ] 205g Paralel terbatas antar bagian (setelah terbukti)
- [ ] (terpisah, perlu persetujuan) modul faktur

## Referensi
- Architecture: `docs/architecture/architecture-document-splitting.md`
- ADR: `docs/decisions/adr-0051-pecah-dokumen-bernomor-sama-dan-kirim-ulang-idempoten.md`
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
- Dokumen tanpa nomor eksplisit tidak bisa diverifikasi (nomor dibuat eksplisit untuk dokumen terpecah).
- Modul faktur belum tercakup.

## Ringkasan Hasil
(diisi saat Done)
