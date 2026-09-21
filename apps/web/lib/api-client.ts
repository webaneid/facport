import { treaty } from "@elysia/eden";
import type { App } from "../../api/src/index"; // type-only import lintas app di monorepo
import { getProdApiOrigin } from "./get-prod-api-origin";
import { toast } from "sonner";
import { ACTIVE_DATA_USAHA_COOKIE } from "./active-data-usaha-cookie";

// § next.config.ts, lessons-learned.md 2026-08-19 — di BROWSER (dev), pakai
// path relatif `/api-proxy` (di-rewrite Next.js server ke apps/api) supaya
// request TIDAK PERNAH lintas-situs dari sudut pandang browser (cookie sesi
// cross-site ditolak diam-diam di navigasi top-level). Di SERVER (SSR, mis.
// landing/page.tsx) TIDAK ada masalah cross-site sama sekali (server-to-
// server) — pakai NEXT_PUBLIC_API_URL absolute seperti biasa. Production:
// rewrite di next.config.ts di-skip, browser tetap panggil NEXT_PUBLIC_API_URL
// langsung (aman, app.facport.com/api.facport.com satu situs asli).
const isBrowser = typeof window !== "undefined";
const isBrowserDev = isBrowser && process.env.NODE_ENV !== "production";
// § Fase 15 — exported: dipakai juga buat construct URL non-Eden (mis.
// `<a href>` unduh PDF invoice) yang butuh base URL SAMA PERSIS dengan
// yang dipakai Eden client, TANPA duplikasi logic proxy dev/prod di atas.
export const apiBaseUrl = isBrowserDev
  ? `${window.location.origin}/api-proxy` // absolute — Eden construct URL via `new URL()`, tolak path relatif polos juga
  : isBrowser
    ? getProdApiOrigin() // browser + production — lihat lib/get-prod-api-origin.ts
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"); // SSR — process.env dibaca live tiap request, aman

// § ketemu 2026-08-31 — Eden Treaty DEFAULT-nya `parseDate: true`: SEMUA
// string di response JSON yang "kelihatan seperti tanggal" (regex broad —
// cocok juga format DD/MM/YYYY, bukan cuma ISO) otomatis di-`JSON.parse`
// reviver jadi objek `Date`, di SELURUH response, bukan cuma field yang
// route-nya declare `t.Date()`. Row `rawData` (purchase-invoice import,
// { batchId }).rows import) berisi APA ADANYA hasil parse Excel/tanggal
// yang di-normalize dialog Edit ke "DD/MM/YYYY" — keduanya cocok regex
// ini, jadi diam-diam berubah jadi `Date` sebelum kode frontend (mis.
// `edit-row-dialog.tsx` `toDisplayDate()`, yang cuma cek
// `typeof === "string"/"number"`) sempat baca nilainya. Efeknya: field
// tanggal tampil sebagai `Date.toString()` penuh ("Wed Aug 19 2026
// 07:00:00 GMT+0700 (...)"), dan kalau ke-save balik APA ADANYA, format
// itu tidak dikenali `toAccurateDate()` di worker — baris gagal lagi
// terus walau user sudah "berhasil" simpan (toast sukses, PUT 200).
// Nonaktifkan GLOBAL — SATU-SATUNYA tempat kode ini butuh nilai tanggal
// SEBAGAI STRING APA ADANYA dari backend, konversi ke `Date` (kalau perlu
// tampil) dilakukan eksplisit di titik pakainya (`lib/utils.ts`
// `formatDate`, terima `string | Date`), bukan implisit di layer HTTP.
// § Fase 140, ADR-0035 — cookie Data Usaha aktif host-only di app.*, TIDAK
// terkirim ke api.*; server butuh header eksplisit supaya gerbang modul
// memilih subscription di Data Usaha yang benar (bukan yang terbaru).
// Browser saja (SSR tidak punya `document`; satu-satunya pemakai SSR,
// landing, tidak menyentuh endpoint import).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cookie non-httpOnly bisa rusak/diedit; nilai tak valid jangan sampai
// melempar error dan mematikan SEMUA request API di browser itu.
function readActiveDataUsahaId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_DATA_USAHA_COOKIE}=([^;]+)`));
    const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    return value && UUID_RE.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function activeDataUsahaHeaders(): Record<string, string> | undefined {
  const id = readActiveDataUsahaId();
  return id ? { "x-data-usaha-id": id } : undefined;
}

// § Fase 140 (temuan security review, multi-tab) — cookie dipakai bersama
// semua tab. Kalau Data Usaha diganti di tab B, tab A masih MENAMPILKAN
// Data Usaha lama tapi request berikutnya akan membawa yang baru → upload
// bisa mendarat di perusahaan yang tidak sedang tampil. Saat tab kembali
// aktif dan cookie berubah dari yang terakhir terlihat, muat ulang supaya
// tampilan (dirender server dari cookie) dan request kembali sinkron.
// Ganti Data Usaha di tab yang SAMA memanggil `markActiveDataUsahaSeen()`
// supaya tidak dianggap perubahan dari tab lain.
let lastSeenDataUsahaId = readActiveDataUsahaId();

export function markActiveDataUsahaSeen() {
  lastSeenDataUsahaId = readActiveDataUsahaId();
}

if (typeof window !== "undefined") {
  const reloadIfChangedElsewhere = () => {
    if (document.hidden) return;
    if (readActiveDataUsahaId() !== lastSeenDataUsahaId) {
      lastSeenDataUsahaId = readActiveDataUsahaId();
      window.location.reload();
    }
  };
  window.addEventListener("focus", reloadIfChangedElsewhere);
  document.addEventListener("visibilitychange", reloadIfChangedElsewhere);
}

export const api = treaty<App>(apiBaseUrl, {
  fetch: { credentials: "include" },
  parseDate: false,
  headers: () => activeDataUsahaHeaders(),
  // § Fase 140 — 17 halaman import punya pesan error sendiri-sendiri
  // ("Upload gagal, cek format file") yang MENYESATKAN untuk 2 kode gerbang
  // baru ini; ditangani di satu titik supaya customer tahu tindakannya.
  onResponse: async (res) => {
    if (typeof window === "undefined" || (res.status !== 409 && res.status !== 403)) return;
    const code = ((await res.clone().json().catch(() => null)) as { code?: string } | null)?.code;
    if (code === "DATA_USAHA_REQUIRED") {
      toast.error("Pilih Data Usaha dulu lewat menu \"Ganti Data Usaha\" sebelum melanjutkan — fitur ini aktif di lebih dari satu Data Usaha Anda.", { id: "data-usaha-gate" });
    } else if (code === "DATA_USAHA_FORBIDDEN") {
      toast.error("Anda tidak punya akses ke Data Usaha yang dipilih. Pilih ulang lewat \"Ganti Data Usaha\".", { id: "data-usaha-gate" });
    }
  },
});
