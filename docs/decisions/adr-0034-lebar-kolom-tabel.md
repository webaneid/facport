# ADR-0034: Lebar Kolom Tabel — table-fixed + Width Eksplisit + Truncate

**Status:** Accepted
**Tanggal:** 2026-09-17

## Context
Client komplain (via user): tabel di aplikasi (dicontohkan invoice)
melebar tak terkendali dan butuh scroll horizontal di laptop kecil.
Audit (Fase 133) menemukan root cause di komponen dasar
`apps/web/components/ui/table.tsx` — `TableCell`/`TableHead` hardcode
`whitespace-nowrap`, dan **tidak ada satu pun tempat di seluruh app**
yang mengatur lebar kolom (`table-fixed`, `<colgroup>`, tanstack
`column.size`, atau truncate teks) — dikonfirmasi via grep, nol hasil.
Setiap tabel auto-lebar mengikuti kolom terlebarnya; kolom berisi teks
tak terbatas (nama bebas, daftar digabung koma, pesan error, nama file)
otomatis membuat SELURUH tabel melebar. Ini bug arsitektur komponen
dasar, bukan bug per-halaman — 48 file tabel di seluruh app terdampak.

## Decision
1. **`table-fixed` jadi layout default SEMUA tabel** (`Table` primitif,
   `components/ui/table.tsx`) — supaya lebar kolom yang dideklarasikan
   (persentase/px) benar-benar dihormati browser, bukan auto-mengikuti
   konten.
2. **Setiap kolom di tabel yang disentuh WAJIB punya lebar eksplisit** —
   kolom ikon/aksi pakai px tetap (`w-10` s/d `w-28` tergantung jumlah
   tombol), kolom isi pakai persentase yang totalnya proporsional ke
   100% bareng kolom fixed. `DataTable` (`components/ui/data-table.tsx`,
   wrapper `@tanstack/react-table`) baca `meta.width` dari `ColumnDef`,
   terapkan sebagai `style={{width}}` ke header+cell — 1 kali di
   wrapper, semua halaman `DataTable` tinggal deklarasi `meta: {width}`
   per kolom. Tabel raw (non-DataTable) set `className="w-[..]"` manual
   di tiap `<TableHead>`.
3. **Kolom berisi teks tak terbatas (nama bebas, daftar digabung, pesan
   error, nama file) WAJIB dibungkus komponen baru `TruncateText`**
   (`components/ui/truncate-text.tsx`) — `<span class="block truncate"
   title={...}>`, native `title` attribute (hover browser bawaan) untuk
   info penuh. **BUKAN** Radix `Tooltip` (`components/ui/tooltip.tsx`,
   sudah ada tapi 0 pemakaian di seluruh app sampai keputusan ini) —
   `title` native cukup untuk kebutuhan ini tanpa perlu mount
   `TooltipProvider` baru di layout manapun.
4. **Kalau tabel sudah punya dialog "Detail" terpisah** (mis. admin
   Invoice), truncate di tabel AMAN — dialog itu tetap sumber kebenaran
   info lengkap, truncate di tabel murni ringkasan-di-sekilas-pandang.
   Kalau BELUM ada dialog Detail dan kolomnya genuinely penting dilihat
   utuh, `title` attribute jadi satu-satunya jalan lihat teks penuh
   (cukup untuk kasus di project ini — semua kolom "tak terbatas" yang
   teridentifikasi adalah info sekunder, bukan aksi yang butuh dilihat
   penuh setiap saat).

## Alternatif yang Dipertimbangkan
- **Radix `Tooltip` untuk semua kolom truncated** — ditolak: perlu mount
  `TooltipProvider` baru (belum pernah dipakai sama sekali di app ini),
  kompleksitas ekstra tanpa manfaat berarti dibanding `title` native
  untuk kebutuhan "info penuh tersedia saat hover, tidak wajib selalu
  terlihat".
- **Wrap multi-baris (bukan truncate 1 baris)** — ditolak: bikin tinggi
  row tidak konsisten antar baris, tabel jadi lebih sulit di-scan
  sekilas (tujuan tabel = ringkasan cepat, detail penuh ada di
  dialog/hover, bukan di-cram semua ke row).
- **`table-auto` + `max-width` per kolom (bukan `table-fixed`)** —
  ditolak: `table-auto` tetap mendistribusikan lebar berdasar konten
  kolom LAIN yang tidak di-`max-width`, hasilnya kurang predictable
  dibanding `table-fixed` yang menghormati declared width apa adanya.

## Konsekuensi
- Tabel baru ke depannya WAJIB ikuti konvensi ini sejak awal (deklarasi
  width tiap kolom + `TruncateText` untuk kolom tak terbatas) — bukan
  cuma tambal 48 file existing, jadi standar permanen.
- Trade-off: kolom "tak terbatas" yang ditruncate kehilangan visibilitas
  instan (harus hover/buka dialog untuk lihat penuh) — diterima karena
  tujuan utamanya (tabel tidak melebar tak terkendali) lebih penting
  bagi UX di layar kecil, dan info penuh tetap 1 langkah away (hover),
  bukan hilang.
- 48 file perlu disentuh sekaligus (Fase 133) — risiko regresi visual
  kecil per file (murni className/style, tidak ada logic/data yang
  berubah) tapi volume perubahan besar, verifikasi visual per grup
  representatif (bukan ke-48 file 1-per-1) diterima sebagai cukup.
