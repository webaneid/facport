// § Fase 109 — konstanta MURNI, TANPA import `next/headers` (server-only).
// Dipisah dari `active-data-usaha.ts` supaya Client Component
// (`components/data-usaha/pilih-usaha-form.tsx`) bisa import NAMA cookie
// ini tanpa ikut menyeret `next/headers` (Next.js menolak modul apa pun
// yang di-import Client Component kalau modul itu — bahkan transitif —
// mengimpor API server-only, walau simbol yang dipakai cuma konstanta).
export const ACTIVE_DATA_USAHA_COOKIE = "active_data_usaha_id";

// § diminta user 2026-10-02 — SETIAP login WAJIB mendarat di
// `/pilih-usaha` dulu, supaya user yang punya >1 Data Usaha tidak diam-
// diam dilempar ke Data Usaha yang belum terhubung Accurate (muncul
// gerbang popup connect tanpa konteks "ini Data Usaha apa, kenapa
// muncul"). Cookie ini (preferensi UI "Data Usaha aktif", § komentar di
// `active-data-usaha.ts`) hidup 1 TAHUN dan TIDAK ikut hilang saat
// logout biasa — tanpa dibersihkan eksplisit di titik LOGIN, user yang
// sebelumnya sudah pernah pilih Data Usaha X akan langsung dilempar ke
// sana lagi tiap login baru, melewati gerbang pilih-usaha SAMA SEKALI
// (gerbang di `app/(protected)/layout.tsx` cuma redirect kalau cookie
// ini KOSONG/tidak valid). Dipanggil dari `login-form.tsx` (email/
// password) DAN `google-signin-button.tsx` (OAuth, SEBELUM redirect ke
// Google — tidak ada titik "sesudah" di client karena callback OAuth
// mendarat langsung di `callbackURL` lewat full page load, bukan lewat
// kode React yang sama).
export function clearActiveDataUsahaCookie() {
  document.cookie = `${ACTIVE_DATA_USAHA_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
