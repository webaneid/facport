# SOP — Alur Kerja Per Fase

> Ini aturan PROSES, bukan aturan teknis (teknis ada di architecture-*.md).
> Dibaca sebelum mulai fase baru, dan tiap langkah di sini WAJIB dicentang
> sebelum pindah ke langkah berikutnya — jangan skip meski kelihatan sepele.

## Kenapa harus per-fase (bukan langsung ngoding semua)
Tiap fase = satu unit kerja yang bisa didokumentasikan, di-review, dan di-rollback
sendiri kalau ada masalah. Fase yang terlalu besar susah dilacak kalau ada bug
muncul belakangan — nggak jelas dari perubahan mana asalnya.

## Alur Wajib (6 Langkah)

### 1. Perencanaan → buat `docs/architecture/architecture-{nama-fitur}.md`
- Tulis dulu SEBELUM ngoding: apa yang mau dibangun, kenapa, gimana desainnya.
- Kalau ada keputusan teknis besar di fase ini (pilih library, pola baru, dll)
  → itu jadi ADR baru di `docs/decisions/`, bukan cuma disebut di architecture doc.
- Buat entri fase baru di `docs/PROGRESS.md` dan `docs/phases/phase-XX-{nama}.md`
  (copy dari `docs/phases/phase-template.md`), status: `Planned`.

### 2. Eksekusi per fase + dokumentasi berjalan
- Kerjakan HANYA scope yang didefinisikan di langkah 1 — kalau nemu kebutuhan baru
  di luar scope, catat sebagai fase terpisah, jangan diperluas diam-diam.
- Update `docs/phases/phase-XX-{nama}.md` selagi jalan: task mana yang selesai,
  keputusan kecil yang diambil di tengah eksekusi (yang nggak cukup besar buat ADR
  tapi tetap perlu diingat).
- Status fase di `docs/PROGRESS.md` diubah ke `In Progress`.

### 3. Type check
```bash
bun run typecheck   # atau: bunx tsc --noEmit
```
- WAJIB nol error sebelum lanjut ke langkah berikutnya.
- Kalau ada error yang "sengaja" dibiarkan (edge case yang belum ditangani),
  itu HARUS ditulis eksplisit di `docs/phases/phase-XX-{nama}.md` sebagai
  known limitation — bukan didiamkan begitu saja.

### 4. Security check
- Jalankan skill `security-review` untuk file yang baru diubah di fase ini.
- Kalau fase ini besar (banyak file/endpoint), delegasikan ke subagent
  `security-auditor` untuk hasil yang lebih menyeluruh.
- Temuan **Critical/High** WAJIB diperbaiki sebelum fase ditutup.
  Temuan **Medium/Low** boleh dicatat sebagai technical debt di
  `docs/lessons-learned.md` dan dilanjut nanti — tapi harus tercatat, bukan hilang.

### 5. Tutup fase
- Update `docs/phases/phase-XX-{nama}.md`: status `Done`, ringkasan hasil,
  link ke PR/commit kalau ada.
- Kalau ada bug/insight yang layak diingat untuk fase-fase berikutnya →
  tambahkan ke `docs/lessons-learned.md`.
- Update status di `docs/PROGRESS.md` jadi `Done`.

### 6. Lanjut ke fase berikutnya
- Balik ke langkah 1 untuk fase baru. Jangan mulai fase baru sebelum fase
  sebelumnya berstatus `Done` di `docs/PROGRESS.md`, kecuali memang dua fase
  itu didesain paralel (jarang, dan harus dijelasin kenapa di architecture doc).

## Staging — Gerbang Sebelum Production
> Detail teknis lengkap (branch, compose, network) → `docs/decisions/adr-0003-staging-environment.md`
> dan `docs/architecture/architecture-deployment.md`.

- Kerja harian tetap di feature branch → PR ke **`develop`** (bukan langsung
  ke `main`). Merge ke `develop` otomatis deploy ke staging (`deploy-staging.yml`).
- **Fase kecil/low-risk** (fix kecil, task jelas scope-nya): boleh langsung
  PR `develop` → `main` begitu Langkah 3-4 SOP lolos, tidak wajib nunggu
  verifikasi manual staging lama-lama.
- **Fase besar/berisiko** (auth, payment, migration data, apa pun yang susah
  di-rollback — sama kategorinya dengan yang butuh Plan Mode di
  `docs/WORKFLOW-MODES.md`): **WAJIB diverifikasi manual di staging dulu**
  sebelum PR `develop` → `main`. Jangan skip ini meski typecheck+test+security
  review sudah hijau — itu menjamin kode "benar secara teknis", bukan
  menjamin "berperilaku sesuai ekspektasi user asli".
- Data di staging tidak pernah data production asli (privasi + supaya tes
  tidak sengaja korupsi data nyata).

## Release — Otomatis, di Luar Siklus 6 Langkah di Atas
> Ini bukan "Langkah 7" yang manual — release terjadi otomatis tiap push
> ke `main` lewat CI, terpisah dari siklus per-fase. Tapi tetap perlu dipahami
> supaya nggak kaget.

- Tiap push ke `main` (biasanya habis fase ditutup & di-merge) → `release.yml`
  otomatis jalan → cek apakah ada commit yang layak rilis versi baru
  (`fix:`/`feat:`/dst sejak tag terakhir).
- Kalau ada → versi baru otomatis ditentukan (patch/minor, lihat
  `docs/decisions/adr-0002-versioning-strategy.md`), tag dibuat, GitHub
  Release dibuat, `CHANGELOG.md` diupdate — semua tanpa kamu ketik angka manual.
- GitHub Release baru itu otomatis trigger `deploy.yml` → build Docker image
  (bersih, tanpa docs/.md) → deploy ke server.
- Detail lengkap alur ini → `docs/architecture/architecture-deployment.md`.
- **Loncat ke v1.0.0 SELALU manual**, tidak pernah otomatis — lihat ADR-0002.

## Kapan boleh menyimpang dari urutan ini
- Bug fix kecil/urgent (hotfix production) boleh skip langkah 1 (nggak perlu
  architecture doc baru) dan boleh PR langsung ke `main` tanpa lewat `develop`
  dulu (staging bisa nyusul disinkronkan setelahnya), tapi tetap WAJIB
  langkah 3, 4, dan dicatat di `docs/lessons-learned.md`.
- Eksplorasi/prototype yang belum tentu dipakai boleh di branch terpisah tanpa
  ikut SOP ini secara penuh — tapi begitu diputuskan dipakai, harus "masuk ulang"
  lewat langkah 1 sebelum di-merge ke main.
