// § BUG ditemukan 2026-09-06 (audit timezone menyeluruh, diminta user:
// "berlangganan tidak benar terhitung-nya hanya karena timezone") —
// admin pilih tanggal expired subscription lewat `<input type="date">`
// (mis. "2026-12-31"), lalu kode LAMA langsung `new Date("2026-12-31").
// toISOString()` — JS mem-parse string tanggal-saja ISO 8601 sebagai
// UTC MIDNIGHT ("2026-12-31T00:00:00.000Z"), BUKAN akhir hari di
// timezone perusahaan. Akibatnya subscription "s/d 31 Desember" itu
// SEBENARNYA expired mulai jam 07:00 WIB tanggal 31 Desember (bukan
// akhir hari seperti yang admin maksud) — potong ~17 jam masa aktif
// TERAKHIR yang admin kira masih berlaku. Utility ini konversi tanggal
// kalender (dari date-picker, SELALU merepresentasikan "hari ini
// menurut timezone perusahaan", BUKAN UTC) ke instant UTC yang benar.

// § default fallback SATU-SATUNYA sumber kebenaran nilai ini di apps/web
// (dipakai `formatDate` dan `CompanyTimezoneProvider` kalau setting belum
// termuat/gagal fetch) — HARUS sama dengan default backend
// (`apps/api/src/lib/company-timezone.ts` `DEFAULT_COMPANY_TIMEZONE`,
// tidak bisa di-share langsung lintas app terpisah deploy).
export const DEFAULT_COMPANY_TIMEZONE = "Asia/Jakarta";

// § algoritma umum (bukan cuma Asia/Jakarta) — DST-safe untuk SEMUA IANA
// timezone lewat 1 iterasi (cukup karena kita cuma butuh offset PADA
// instant tebakan, bukan across-DST-transition; Indonesia sendiri tidak
// punya DST sama sekali).
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

// § konversi "jam dinding" (wall-clock) di timezone tertentu → instant UTC
// yang BENAR merepresentasikan jam itu di timezone tersebut.
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number, timeZone: string): Date {
  // § offset dihitung dari instant TANPA milidetik (ms=0) — `Intl.DateTimeFormat`
  // membulatkan pecahan detik ke atas (mis. ".999" jadi detik berikutnya),
  // yang kalau dipakai LANGSUNG buat hitung offset bikin hasil akhir
  // meleset ~1 detik (ketemu lewat test round-trip "23:59:59.999").
  // Offset timezone tidak berubah dalam rentang 1 detik, jadi aman
  // dihitung dari versi tanpa-ms lalu diterapkan ke instant BER-ms.
  const guessWithoutMs = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const offset = getTimeZoneOffsetMs(guessWithoutMs, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - offset);
}

function parseDateOnly(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Format tanggal tidak valid, harus "YYYY-MM-DD": "${dateStr}"`);
  }
  return { y, m, d };
}

// § dipakai untuk konversi tanggal dari `<input type="date">` (format
// "YYYY-MM-DD") ke instant UTC yang merepresentasikan AKHIR hari itu
// (23:59:59.999) di timezone perusahaan — dipakai saat admin input
// "berlaku sampai tanggal X", supaya subscription/trial TETAP aktif
// SEPANJANG hari X di timezone perusahaan, bukan berhenti di tengah hari.
export function endOfDayInTimezone(dateStr: string, timeZone: string): Date {
  const { y, m, d } = parseDateOnly(dateStr);
  return zonedTimeToUtc(y, m, d, 23, 59, 59, 999, timeZone);
}

// § dipakai untuk tanggal yang SEKADAR catatan/informasi (bukan batas
// aktif/expired, mis. "Tanggal Transfer" bukti bayar manual, § components/
// billing/order-pay-flow.tsx) — TENGAH HARI (12:00) di timezone
// perusahaan, supaya instant-nya TIDAK PERNAH bergeser ke tanggal kalender
// sebelum/sesudahnya walau ditampilkan ulang di timezone lain (aman untuk
// offset dari -11 sampai +14, jauh melebihi rentang timezone nyata mana
// pun) — beda dari `endOfDayInTimezone` yang sengaja di batas akhir hari
// (butuh presisi kapan sesuatu MULAI tidak berlaku lagi).
export function middayInTimezone(dateStr: string, timeZone: string): Date {
  const { y, m, d } = parseDateOnly(dateStr);
  return zonedTimeToUtc(y, m, d, 12, 0, 0, 0, timeZone);
}
