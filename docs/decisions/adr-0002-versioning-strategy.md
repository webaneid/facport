# ADR-0002: Strategi Versioning & Release

**Status:** Accepted (diperbarui 2026-09-12 — lompatan ke `2.0.0`, lihat § "Update 2026-09-12" di bawah)
**Tanggal:** 2026-08-18

## Context
Project butuh sistem versi yang jelas (mulai dari `0.0.1`) dan proses release
yang tidak bergantung ingatan manual "sekarang harusnya versi berapa". Tapi
loncat ke `1.0.0` (dianggap "stabil/siap publik") itu keputusan produk, bukan
sesuatu yang bisa dideteksi dari pola commit message.

## Decision
- Pakai **semantic-release**, otomatis jalan di CI (`release.yml`) tiap push
  ke `main`.
- Versi ditentukan dari **Conventional Commits**:
  - `fix:` → patch (`0.0.1` → `0.0.2`)
  - `feat:` → minor (`0.0.2` → `0.1.0`)
  - `feat!:` / `BREAKING CHANGE:` → **selama masih `0.x.x`, di-override jadi
    minor juga** (bukan major), lewat `releaseRules` custom di `.releaserc.json`.
    Ini sesuai spesifikasi semver sendiri: versi `0.y.z` dianggap fase
    development awal, API dianggap "belum stabil, apa pun boleh berubah".
- **Loncat ke `1.0.0` dilakukan MANUAL**, bukan otomatis:
  1. Developer memutuskan app sudah dianggap stabil/siap dipakai serius
  2. Hapus/update `releaseRules` override di `.releaserc.json` (breaking
     change setelah ini baru betulan naik MAJOR)
  3. Buat commit `feat!: initial stable release` atau tag manual `v1.0.0`
  4. Update ADR ini (tambah catatan, jangan bikin ADR baru untuk ini —
     ini bagian dari keputusan yang sama, cukup diperbarui statusnya)

## Alternatif yang Dipertimbangkan
- **Changesets** — lebih explicit (developer nulis file changeset per PR
  yang nentuin bump-nya), tapi ditolak karena user secara eksplisit mau
  proses yang **otomatis penuh** dari commit message, bukan langkah manual
  tambahan tiap PR.
- **Manual versioning** (edit `package.json` version sendiri tiap release) —
  ditolak, rawan lupa/inkonsisten, dan tidak ada jaminan changelog akurat.
- **Semantic-release default (breaking change = major, bahkan di 0.x)** —
  ditolak, karena akan bikin project ini loncat ke v1, v2 dst secara tidak
  sengaja padahal masih tahap awal development, sebelum developer benar-benar
  memutuskan app-nya stabil.

## Konsekuensi
- Commit message HARUS disiplin conventional commits (`docs/conventions.md`),
  kalau tidak, semantic-release tidak akan mendeteksi release yang seharusnya.
- ~~Ada satu langkah manual yang wajib diingat: menghapus override
  `releaseRules` di `.releaserc.json` pas app dianggap siap `v1.0.0`~~ —
  **langkah ini SEMPAT TERLEWAT** (baru dihapus 2026-09-12, § update di
  bawah) — breaking change SEMPAT tetap dianggap minor dari `v1.0.0` sampai
  `v1.28.0` (28 rilis `feat:`, TIDAK ADA yang naik MAJOR walau beberapa di
  antaranya sebenarnya breaking secara desain, mis. restrukturisasi Data
  Usaha Fase 106-111). Dicatat di `docs/lessons-learned.md` 2026-08-22 &
  2026-09-12.
- CI/CD (`release.yml`) jadi gate wajib: kalau typecheck/test gagal, release
  otomatis dibatalkan — konsisten dengan Langkah 3-4 SOP.

## Update 2026-09-12 — Lompatan ke `2.0.0`
Diminta user setelah restrukturisasi besar Data Usaha/User Tambahan/Transfer
Kepemilikan (Fase 106-111, `docs/architecture/architecture-user-tambahan.md`)
— perubahan model data yang cukup fundamental (Data Usaha jadi unit
workspace utama, menggantikan langganan flat per-akun) untuk dianggap
lompatan MAJOR, sama seperti keputusan manual `0.x → 1.0.0` sebelumnya
(§ Decision di atas — ini KEPUTUSAN PRODUK, bukan terdeteksi otomatis dari
commit).

Langkah yang dijalankan (persis pola § Decision "Loncat ke `1.0.0`" di
atas, diterapkan lagi untuk `2.0.0`):
1. **Override `releaseRules` di `.releaserc.json` DIHAPUS** — baru sekarang
   (bukan pas `v1.0.0` dulu, itu yang jadi utang di atas). Sejak commit ini,
   `feat!:`/`BREAKING CHANGE:` di commit message akan BENERAN naik MAJOR,
   bukan minor lagi.
2. Commit yang menyertai update ADR ini pakai `feat!:` (breaking change)
   supaya semantic-release mendeteksi lompatan `1.28.0 → 2.0.0`.
3. ADR ini diperbarui (bukan ADR baru), sesuai instruksi § Decision Langkah 4.

**Konsekuensi ke depan**: sejak `2.0.0`, breaking change SUNGGUHAN naik
MAJOR (perilaku semver default, tidak ada override lagi) — kalau nanti ada
alasan untuk kembali membatasi breaking-change jadi minor (mis. masuk fase
pre-release lagi), itu perlu ADR/keputusan terpisah, JANGAN diam-diam
tambahkan override lagi tanpa dicatat.
