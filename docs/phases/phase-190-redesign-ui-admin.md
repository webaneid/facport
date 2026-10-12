# Fase 190 — Redesain UI Admin ("Kompak & tajam")

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Membuat panel admin lebih rapi, kompak, modern, dan interaktif (keluhan user: huruf terlalu besar, tidak rapi, kurang modern) TANPA mengubah surface pelanggan/landing. Keputusan: ADR-0046; skala baku: `architecture-admin-design-system.md`. Induk: seri 189 (layar nyata Insight + KPI dashboard sudah ada).

## Mode kerja
Perubahan visual lintas banyak komponen → eksekusi langsung bertahap, satu komit per sub-fase, tes Testing Library untuk kontrak kelas (varian `compact:` hanya di admin) dan perilaku interaksi. Verifikasi visual oleh user menjadi gerbang penutup (kode tidak bisa membuktikan "elegan"); upaya cek browser otomatis dicoba sekali, bila login bermasalah turun ke review kode (memori: quirks verifikasi browser).

## Sub-fase
| Sub-fase | Isi | Status |
|---|---|---|
| 190A | Mekanisme `compact:` (varian + atribut shell) dan primitif: Card, Button, Input/Select/Textarea, Badge, Table/DataTable, StatCard, PageHeader, Tabs, Dialog, EmptyState | Done (kode; visual menunggu user) |
| 190B | Cangkang admin: AppShell, Sidebar (lebih ramping), Topbar, padding konten | Done (kode; visual menunggu user) |
| 190C | Dashboard `/admin` & Insight: KPI klik-tembus + sparkline (tren aktif & uang), grafik lebih rapat, metrik awal dari URL | Done (kode; visual menunggu user) |
| 190D | Interaksi: palet perintah (⌘/Ctrl+K: halaman ber-izin + cari pelanggan), keadaan kosong rapat | Done (kode; header tabel lengket & fokus baris keyboard DITUNDA) |
| 190E | Audit halaman admin yang menulis ukuran sendiri (`text-3xl`, `p-8`, dst) & rapikan | Done (1 temuan: judul Hasil Import) |
| 190F | Tutup: suite penuh, review aksesibilitas ringan, catatan verifikasi visual untuk user | Planned |

## Scope
- [ ] 190A–190F di atas (centang per sub-fase)

## Di luar scope
Dashboard pelanggan & landing (menyusul, fase terpisah); logo/brand/warna baru; pergantian pustaka UI; fitur data baru.

## Keamanan
Tidak ada perubahan logika/izin. Palet perintah (190D) hanya navigasi ke rute yang sudah ada dan hanya menampilkan item yang diizinkan (`permission`) — pencarian pengguna memakai endpoint admin yang sudah ber-izin `users.view`; tidak ada data pribadi di `localStorage`.

## Referensi
ADR-0046, ADR-0024, ADR-0034; `architecture-admin-design-system.md`; `components/ui/*`, `components/app-shell/*`

## Keputusan Kecil Selama Eksekusi
- Atribut `data-ui="compact"` dipasang di `app/admin/layout.tsx` (pembungkus `display: contents` agar konten SSR tanpa kedip) DAN di `<body>` lewat `CompactSurface` supaya portal Radix (Dialog/Dropdown/Popover) ikut; dilepas saat unmount. Root layout tidak memakai `headers()` (menghindari membuat landing dinamis).
- Tabel header lengket ditunda ke 190D (pembungkus `overflow-x-auto` pada `Table` mematahkan `sticky`).
- Terverifikasi: `next build` sukses; CSS terkompilasi `.compact\:rounded-lg:where([data-ui=compact],[data-ui=compact] *)`.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes web hijau (SUITE PENUH)
- [ ] Review keamanan (palet perintah: skill `security-review`)
- [ ] Dokumen; PROGRESS diupdate
- [ ] Catat: tampilan perlu diverifikasi user di browser

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
