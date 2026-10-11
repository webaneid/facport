# Fase 189D — Halaman Insight Admin (fungsional)

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Satu area **Insight** di panel admin (`/insight`, menu "Insight" untuk `insights.view`) yang menampilkan semua kebutuhan data client FAC (Excel 10/10/2026) memakai API 189C: ringkasan, daftar pelanggan + kontak (tombol WhatsApp), pengguna per fitur, akses User Tambahan, langganan baru & akan berakhir, tren tahunan + usia langganan, riwayat koneksi, dan ekspor CSV. **Fungsional dulu**: memakai komponen yang ada (`DataTable`, `Tabs`, `Select`, `StatCard`, `Dialog`); redesain visual & design system = Fase 190 (komponen bersama sehingga halaman ini ikut terbarui). Induk: `phase-189-insight-pelanggan-admin.md`; API: `architecture-insights-api.md`; rancangan halaman: `architecture-admin-insight.md` § 6.

## Mode kerja
Banyak komponen UI + satu tambahan kecil di API (jumlah slot per pelanggan, filter jenis akun) → eksekusi langsung bertahap (satu komit per kelompok tab), TDD (Testing Library + mock API), security review subagent di akhir (data pribadi di UI, unduhan CSV, tautan WhatsApp).

## Informasi arsitektur halaman
`/insight?tab=<kunci>` (tab dapat di-bookmark; default `ringkasan`). Tab:
| Tab | Isi | API |
|---|---|---|
| **Ringkasan** | kartu KPI: akun komersil/internal, Data Usaha terhubung, pelanggan & fitur aktif, akan berakhir 14/30 hari, uang bulan & tahun ini (terverifikasi vs dilunasi admin); pintasan ke tab terkait | `summary` |
| **Pelanggan** | cari + filter tipe (Semua/Komersil/Internal); kolom ringkas (nama·perusahaan, kontak + WhatsApp, tipe/jenis, Data Usaha·fitur); **Lihat** → detail; ekspor | `customers`, `customers/:id/access`, `export/customers` |
| **Fitur** | tabel fitur (pelanggan, Data Usaha); **Lihat** → pemakai (kontak, Data Usaha, masa berlaku, WhatsApp); ekspor per fitur | `features`, `features/:key/customers`, `export/feature-users` |
| **Akses** | pemilik + jumlah slot User Tambahan (aktif/diundang/tersedia); **Lihat** → per Data Usaha: email member/undangan, masa kursi, tautan ke detail user untuk cabut/pindahkan | `customers?kind=pemilik`, `customers/:id/access` |
| **Langganan** | sub-tab **Baru** (rentang tanggal) dan **Akan berakhir** (14/30 hari + status tagihan perpanjangan); kontak + WhatsApp; ekspor | `new`, `expiring`, `export/new`, `export/expiring` |
| **Tren & Retensi** | filter tahun; metrik terdaftar·aktif·baru·berhenti·uang; grafik + tabel (bulan lalu/selisih/%); pilih bulan → rincian usia langganan | `trend`, `tenure`, `export/trend` |
| **Riwayat Koneksi** | ringkasan koreksi/berulang; filter (semua/koreksi), rentang tanggal, cari; tabel peristiwa dengan kalimat; ekspor | `connection-history`, `export/connection-history` |

## Prinsip tampilan (dari permintaan user)
- Tabel mengikuti gaya `DataTable` yang ada, **kolom sedikit & tidak melebar ke samping** (lebar persen, `TruncateText`); detail lengkap lewat tombol **Lihat** (dialog), bukan kolom tambahan.
- Tombol **WhatsApp** (`wa.me` dari E.164 asli lewat `waLink`) dan nomor yang bisa diklik di setiap baris yang punya kontak; nomor tidak sah/kosong → tanpa tombol.
- Keadaan kosong, memuat, dan galat selalu ditangani; angka jujur (bulan depan tidak digambar sebagai 0).
- Ekspor: unduhan CSV lewat `fetch` berkredensial → blob (galat 429/422 ditampilkan sebagai toast, bukan halaman JSON).

## Scope
**API (tambahan kecil)**
- [x] A1 `GET /admin/insights/customers`: tambah `seats {active, invited, available}` per akun pemilik + filter `kind=pemilik|tambahan|belum` (untuk tab Akses; tanpa N+1) + tes.
**Web (`apps/web`)**
- [x] W1 `lib/insights.ts` (tipe respons, label, `exportUrl`, pembantu format delta/persen) + tes; `components/admin/insight/` bersama: `ContactCell` (perusahaan + telepon + WhatsApp), `ExportButton` (unduh berkredensial + galat), `OwnerSummary`.
- [x] W2 Halaman `app/admin/(protected)/insight/page.tsx` (tab via `?tab=`), item menu "Insight" (ikon, `insights.view`), label breadcrumb; tes tab & navigasi.
- [x] W3 Tab Ringkasan + Pelanggan (+ dialog Lihat).
- [x] W4 Tab Fitur + Akses.
- [x] W5 Tab Langganan (Baru / Akan berakhir).
- [x] W6 Tab Tren & Retensi (Recharts + tabel + usia langganan).
- [x] W7 Tab Riwayat Koneksi.
- [x] W8 Tes komponen per tab (Testing Library, mock `api`), tes ekspor (fetch berkredensial, galat kuota), tes nav ber-izin.
**Dokumen**
- [x] D1 `architecture-admin-insight.md` § 6 status + `architecture-insights-page.md` (peta tab→API, konvensi), PROGRESS/phase 189, lessons-learned bila ada temuan.

## Di luar scope
Redesain visual/tipografi/design system (Fase 190); KPI di `/admin` dashboard (189E); aksi massal hapus/anonimisasi (189H); mengubah data dari halaman ini (cabut akses tetap di detail user — halaman Insight hanya membaca).

## Keamanan (untuk review penutup)
Data pribadi hanya tampil untuk `insights.view` (menu & API); tidak ada penyimpanan data pribadi di `localStorage`; tautan `wa.me`/`tel:` hanya dari nilai tervalidasi (`waLink`/`telLink`); unduhan CSV lewat fetch berkredensial — tidak mengekspos URL dengan token; teks dari DB dirender sebagai teks React; parameter tab/filter dari URL divalidasi (tidak dipercaya).

## Referensi
- `architecture-insights-api.md`; `architecture-admin-insight.md` § 5.2–5.4, 6; `architecture-contact.md` (WhatsApp/telepon); `architecture-data-usaha-history.md`; pola grafik `components/admin/dashboard/*`

## Keputusan Kecil Selama Eksekusi
- Pengambil data tunggal `useInsightQuery(key, load)`: hasil kueri lama tidak pernah tampil untuk `key` baru (tanpa data basi); setState hanya di callback async (lint React Compiler).
- Halaman memakai `router.replace("/insight?tab=…")` tanpa `usePathname`, dan tes nav memeriksa sumber `sidebar.tsx` — `mock.module("next/navigation")` parsial dari tes lain bocor lintas file dan membuat impor modul yang memakai `usePathname` gagal di suite penuh.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review (subagent `security-auditor`)
- [ ] Temuan Critical/High diperbaiki; Medium/Low diperbaiki atau dicatat
- [ ] Dokumen; PROGRESS/phase 189 diupdate
- [ ] Catat: UI belum dilihat di browser

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
