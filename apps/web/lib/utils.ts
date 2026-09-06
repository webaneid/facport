import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// § ADR-0004 "Timezone" — DB selalu UTC, convert cuma saat tampil.
// § BUG ditemukan 2026-09-06 (audit timezone menyeluruh) — versi lama
// HARDCODE `timeZone: "Asia/Jakarta"` literal, TIDAK PERNAH baca setting
// `company.timezone` yang admin bisa ubah — setting itu jadi decorative,
// tidak berefek ke tampilan manapun. Sekarang WAJIB dipanggil dengan
// timezone eksplisit (dari `useCompanyTimezone()`, § company-timezone-
// provider.tsx) — parameter TIDAK dikasih default diam-diam supaya
// caller SADAR harus pass timezone yang benar, bukan lupa lalu jatuh ke
// fallback tanpa sadar.
export function formatDate(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

// § ADR-0023 — sebelumnya di-copy verbatim di 8 file berbeda, sekarang
// 1 sumber. Migrasi pemakai lama (Fase 21): hapus `const currencyFormatter
// = new Intl.NumberFormat(...)` lokal, import dari sini.
export const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// § diminta user 2026-09-06 — format "estimasi efisiensi waktu kerja" di
// dashboard customer (`GET /me/stats` § apps/api/src/routes/me.route.ts,
// total detik SUDAH dihitung server-side). Cascade Jam→Menit→Detik,
// unit yang bernilai 0 disembunyikan KECUALI semuanya 0 (tampilkan "0
// Detik", bukan string kosong).
export function formatWorkTimeSaved(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} Jam`);
  if (minutes > 0) parts.push(`${minutes} Menit`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} Detik`);
  return parts.join(" ");
}
