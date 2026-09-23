// § Fase 150-151, ADR-0038, architecture-konverter.md — port VERBATIM dari app legacy
// `/Users/webane/sites/konverter/tool.html` (baris 457-491, fungsi `escapeXml`/`str`/`flag1`/`num`/`normDate`/
// `reserved`/`envelope`/`checkHeaders`). WAJIB IDENTIK secara logika+regex dengan sumbernya — HANYA bahasa program
// yang berubah (JS lepas → TypeScript modul), mesin/aturan bisnisnya TIDAK — lihat instruksi user Fase 151+ soal
// verifikasi kesetaraan Excel/XML. JANGAN "rapikan"/"perbaiki" logic di sini tanpa mengubah juga sumber pembandingnya.

/** Escape 5 karakter XML terlarang — urutan replace SENGAJA `&` duluan (kalau tidak, `&amp;` hasil escape
 * karakter lain akan di-escape ulang jadi `&amp;amp;`). */
export function escapeXml(v: unknown): string {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Trim string, `null`/`undefined` → "". */
export function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Parse boolean gaya Indonesia (1/ya/iya/y/yes/true/benar → 1, selain itu → 0). */
export function flag1(v: unknown): 0 | 1 {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "1" || s === "ya" || s === "iya" || s === "y" || s === "yes" || s === "true" || s === "benar" ? 1 : 0;
}

/** Parse angka gaya Indonesia (koma desimal, titik ribuan) — lihat komentar inline sumber legacy soal disambiguasi
 * "." vs "," (keduanya ada = titik ribuan+koma desimal; koma saja = desimal ID kecuali >1 koma = ribuan gaya
 * Inggris; titik saja pola 3-digit berulang = ribuan). */
export function num(v: unknown): number {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "");
  if (s.indexOf(".") > -1 && s.indexOf(",") > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.indexOf(",") > -1 && s.indexOf(".") === -1) {
    // koma saja: satu koma = desimal (konvensi ID); >1 koma = pemisah ribuan gaya Inggris
    s = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // titik saja pola ribuan: "2.500", "3.500.000"
  }
  return parseFloat(s);
}

/** Normalisasi tanggal (Date object dari SheetJS/serial Excel/ISO/DD-MM-YYYY) → "YYYY-MM-DD", atau `null` kalau
 * tidak bisa diparse. */
export function normDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // +30 mnt: koreksi drift zona waktu SheetJS (sel tanggal bisa terbaca 23:5x hari sebelumnya)
    const d = new Date(v.getTime() + 1800000);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + "-" + m[2]!.padStart(2, "0") + "-" + m[3]!.padStart(2, "0");
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return m[3] + "-" + m[2]!.padStart(2, "0") + "-" + m[1]!.padStart(2, "0");
  return null;
}

/** 10x placeholder `<ITEMRESERVEDn/>` — field wajib skema XML Accurate Desktop walau selalu kosong. */
export function reserved(): string {
  let s = "";
  for (let i = 1; i <= 10; i++) s += "<ITEMRESERVED" + i + "/>";
  return s;
}

/** Bungkus XML transaksi ke dalam envelope `NMEXML` standar Accurate Desktop. */
export function envelope(branch: string, inner: string): string {
  return (
    '<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="' +
    escapeXml(branch) +
    '" ACCOUNTANTCOPYID="">' +
    '<TRANSACTIONS OnError="CONTINUE">' +
    inner +
    "</TRANSACTIONS></NMEXML>\r\n"
  );
}

/** Cek kolom header WAJIB ada di baris Excel (bandingkan ke `Object.keys(rows[0])` — SAMA PERSIS logic legacy,
 * termasuk keterbatasannya: kalau `rows` kosong, tidak ada yang bisa dicek, balikin `[]` BUKAN error "kolom
 * hilang" — baris kosong ditangani terpisah oleh pemanggil, § tiap type `process()`). */
export function checkHeaders(rows: Record<string, unknown>[], need: string[]): string[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]!);
  const missing = need.filter((h) => !keys.includes(h));
  return missing.length ? ["Kolom wajib hilang: " + missing.join(", ") + ". Pakai template yang disediakan."] : [];
}
