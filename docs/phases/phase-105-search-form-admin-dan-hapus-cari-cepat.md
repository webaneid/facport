# Fase 105 — Search Form di Semua Halaman Admin + Hapus "Cari Cepat"

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
3 permintaan client terkait search di sisi admin:
1. Hapus kotak "Cari cepat" di header (Topbar) — sudah lama `disabled`,
   tidak pernah berfungsi (§ ADR-0024).
2. Pastikan search form di tiap halaman list admin (Pengguna, Tim
   Internal, Paket, Invoice, Konfirmasi Pembayaran, Pengumuman) lebarnya
   100% sesuai lebar kolom, bukan sempit.
3. Pastikan search form itu benar-benar berfungsi (bukan dekoratif).

**Temuan penting dari riset** (bukan asumsi — dicek langsung ke kode):
dari 6 halaman yang disebut, **HANYA halaman Pengguna** yang sudah punya
search form (dan itu pun lebarnya `max-w-xs`, bukan 100%). 5 halaman
lainnya (Tim Internal, Paket, Invoice, Konfirmasi Pembayaran, Pengumuman)
**sama sekali belum punya search form apa pun** — bukan bug/dekoratif,
memang belum pernah dibuat. Dikonfirmasi ke user via `AskUserQuestion`
sebelum eksekusi — user pilih **buat baru di semua halaman itu** (bukan
cuma fix yang sudah ada), jadi scope Fase 105 lebih besar dari sekadar
"perbaiki CSS": termasuk desain+implementasi search backend (query param
+ `ilike`) untuk 5 resource yang sebelumnya tidak punya filter teks sama
sekali.

## Scope
- [x] `apps/web/components/app-shell/topbar.tsx` — hapus kotak "Cari
      cepat" (`disabled`, tidak pernah berfungsi sejak ADR-0024).
- [x] Backend — tambah `search` query param (opsional) + filter
      `ilike` ke 5 endpoint admin yang BELUM punya filter teks:
      - `apps/api/src/routes/admin/staff.route.ts` — search nama/email
        (pola sama `admin/users.route.ts`).
      - `apps/api/src/routes/admin/plans.route.ts` — search nama paket.
      - `apps/api/src/routes/admin/invoices.route.ts` — search nomor
        invoice ATAU nama penagihan (`billToName`, snapshot).
      - `apps/api/src/routes/admin/orders.route.ts` — search nomor
        invoice/nama, digabung `and()` dengan filter status Tabs yang
        sudah ada (§ Fase 20, ADR-0023) — independen, bisa dipakai
        bersamaan.
      - `apps/api/src/routes/admin/announcements.route.ts` — search
        judul pengumuman saja (bukan `body`, isi bisa panjang).
- [x] Frontend — wire `SearchForm` (komponen shared, sudah ada sejak
      Fase 25, debounced 350ms) ke 5 halaman yang belum ada:
      `staff/page.tsx`, `plans/page.tsx`, `invoices/page.tsx`,
      `orders/page.tsx`, `announcements/page.tsx`. `invoices/page.tsx`
      dan `orders/page.tsx` sebelumnya tidak punya `CardHeader` sama
      sekali (langsung `CardContent`) — ditambah `CardHeader` baru
      (title+description+SearchForm), konsisten pola halaman lain.
- [x] Fix lebar — SEMUA `SearchForm` (termasuk yang sudah ada di
      Pengguna) pakai `className="mt-2 w-full"` (BUKAN `max-w-xs`) —
      `CardHeader` adalah `flex flex-col` (default `align-items:
      stretch`), jadi `w-full` benar-benar 100% lebar Card/kolom.
- [x] Typecheck + lint + test suite penuh (api+web) + security review.
- [x] Verifikasi fungsional: curl langsung ke 5 endpoint backend (no
      search vs search cocok vs search tidak cocok) DAN verifikasi
      visual browser di 6 halaman (login admin, ketik di search box,
      screenshot hasil filter).

## Referensi
- `docs/decisions/adr-0024-admin-ui-kit-v2.md` — asal kotak "Cari cepat"
  (`disabled` sejak awal, SearchForm sebagai komponen shared).
- `docs/phases/phase-25-data-table-form-controls-v2.md` — asal
  komponen `SearchForm` (debounce, celah bug ditemukan di
  `admin/users/page.tsx` lama).
- `apps/api/src/routes/admin/users.route.ts` — pola SATU-SATUNYA
  referensi search yang sudah ada sebelum fase ini, direplikasi ke 5
  endpoint baru.

