# ADR-0046: Design system admin "Kompak & tajam" (density scope, bukan reskin global)

**Status:** Accepted (arah visual disetujui user 2026-10-12: pilihan "1. Kompak & tajam"; cakupan "Admin dulu, pelanggan menyusul"; urutan "kebutuhan client dulu, UI kemudian" sudah terpenuhi lewat Fase 189)
**Tanggal:** 2026-10-12
**Terkait:** ADR-0023 (UI kit), ADR-0024 (Admin UI Kit v2), ADR-0034 (tabel), Fase 189D/E (halaman Insight, KPI dashboard), `architecture-admin-design-system.md`, Fase 190

## Context
Keluhan user: dashboard admin terasa "tidak rapi", ukuran huruf terlalu besar, UI "kurang mantap dan tidak modern", dan diminta jauh lebih interaktif, informatif, elegan. Fakta kode: komponen UI primitif (`Button`, `Card`, `Table`, `Input`, `Badge`, `StatCard`, `PageHeader`, `Dialog`, `Tabs`) dipakai BERSAMA oleh surface admin dan surface pelanggan (`app.`) serta landing; angka besar (`text-3xl` judul, `p-6` kartu, `rounded-2xl/xl`) berlaku untuk semuanya. User meminta admin dulu, pelanggan menyusul — mengubah primitif secara global akan mengubah dashboard pelanggan tanpa direncanakan dan tanpa diuji.

## Decision
1. **Arah visual "Kompak & tajam"**: skala tipografi lebih kecil dan rapat (basis 13px di admin; judul halaman `text-xl`; angka KPI `text-2xl`), spasi lebih rapat (kartu `p-4`, sel tabel `py-2`), sudut lebih tegas (`rounded-lg`/`rounded-md`, bukan `2xl`/`xl`), bayangan lebih datar, kanvas netral tanpa gradasi dekoratif di area kerja, warna brand tetap (`#178549`, `#184e30`, `#f5f1e8` — token yang sudah ada tidak diganti).
2. **Mekanisme: varian Tailwind `compact:` yang di-scope oleh atribut `data-ui="compact"`** di pembungkus `AppShell` surface admin. Primitif mendapat kelas tambahan `compact:...` (mis. `p-6 compact:p-4`); tanpa atribut itu tampilannya TIDAK berubah. Dengan begitu: (a) admin berubah seketika di semua halaman tanpa menyentuh tiap halaman, (b) dashboard pelanggan & landing tidak berubah sampai ada keputusan (menyusul = cukup memasang `data-ui="compact"` di shell pelanggan, atau varian lain), (c) tidak ada fork komponen. Varian didefinisikan sekali di `globals.css` (`@custom-variant compact`).
3. **Interaktif & informatif** dibangun di atas komponen yang ada, tanpa dependensi baru: KPI dashboard dapat diklik menuju tab Insight terkait dan menampilkan tren mini (sparkline Recharts dari `GET /admin/insights/trend`), tabel dengan header lengket dan baris yang bisa difokus keyboard, pencarian cepat (palet perintah memakai `components/ui/command.tsx` yang sudah ada) untuk berpindah halaman/menemukan pengguna, status memuat berupa skeleton, dan ringkasan keadaan kosong yang menunjuk tindakan berikutnya.
4. **Aksesibilitas tidak dikorbankan**: ukuran teks tidak di bawah 12px (kecuali lencana 11px), kontras mengikuti token yang sudah ada, fokus terlihat dipertahankan, target klik ikon ≥ 32px.
5. Verifikasi visual oleh user (tangkapan layar/uji manual) adalah gerbang penutup tiap sub-fase UI — kode tidak bisa membuktikan "elegan".

## Alternatif yang Dipertimbangkan
- **Reskin global primitif** — ditolak: mengubah dashboard pelanggan & landing tanpa rencana/uji; bertentangan dengan "admin dulu".
- **Fork komponen `ui/admin/*`** — ditolak: duplikasi besar, drift, dua sumber kebenaran.
- **Ganti pustaka (shadcn baru/Mantine/Ant)** — ditolak: biaya migrasi puluhan halaman, risiko regresi, tidak perlu untuk tujuan ini.
- **Mengubah token ukuran secara global lewat CSS variable** — ditolak: komponen memakai kelas Tailwind literal (bukan variable), butuh migrasi semua pemakai.

## Konsekuensi
- Satu varian `compact:` dan satu atribut di shell admin; menambah kelas pada ±10 primitif. Halaman yang menulis ukuran sendiri (mis. `text-3xl` langsung) tidak otomatis ikut — diaudit dan dirapikan per sub-fase.
- Tailwind v4 `@custom-variant` + `tailwind-merge`: kelas bervarian kustom dianggap grup terpisah — tidak saling menimpa; diuji.
- Pelanggan menyusul sebagai fase terpisah (bisa memakai atribut yang sama atau skala sendiri).

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-0046" di file baru itu.
