import { cookies } from "next/headers";
import { ACTIVE_DATA_USAHA_COOKIE } from "./active-data-usaha-cookie";

export { ACTIVE_DATA_USAHA_COOKIE };

// § Fase 109, architecture-user-tambahan.md § Fase B2 — preferensi UI
// murni (Data Usaha mana yang sedang "aktif" di dashboard), BUKAN batas
// keamanan. Semua endpoint mutating (checkout/trial/dst) tetap validasi
// ownership sendiri di server (`ownsDataUsaha`) lepas dari nilai cookie
// ini — cookie cuma nentuin apa yang DITAMPILKAN, bukan apa yang
// DIIZINKAN. Karena itu aman non-httpOnly (dibaca client component) dan
// tidak perlu divalidasi ulang di sini.
//
// § HANYA import file ini dari Server Component — pakai `next/headers`.
// Client Component yang cuma butuh NAMA cookie-nya (mis. untuk
// `document.cookie = ...`) WAJIB import dari `./active-data-usaha-cookie`
// langsung, JANGAN dari sini (lihat komentar di file itu).
export async function getActiveDataUsahaIdCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACTIVE_DATA_USAHA_COOKIE)?.value;
}
