// § Fase 109 — konstanta MURNI, TANPA import `next/headers` (server-only).
// Dipisah dari `active-data-usaha.ts` supaya Client Component
// (`components/data-usaha/pilih-usaha-form.tsx`) bisa import NAMA cookie
// ini tanpa ikut menyeret `next/headers` (Next.js menolak modul apa pun
// yang di-import Client Component kalau modul itu — bahkan transitif —
// mengimpor API server-only, walau simbol yang dipakai cuma konstanta).
export const ACTIVE_DATA_USAHA_COOKIE = "active_data_usaha_id";
