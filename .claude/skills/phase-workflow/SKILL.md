---
name: phase-workflow
description: Orkestrasi kerja per-fase mengikuti SOP project (docs/SOP.md) — perencanaan, eksekusi, typecheck, security review, dokumentasi, baru lanjut fase berikutnya. WAJIB dipakai saat user minta mulai fitur/fase baru (mis. "bikin fase auth", "mulai kerjain fitur X", "lanjut ke fase berikutnya"). JANGAN langsung ngoding tanpa skill ini kalau user minta fitur baru yang cukup besar (lebih dari sekadar 1 fix kecil).
---

# Skill: Phase Workflow

Ini skill orkestrator — tugasmu memastikan urutan di `docs/SOP.md` benar-benar
diikuti, bukan cuma dijadikan referensi lalu diabaikan. Jangan loncat langkah
meski terasa lebih cepat kalau langsung ngoding.

## Sebelum mulai apa pun
Baca `docs/PROGRESS.md` — cek apakah ada fase `In Progress` yang belum ditutup.
Kalau ada, tanya user: lanjutin fase yang belum selesai itu, atau memang mau
mulai fase baru secara sengaja (paralel)?

## Jalankan urutan ini, JANGAN skip:

**Langkah 1 — Perencanaan**
- Tanya/konfirmasi ke user scope fase ini kalau belum jelas (jangan asumsi
  scope luas sendiri).
- **Tentukan mode kerja** sesuai `docs/WORKFLOW-MODES.md` SEBELUM eksekusi:
  - Fase ini besar/berisiko/belum familiar dengan bagian codebase-nya → mulai
    dengan Plan Mode, presentasikan rencana ke user dulu sebelum edit apa pun.
  - Fase ini butuh eksplorasi berat (banyak file besar) tapi hasilnya cukup
    ringkasan → pertimbangkan subagent untuk riset, baru eksekusi di sesi utama.
  - Fase ini jelas scope-nya dan medium/kecil → langsung Auto Mode/eksekusi biasa,
    nggak perlu Plan Mode formal.
- Buat `docs/architecture/architecture-{nama-fitur}.md` (pakai struktur yang
  sudah ada di project sebagai referensi format).
- Kalau ada keputusan teknis besar → buat ADR baru di `docs/decisions/`.
- Copy `docs/phases/phase-template.md` → `docs/phases/phase-XX-{nama}.md`,
  isi Tujuan & Scope, status `Planned`.
- Tambah baris baru di tabel `docs/PROGRESS.md`.
- **Berhenti di sini dan konfirmasi ke user** kalau rencananya cukup besar/
  ambigu sebelum lanjut eksekusi — jangan langsung tancap gas kalau scope-nya
  belum jelas.

**Langkah 2 — Eksekusi**
- Ubah status fase jadi `In Progress` di `docs/PROGRESS.md` dan phase doc.
- Kerjakan HANYA task yang ada di scope. Kalau ketemu kebutuhan di luar scope
  saat eksekusi, JANGAN diam-diam dikerjakan — beri tahu user itu di luar
  scope fase ini, tawarkan jadi fase terpisah.
- Update checklist task di phase doc seiring progress, jangan tunggu sampai akhir.

**Langkah 3 — Type check**
```bash
bun run typecheck
```
- Kalau ada error, perbaiki dulu sebelum lanjut. JANGAN lanjut ke langkah 4
  dengan type error yang belum di-resolve.

**Langkah 4 — Security check**
- File yang diubah sedikit (≤3 file) → jalankan skill `security-review` langsung
  di sesi utama (sesuai `docs/WORKFLOW-MODES.md`, ini bukan kandidat subagent).
- File yang diubah banyak/lintas modul (>3-4 file besar) → delegasikan ke subagent
  `security-auditor`, karena kamu cuma butuh laporan ringkasnya, bukan raw detail.
- Temuan Critical/High → perbaiki sekarang, jangan ditunda.
- Temuan Medium/Low → catat di `docs/lessons-learned.md`, boleh lanjut.

**Langkah 5 — Tutup fase**
- Update phase doc: status `Done`, isi "Ringkasan Hasil" dan "Known Limitations".
- Kalau ada insight/bug penting dari fase ini → tambah entri di `docs/lessons-learned.md`.
- Update `docs/PROGRESS.md` status jadi `Done`.

**Langkah 6 — Lapor ke user**
- Ringkas ke user: apa yang selesai, hasil typecheck, hasil security review,
  known limitations (kalau ada), dan tanya mau lanjut fase berikutnya atau berhenti dulu.
- JANGAN otomatis mulai fase berikutnya tanpa konfirmasi user, meski SOP
  bilang "lanjut" — itu urutan proses, bukan izin buat jalan tanpa direstui.

## Prinsip
Kalau di tengah jalan user minta sesuatu yang keluar dari alur ini (misal
"udahlah langsung aja, skip dokumentasi"), ikuti permintaan user untuk sesi
itu, tapi ingatkan singkat bahwa itu menyimpang dari SOP dan tanya apakah
tetap mau dicatat minimal di lessons-learned.md nanti.
