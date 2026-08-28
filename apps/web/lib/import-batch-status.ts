// § Fase 09, ADR-0013 — dipakai dashboard (Server Component) DAN halaman
// arsip (Client Component) untuk menentukan kapan tombol Batal Import
// ditampilkan. WAJIB di file TANPA "use client" — kalau ditaruh satu
// file dengan komponen client (`cancel-import-dialog.tsx`), Next.js
// menukar export non-komponen jadi client reference opaque saat diimpor
// dari Server Component, `.has()` gagal runtime (`TypeError: ...has is
// not a function`, ketemu 2026-08-28 bikin dashboard 500 total).
export const CANCELLABLE_BATCH_STATUS = new Set(["completed", "completed_with_errors"]);
