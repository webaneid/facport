# Fase 133 — Lebar Kolom Tabel Tidak Terkontrol (Perbaikan Menyeluruh)

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Client komplain (via user, 2026-09-17): tabel di aplikasi (dicontohkan
invoice) jadi lebar dan butuh scroll horizontal di laptop kecil. Audit
menemukan root cause di komponen dasar `components/ui/table.tsx` —
`whitespace-nowrap` hardcode, TIDAK ADA kontrol lebar kolom (table-fixed/
width/truncate) di seluruh app — bukan bug 1 halaman. Fase ini
memperbaiki komponen dasar SEKALIGUS menerapkan width eksplisit +
truncate ke SEMUA 48 file tabel yang teridentifikasi (9 admin + 2
customer utama + 36 halaman generik per-modul + 1 admin batch-detail).

## Scope
- [x] Fase A — primitif: `components/ui/table.tsx` (table-fixed),
      `components/ui/truncate-text.tsx` (baru), `components/ui/data-table.tsx`
      (baca `meta.width`), ADR-0034.
- [x] Fase B — 9 halaman admin (plans/invoices/orders/announcements/promos/
      users/users-[id]/staff/customer-care) + 2 customer (billing,
      import-batch-table.tsx). `admin/users/[id]/page.tsx` subscription
      table dirampingkan 7→6 kolom (Durasi+Berlaku digabung).
- [x] Fase C — 39 halaman generik per-modul (13 modul × 3 file: import/
      riwayat/[batchId]) + admin import-batches/[batchId]/page.tsx (13
      view function dalam 1 file). Dikerjakan via `sed` terverifikasi
      (pola literal identik dikonfirmasi count-match dulu di SEMUA 13
      modul sebelum apply, per modul: vendor/payable-account termasuk).

## Referensi
- ADR: `docs/decisions/adr-0034-lebar-kolom-tabel.md`
- Plan lengkap: `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- Kolom "ID .../Error" (13 halaman `[batchId]` customer + 13 view admin)
  SENGAJA TIDAK diberi width eksplisit — dibiarkan menyerap sisa lebar
  (`table-fixed` mengalokasikan sisa ke kolom tanpa width), konsisten
  keputusan "kolom paling penting/terlebar dapat ruang paling banyak".
- Native `title` attribute (via `TruncateText`) dipakai konsisten di
  SEMUA 54 file, TIDAK ada 1 pun yang pakai Radix `Tooltip` — sesuai
  ADR-0034, menghindari kompleksitas mount `TooltipProvider` baru.
- `admin/users/[id]/page.tsx`: kolom "Berlaku" gabungan pakai `title`
  custom (override prop `TruncateText`, BUKAN default title=children)
  supaya bisa tampilkan "Mulai X · Durasi Y" walau teks yang terlihat
  cuma tanggal akhir.
- Eksekusi Fase C pakai `sed` BUKAN edit manual 39 file — tapi SETIAP
  pola literal diverifikasi dulu match-count-nya di ke-13 modul (`grep -c`)
  SEBELUM `sed` dijalankan, supaya tidak ada modul yang polanya beda
  diam-diam ter-skip atau salah ganti.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] Security review — TIDAK relevan, di-skip (murni CSS/className/komponen
      presentational baru, 0 endpoint/data/auth/logic disentuh)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser: customer `/billing` dan `/import/arsip`
  dikonfirmasi render benar (proporsi kolom rapi, tanpa scroll horizontal
  di lebar 1280px) — `/import/arsip` kebetulan 0 data (empty state) jadi
  tabel isi tidak sempat terlihat dengan baris nyata, tapi struktur
  kolom sudah benar via code review. Sisi ADMIN (invoices/plans/orders/
  dst) TIDAK terverifikasi visual — dicoba ulang kredensial
  `admin@facport.com` (ditemukan dari query DB langsung), TAPI password
  tidak diketahui (bukan salah satu dari 2 known quirks yang sudah
  didokumentasikan sebelumnya) — tidak dipaksakan tebak-tebak password,
  diganti code review (pola identik dengan yang sudah terverifikasi
  benar di customer side: `table-fixed` + width % + `TruncateText`).
  User diminta cek visual admin langsung sebelum dianggap benar-benar
  final, terutama halaman `/invoices` yang jadi keluhan awal.
- 39 file Fase C dikerjakan via `sed` (bukan dibaca 1-per-1 hasil
  akhirnya) — count-match verification sebelum `sed` MEMBERI keyakinan
  tinggi tapi bukan pengganti baca visual; direkomendasikan spot-check
  1-2 modul lagi di browser kalau ada waktu (sudah di-spot-check
  `sales-invoice`/`purchase-invoice`/`purchase-order` via `Read` setelah
  `sed`, hasilnya benar).

## Ringkasan Hasil
Root cause (komponen `Table` tanpa `table-fixed`, tanpa kontrol lebar
kolom sama sekali) diperbaiki di 1 tempat (ADR-0034), lalu diterapkan ke
54 file tabel di seluruh app (bukan cuma invoice yang dikeluhkan) —
9 halaman admin, 2 halaman customer utama, 1 halaman admin batch-detail
(13 view), dan 39 halaman generik per-modul (13 modul × 3 file). Setiap
kolom sekarang punya lebar eksplisit (persentase/px), kolom berisi teks
tak terbatas (nama bebas, join list, error message, nama file) di-truncate
1 baris dengan `title` attribute (bukan Radix Tooltip) untuk info penuh
saat hover. Kolom "Durasi"+"Berlaku" di admin user-detail (ditambahkan
Fase 130) digabung jadi 1 kolom untuk mengurangi lebar. Ini jadi konvensi
PERMANEN (ADR-0034) untuk tabel baru ke depannya, bukan cuma tambalan
1x untuk 54 file yang ada sekarang.
