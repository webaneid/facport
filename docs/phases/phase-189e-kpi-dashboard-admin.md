# Fase 189E — KPI Insight di Dashboard Admin (`/admin`)

**Status:** Done
**Mulai:** 2026-10-12
**Selesai:** 2026-10-12

## Tujuan
Menampilkan KPI komersil vs internal dan nilai rupiah (butir 1 + uang) langsung di dashboard `/admin`, memakai API Insight 189C (`GET /admin/insights/summary`) — angka dashboard lama (`/admin/stats`, Fase 59) TIDAK diubah (keputusan 189G). Induk: `phase-189-insight-pelanggan-admin.md`; rancangan: `architecture-admin-insight.md` § 6, 8.

## Mode kerja
Kecil (1 komponen bersama + 1 komponen dashboard + tes) → eksekusi langsung, TDD. Tanpa perubahan API/DB. Security review skill `security-review` di sesi utama (≤3 file inti, tanpa endpoint baru).

## Rancangan
- Ekstrak kartu KPI dari tab Ringkasan Insight ke `components/admin/insight/kpi-cards.tsx` (satu sumber, dipakai tab Ringkasan DAN dashboard) — tanpa duplikasi.
- `components/admin/dashboard/insight-kpi-section.tsx` (client): hanya dirender bila pengguna punya `insights.view` (`usePermissions`); memuat `summary`, menampilkan kartu + tautan "Buka Insight". Tanpa izin → tidak ada panggilan API dan tidak ada bagian.
- Disisipkan di `app/admin/(protected)/page.tsx` di atas blok statistik lama, dengan judul "Pelanggan & Keuangan (komersil)" + catatan bahwa angka lama di bawahnya mencakup semua akun customer.

## Scope
- [x] E1 Ekstrak `KpiCards` + SummaryTab memakainya (tes lama tetap hijau)
- [x] E2 `InsightKpiSection` ber-izin + sisip di dashboard + tes (tanpa izin tak memanggil API; galat → pesan; tautan ke /insight)
- [x] E3 Dokumen: PROGRESS, phase 189, architecture-admin-insight § 6/8, architecture-admin-dashboard catatan
- [x] E4 typecheck, lint, suite web, security review, commit+push

## Di luar scope
Redesain visual (Fase 190); mengubah `/admin/stats`; grafik tren baru di dashboard (tren ada di tab Insight).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error; lint bersih
- [x] Tes web hijau (suite penuh)
- [x] Security review
- [x] Dokumen; PROGRESS/phase 189 diupdate
- [x] Catat: UI belum dilihat di browser

## Known Limitations
- UI belum dilihat di browser (penempatan di atas blok statistik lama perlu dicek user; Fase 190 merapikan).
- Dashboard kini menampilkan dua definisi "pengguna": KPI baru (komersil, internal dikecualikan) dan kartu lama Fase 59 (semua akun customer) — dijelaskan lewat catatan di bagian baru; penyatuan = Fase 190.
- Gerbang izin di klien hanya UX; API tetap menolak 403 tanpa `insights.view`.

## Ringkasan Hasil
Dashboard `/admin` memiliki bagian "Pelanggan & Keuangan (komersil)" (akun komersil vs internal, Data Usaha terhubung, pelanggan & fitur aktif, akan berakhir 14/30 hari, uang bulan/tahun ini terverifikasi vs dilunasi admin) dari `GET /admin/insights/summary`, hanya untuk `insights.view`. Kartu diekstrak ke `kpi-cards.tsx` (dipakai tab Ringkasan dan dashboard). Tanpa perubahan API/DB.
**Verifikasi:** typecheck + lint bersih; web 512 lulus. **Security review** (skill, sesi utama): tanpa endpoint baru; tanpa izin tidak ada panggilan API; teks angka saja — tidak ada temuan.
