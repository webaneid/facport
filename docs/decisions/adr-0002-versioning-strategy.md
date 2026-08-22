# ADR-0002: Strategi Versioning & Release

**Status:** Accepted
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
- Ada satu langkah manual yang wajib diingat: menghapus override
  `releaseRules` di `.releaserc.json` pas app dianggap siap `v1.0.0` — kalau
  lupa, breaking change setelah v1.0.0 akan tetap dianggap minor, bukan major
  (melanggar ekspektasi konsumen API). **Ini dicatat juga di
  `docs/lessons-learned.md` sebagai reminder.**
- CI/CD (`release.yml`) jadi gate wajib: kalau typecheck/test gagal, release
  otomatis dibatalkan — konsisten dengan Langkah 3-4 SOP.