## Keputusan Kecil Selama Eksekusi
- **Field yang di-search per halaman** dipilih berdasarkan apa yang
  jadi identifier alami di tabel tsb (bukan semua kolom): Tim Internal
  → nama/email (sama users), Paket → nama saja (deskripsi tidak ada di
  tabel), Invoice & Konfirmasi Pembayaran → nomor invoice ATAU nama
  penagihan (2 kandidat paling sering dicari admin), Pengumuman →
  judul saja (BUKAN `body`, isi pengumuman bisa panjang & bukan yang
  biasa jadi kata kunci pencarian admin).
- **Konfirmasi Pembayaran**: search DIGABUNG (`and()`), bukan
  menggantikan, filter status Tabs yang sudah ada sejak Fase 20 — admin
  bisa cari sambil tetap di tab "Menunggu Verifikasi" mis., tidak perlu
  pindah ke tab "Semua" dulu.
- Tidak menambah test otomatis khusus untuk `search` (baik yang baru
  maupun yang lama di `admin/users.route.ts`) — konsisten dengan
  precedent yang SUDAH ADA sebelum fase ini (search di `users.route.ts`
  sendiri tidak pernah dapat test dedicated), dan sesuai
  `architecture-testing.md` § "CRUD generik ... smoke test 1x, tidak
  wajib exhaustive". Diverifikasi manual lewat curl (server-side) +
  browser (end-to-end) sebagai gantinya — lihat § Ringkasan Hasil.
- `admin/plans.route.ts` sebelumnya TIDAK PUNYA file test sama sekali
  (`plans.route.test.ts` tidak ada) — pre-existing gap, BUKAN
  diperkenalkan fase ini. Tidak dibuatkan test baru di fase ini (di
  luar scope permintaan user), dicatat di Known Limitations.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) —
      nol temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [x] Lint nol error (`bun run lint`)
- [x] Test suite penuh pass (654 API, 57 web)
- [x] Verifikasi manual browser (6 halaman admin)

## Known Limitations
- `admin/plans.route.ts` masih tanpa file test otomatis sama sekali
  (pre-existing sejak sebelum fase ini) — search filter baru di
  endpoint ini HANYA diverifikasi manual (curl), belum ada regression
  test. Kalau nanti ada perubahan di file ini lagi, pertimbangkan buat
  `plans.route.test.ts` dari nol (bukan cuma nambah test search).
- Tidak ada test unit/integration khusus untuk logic `search` di 5
  endpoint baru maupun yang lama — konsisten precedent project, bukan
  celah baru (lihat § Keputusan Kecil).

## Ringkasan Hasil
- Kotak "Cari cepat" (disabled, tidak pernah berfungsi) sudah dihapus
  dari Topbar — dikonfirmasi tidak ada regresi layout (bell+avatar
  tetap rapi, `gap-2` otomatis menyesuaikan).
- 5 halaman admin yang sebelumnya TIDAK PUNYA search form sama sekali
  (Tim Internal, Paket, Invoice, Konfirmasi Pembayaran, Pengumuman)
  sekarang punya search form BERFUNGSI PENUH (server-side `ilike`
  filter, bukan client-side), width 100% kolom.
- Search form Pengguna (satu-satunya yang sudah ada sebelumnya)
  lebarnya diperbaiki dari `max-w-xs` jadi 100%.
- Diverifikasi FUNGSIONAL via 2 jalur:
  1. **curl langsung ke backend** (bypass frontend) — kelima endpoint
     (`/admin/staff`, `/admin/plans`, `/admin/invoices`,
     `/admin/orders`, `/admin/announcements`) dites dengan search
     cocok (hasil terfilter benar) dan search tidak cocok (hasil
     kosong `[]`), semua sesuai ekspektasi.
  2. **Browser end-to-end** — login admin sungguhan, ketik di search
     box tiap 6 halaman, screenshot hasil filter (mis. Pengguna:
     254→1 baris, Tim Internal: 214→1 baris, Paket: filter "Multi Sub
     Plan" balikin 6 baris relevan, Invoice: filter nomor balikin 1
     baris, Konfirmasi Pembayaran: filter "PT Test Invoice" balikin 10
     baris (digabung status Tab "Menunggu Verifikasi"), Pengumuman:
     filter "Maintenance" balikin 3 baris).
- Typecheck (api+web) 0 error, lint 0 error, test suite PENUH 654 API
  + 57 web pass/0 fail (tidak ada regresi dari pola search baru maupun
  penghapusan search box lama).
- Security review: nol temuan (parameterized query via Drizzle `ilike`,
  tidak ada perubahan permission/ownership, search selalu MEMPERSEMPIT
  dataset yang sudah diizinkan, tidak pernah memperluas).
- Test admin/customer browser dibersihkan dari dev DB setelah
  verifikasi.
- **BELUM di-release** sesuai standing rule (2026-09-11) — commit+push
  ke `develop` saja.
