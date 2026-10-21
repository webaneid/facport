# Fase 207 — Peringatan Unggah Dobel (DITUNDA)

**Status:** Planned — DITUNDA (belum ada kode; menunggu konsultasi client)
**Mulai:** -
**Selesai:** -

## Tujuan
Mengurangi kerja ganda worker saat pelanggan mengunggah file yang sama dua kali.
Kasus nyata 2026-10-21: 2 batch Sales Invoice 5000 baris (user & nama file sama)
berjalan berurutan; batch ke-2 menunggu antrean lalu ditolak sebagai duplikat
(ADR-0031) — tidak merusak dokumen, tetapi memakan waktu worker dan
membingungkan pelanggan ("kenapa batch gagal?").

Aturan baku: **dokumen pelanggan tidak boleh diubah** — fase ini hanya
menyentuh pengiriman/antrean, bukan bentuk atau nomor dokumen
(lihat `feedback_never_alter_customer_documents`).

## Keputusan Sementara (2026-10-21, user)
- **File sama TETAP BOLEH diunggah dulu** — tidak ada pemblokiran. Paling jauh
  hanya peringatan/informasi. Alasan: perlu konsultasi ke client sebelum
  perilaku diubah; ada kemungkinan unggah ulang yang sah (mis. koreksi isi
  dengan nama file sama).
- Jadi fase ini TIDAK dikerjakan sampai ada keputusan client. Dokumen ini ada
  supaya kelak bisa dilanjutkan tanpa menggali ulang.
- Bagian efisiensi lain (hitung baris SR, tinjau chunk 500) dipisah ke Fase 206
  dan jalan terus.

## Pertanyaan Terbuka (bawa ke client)
1. Saat file sama masih diproses: cukup **peringatan + izin lanjut**, atau
   **blokir** sampai batch pertama selesai?
2. Kunci "file sama": **user + nama file** (sederhana) atau tambah **hash isi
   file** (akurat; butuh kolom baru + migrasi)? Nama sama dengan isi beda
   adalah kasus sah.
3. Perlu ditampilkan **posisi antrean** ("menunggu 1 batch di depan")?

## Scope (rencana — usulan, belum disetujui)
- [ ] Endpoint bersama `GET /imports/active?module=&fileName=`: batch berstatus
      `processing`/`queued` milik Data Usaha aktif (tersaring per subscription),
      berisi nama file, waktu mulai, posisi antrean per koneksi Accurate.
- [ ] Pengaman di `confirm` (25 route upload/confirm punya pola sama): tanpa
      flag `approveDuplicate` dan ada batch aktif ber-file sama → 409
      `DUPLICATE_ACTIVE_BATCH` (pola sama dengan `approveStaged`, Fase 205).
      Dipasang lewat SATU helper, bukan disalin ke 25 route.
- [ ] Frontend: komponen `ActiveImportNotice` + dialog persetujuan di
      `components/import/`, dipasang di halaman import tiap modul (1–2 baris
      per halaman, ±23 halaman).
- [ ] Tes: regresi helper, tidak membocorkan batch Data Usaha/pelanggan lain.

## Referensi
- `docs/architecture/architecture-staged-send.md`, ADR-0051 (Fase 205)
- `docs/architecture/architecture-import-capacity.md`
- ADR-0031 (perlindungan duplikat di Accurate)
- Pola titik masuk: `apps/api/src/lib/accurate-job-dispatch.ts` (`enqueueAccurateJob`)

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- Selama fase ini belum jalan, unggah dobel tetap dilindungi ADR-0031 (batch
  ke-2 ditolak sebagai duplikat di Accurate) — hanya membuang waktu worker.

## Ringkasan Hasil (isi pas fase Done)
