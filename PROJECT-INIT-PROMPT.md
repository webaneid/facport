# PROJECT-INIT-PROMPT.md

> INI FILE UNTUK KAMU (bukan untuk Claude baca duluan). Cara pakai:
> 1. Copy seluruh blok di dalam ``` di bawah ini
> 2. Isi bagian [DALAM KURUNG SIKU] sesuai project barumu
> 3. Paste ke sesi Claude Code baru (di root folder project yang sudah ada
>    template ini ter-extract)
> 4. Claude akan otomatis jalanin skill `project-init` dan sesuaikan semua
>    file — kamu tinggal review hasilnya, bukan nulis ulang dari nol.

---

```
Ini project baru saya. Sesuaikan semua file template (CLAUDE.md, apps/*/CLAUDE.md,
docs/architecture/*, docs/decisions/adr-0001, docs/glossary.md, dan seluruh
placeholder [isi ...] lainnya) dengan detail berikut. Jalankan skill project-init.

## Nama Project
facport

## Deskripsi Singkat (2-3 kalimat)
Facport aplikasi yang dikembangkan oleh FAC Institute, adalah solusi berbasis cloud yang dirancang khusus untuk meningkatkan efisiensi operasional bagi pengguna Accurate Online. Aplikasi ini berfungsi sebagai jembatan otomatis yang memungkinkan Anda melakukan impor ribuan data transaksi dari file Excel ke sistem Accurate Online hanya dalam satu klik.

Dirancang untuk menggantikan metode input manual yang memakan waktu dan rentan terhadap kesalahan (human error), Facport membantu staf akuntansi, finance, hingga pemilik bisnis untuk mempercepat proses pembukuan, memastikan data lebih rapi, akurat, dan proses kerja menjadi jauh lebih efektif. Dengan Facport, Anda tidak perlu lagi melakukan instalasi tambahan; cukup login dan proses integrasi data langsung berjalan.

## Fitur Utama (list, urutkan dari yang paling prioritas — ini bakal jadi
## kandidat fase 01, 02, dst di PROGRESS.md, SETELAH Fase 00 fondasi)
1. Modul Penjualan

Mempermudah proses impor data terkait penjualan, meliputi:

    Pesanan Penjualan

    Pengiriman Pesanan (Delivery Order)

    Faktur Penjualan (Sales Invoice)

    Penerimaan Penjualan (Sales Receipt)

    Retur Penjualan

2. Modul Pembelian

Mempercepat pengelolaan dokumen transaksi pembelian:

    Pesanan Pembelian (Purchase Order)

    Penerimaan Barang (Received Item)

    Faktur Pembelian (Purchase Invoice)

    Pembayaran Pembelian (Purchase Payment)

    Retur Pembelian

3. Modul Persediaan (Inventory)

Mengoptimalkan pengelolaan stok dan penyesuaian inventaris:

    Permintaan Barang

    Pekerjaan Pesanan (Job Order)

    Penyelesaian Pesanan (Roll Over)

    Pindah Barang (Item Transfer)

    Penyesuaian Persediaan (Item Adjustment)

4. Modul Manufaktur

Mendukung alur produksi dengan fitur impor untuk:

    Perintah Kerja (SPK)

    Pengambilan Bahan Baku (Material Release/MR)

    Penyelesaian Barang Jadi (Material Release/MRT)

5. Modul Kas & Bank serta Buku Besar

    Pembayaran (OP)

    Penerimaan (OD)

    Jurnal Umum
   

## Target User
Pengguna accurate online, di accurate.id bisa:

Staf Akuntansi & Finance: Profesional yang sehari-hari disibukkan dengan entri data keuangan, pembukuan, dan rekonsiliasi laporan dalam jumlah besar.

Pemilik Bisnis / Owner: Pimpinan perusahaan atau business owner yang ingin meningkatkan efisiensi operasional bisnis, memangkas waktu proses administrasi, dan memastikan keakuratan laporan keuangan.

Pengguna / Praktisi Accurate Online: Perusahaan dari berbagai jenis dan skala usaha yang menggunakan ekosistem Accurate Online dan sering kali kewalahan melakukan input data transaksi manual dalam jumlah masif bersumber dari file Excel.

## Stack
Default template ini: Bun + Elysia (API) + Next.js (frontend) + PostgreSQL/Drizzle
+ MinIO (storage). Kalau SAMA, tulis "pakai default". Kalau BEDA, sebutkan
di sini apa yang beda dan kenapa (biar Claude update ADR-0001 juga, bukan cuma
ganti nama doang):
[pakai default / atau jelaskan bedanya]

## Info Perusahaan/Organisasi (untuk Settings Page Fase 00 — lihat
## docs/architecture/architecture-settings.md. Kosongkan kalau belum ada,
## bisa diisi manual belakangan lewat Settings Page)
- Nama: [nama perusahaan/organisasi]
- Alamat: [alamat, minimal kota/provinsi kalau di Indonesia]
- Timezone: [mis. Asia/Jakarta — default Asia/Jakarta kalau tidak disebutkan]
- Logo/favicon: [kosongkan kalau belum ada file, diisi lewat Media Library nanti]

## Checklist Kebutuhan Komponen
> Selalu ada di semua project, TIDAK masuk checklist (non-negotiable, lihat
> CLAUDE.md root bagian "Rules Non-Negotiable"): Auth & RBAC, Settings Page,
> Media Library + Image Processing, Backup otomatis, Observability
> (Sentry+logging). Yang di bawah ini murni tergantung kebutuhan project —
> checklist Ya/Tidak, JANGAN dikosongkan (kosong = Claude akan tanya balik).

| Komponen | Ya/Tidak | Catatan (isi kalau Ya & ada detail spesifik) |
|---|---|---|
| Multi-tenant SaaS (banyak klien, 1 instance) | [tidak] | Kalau ya, jawab juga 3 sub-pertanyaan di bawah tabel ini |
| Komponen Alamat (form alamat lengkap) | [tidak] | [kalau ya: perlu dukungan luar negeri juga, atau Indonesia saja?] |
| Payment Gateway | [ya] | [kalau ya: provider — Ipaymu / Xendit ] |
| Kepatuhan Data Pribadi (UU PDP) | [tidak] | |
| Notifikasi Email | [ya] | |
| Notifikasi WhatsApp | [tidak] | [kalau ya: WA Cloud API resmi / gateway pihak ketiga — lihat trade-off di architecture-notifications.md] |
| Background Jobs/Queue | [ya — default YA kalau Notifikasi Email/WA = ya] | |
| Multi-bahasa (i18n ID/EN) | [tidak] | |
| SEO Analyzer + Sitemap | [tidak] | [relevan kalau ada halaman publik/landing page — biasanya TIDAK relevan untuk app internal seperti invoice] |
| Full-text Search | [ya] | |
| Staging Environment | [ya] | |

### Kalau Multi-tenant SaaS = Ya, Jawab Juga 3 Ini
(menentukan isi `docs/architecture/architecture-tenancy-domain-routing.md` —
kosongkan kalau Multi-tenant = Tidak, file ini otomatis dihapus)
1. **Custom domain per tenant?** (tenant boleh pasang domain sendiri, mis.
   `namatenant.com`, bukan cuma `namaplatform.com/{slug}`)
   [ya / tidak — cukup subdomain atau path saja]
2. **Kalau Ya di atas — admin dashboard tenant juga diakses lewat custom
   domain mereka, atau tetap lewat domain platform saja?**
   [tetap di domain platform (lebih sederhana, default) / ya, juga di custom
   domain — path (`/admin`) atau subdomain (`admin.domain`)?]
3. **Nama domain platform kamu sendiri** (buat admin platform, front-end
   platform — beda dari domain tenant): [misal app.namaplatform.com]


##API refernsi accurate online
https://account.accurate.id/developer/api-docs.do
login:
Email : kurikulum.fac@gmail.com
Pass : Password123!

## Integrasi/Constraint Khusus (kalau ada)
terintegrasi API dari accurate.id untuk verifikasi token menggunakan API accurate untuk import data

## Istilah Domain Khusus (kalau ada istilah yang bakal sering dipakai di
## project ini, di luar istilah teknis umum)
[istilah: arti — kosongkan kalau tidak ada]

## Domain & Repo (kosongkan kalau belum ada, isi belakangan pas mau deploy)
- Domain: [belum ada]
- GitHub repo: https://github.com/webaneid/facport.git
- Server: [belum ada]
```

---

## Yang akan Claude lakukan setelah kamu paste ini
Lihat detail lengkap di `.claude/skills/project-init/SKILL.md`, ringkasnya:
1. Ganti semua placeholder nama/deskripsi project di CLAUDE.md (root + nested)
2. Update ADR-0001 kalau stack berbeda dari default (ADR baru dengan nomor urut
   yang benar, bukan menimpa adr-0002/adr-0003/adr-0004/adr-0005 yang sudah dipakai)
3. **Buat draft Fase 00 (fondasi)** di `docs/PROGRESS.md` +
   `docs/phases/phase-00-fondasi.md` — setup Settings Page (diisi dari "Info
   Perusahaan" di atas), Better Auth + RBAC dasar, Media Library dasar, **plus
   komponen lain PERSIS sesuai Checklist Kebutuhan di atas (yang "Tidak" TIDAK
   di-setup sama sekali, bukan di-setup lalu didiamkan)**. Fase 00 WAJIB jalan
   duluan sebelum Fase 01 fitur.
4. Buat draft Fase 01 di `docs/PROGRESS.md` + `docs/phases/phase-01-*.md`
   berdasarkan fitur prioritas pertama yang kamu sebutkan
5. **Untuk tiap baris "Tidak" di Checklist** → hapus file
   `docs/architecture/architecture-{komponen}.md` (atau
   `docs/architecture/components/architecture-component-{komponen}.md`)
   terkait DAN baris-nya di tabel "Peta Dokumen" CLAUDE.md root — supaya
   tidak ada dokumen tidak relevan yang membingungkan sesi Claude berikutnya.
   Khusus Multi-tenant = Ya → isi
   `docs/architecture/architecture-tenancy-domain-routing.md` dari 3
   sub-pertanyaan di atas (custom domain, admin-on-custom-domain, nama
   domain platform); kalau Tidak → hapus file itu SEKALIGUS dengan
   `architecture-tenancy.md`. Detail pemetaan checklist→file lengkap ada di
   `.claude/skills/project-init/SKILL.md`.
6. Isi `docs/glossary.md` dengan istilah domain yang kamu kasih
7. Kalau domain/repo sudah diisi → update `Caddyfile`, `.env.production.example`,
   `.env.staging.example`, dan referensi `GITHUB_REPO` di file deploy — kalau
   belum, dibiarkan placeholder dengan catatan jelas "isi nanti sebelum deploy
   pertama"
8. Kasih ringkasan apa yang diubah — termasuk **tabel checklist yang kamu isi,
   supaya kamu bisa cross-check tidak ada yang salah tercentang** sebelum lanjut kerja
