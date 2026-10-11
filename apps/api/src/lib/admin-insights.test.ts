import { describe, test, expect } from "bun:test";
import {
  monthKey,
  parseMonthKey,
  monthOf,
  monthBounds,
  isActiveInMonth,
  activeOwnersInMonth,
  firstStartByOwner,
  buildTrend,
  tenureBreakdown,
  csvCell,
  toCsv,
  resolveDateRange,
  MAX_RANGE_DAYS,
  type CountedSubscription,
} from "./admin-insights";

// § Fase 189C — rumus MURNI (tanpa DB) untuk Insight: bulan menurut zona waktu perusahaan, aktif-di-bulan, tren (bulan sebelumnya, lompat tahun), usia langganan, CSV aman.
const TZ = "Asia/Jakarta"; // UTC+7
const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
const sub = (ownerId: string, start: Date, end: Date | null): CountedSubscription => ({ ownerId, startAt: start, endAt: end });

describe("bulan", () => {
  test("monthKey / parseMonthKey bolak-balik; format salah → null", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(parseMonthKey("2026-10")).toEqual({ year: 2026, month: 10 });
    for (const bad of ["2026-13", "2026-00", "26-10", "2026/10", "", "abcd-ef", "0050-01", "1999-12", "2101-01"]) expect(parseMonthKey(bad)).toBeNull(); // tahun di luar 2000–2100 ditolak (Date.UTC memetakan 0–99 ke 1900-an)
  });

  test("monthOf memakai zona waktu perusahaan: 31 Okt 18:00 UTC = 1 Nov 01:00 WIB → November", () => {
    expect(monthOf(new Date("2026-10-31T18:00:00.000Z"), TZ)).toEqual({ year: 2026, month: 11 });
    expect(monthOf(new Date("2026-10-31T16:59:59.999Z"), TZ)).toEqual({ year: 2026, month: 10 });
    expect(monthOf(new Date("2026-12-31T20:00:00.000Z"), TZ)).toEqual({ year: 2027, month: 1 });
  });

  test("monthBounds: awal inklusif, akhir eksklusif (= awal bulan berikutnya), dalam zona perusahaan; Desember melompat tahun", () => {
    const oct = monthBounds({ year: 2026, month: 10 }, TZ);
    expect(oct.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(oct.end.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    const dec = monthBounds({ year: 2026, month: 12 }, TZ);
    expect(dec.end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(monthBounds({ year: 2027, month: 1 }, TZ).start.toISOString()).toBe(dec.end.toISOString());
  });
});

describe("isActiveInMonth (tanpa jeda toleransi)", () => {
  const oct = monthBounds({ year: 2026, month: 10 }, TZ);
  test("menyentuh bulan = aktif; berakhir TEPAT di awal bulan = tidak; mulai TEPAT di akhir bulan = tidak", () => {
    expect(isActiveInMonth(sub("a", wib(2026, 9, 10), wib(2026, 10, 10)), oct)).toBe(true);
    expect(isActiveInMonth(sub("a", wib(2026, 9, 1), wib(2026, 10, 1, 0, 0)), oct)).toBe(false); // end == awal Oktober
    expect(isActiveInMonth(sub("a", wib(2026, 11, 1, 0, 0), wib(2026, 12, 1)), oct)).toBe(false); // start == awal November
    expect(isActiveInMonth(sub("a", wib(2026, 10, 31, 23, 59), wib(2026, 11, 30)), oct)).toBe(true);
  });
  test("bulan terakhir aktif dihitung (berakhir 2 Okt → Oktober tetap aktif); endAt kosong = berjalan terus", () => {
    expect(isActiveInMonth(sub("a", wib(2026, 9, 2), wib(2026, 10, 2)), oct)).toBe(true);
    expect(isActiveInMonth(sub("a", wib(2026, 1, 1), null), oct)).toBe(true);
    expect(isActiveInMonth(sub("a", wib(2026, 11, 5), null), oct)).toBe(false);
  });
  test("zona waktu: langganan mulai 31 Okt 18:00 UTC (= 1 Nov WIB) BUKAN aktif di Oktober", () => {
    expect(isActiveInMonth(sub("a", new Date("2026-10-31T18:00:00.000Z"), null), oct)).toBe(false);
  });
});

describe("activeOwnersInMonth & firstStartByOwner", () => {
  test("pemilik dengan banyak langganan dihitung SEKALI; yang tak menyentuh bulan dikecualikan", () => {
    const oct = monthBounds({ year: 2026, month: 10 }, TZ);
    const subs = [sub("a", wib(2026, 9, 1), wib(2026, 11, 1)), sub("a", wib(2026, 10, 5), wib(2026, 12, 5)), sub("b", wib(2026, 8, 1), wib(2026, 9, 1)), sub("c", wib(2026, 10, 20), null)];
    expect([...activeOwnersInMonth(subs, oct)].sort()).toEqual(["a", "c"]);
  });
  test("awal pertama = langganan TERAWAL per pemilik, apa pun urutan input", () => {
    const first = firstStartByOwner([sub("a", wib(2026, 5, 1), null), sub("a", wib(2026, 2, 1), null), sub("b", wib(2026, 3, 3), null)]);
    expect(first.get("a")!.toISOString()).toBe(wib(2026, 2, 1).toISOString());
    expect(first.get("b")!.toISOString()).toBe(wib(2026, 3, 3).toISOString());
  });
});

describe("buildTrend", () => {
  const now = { year: 2026, month: 10 };
  test("12 titik; bulan lalu/selisih/% terhadap bulan sebelumnya; Januari memakai Desember tahun sebelumnya; bulan depan ditandai future", () => {
    const values: Record<string, number> = { "2025-12": 10, "2026-01": 15, "2026-02": 15, "2026-03": 12, "2026-10": 30 };
    const points = buildTrend(2026, (ref) => values[monthKey(ref)] ?? 0, now);
    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ month: "2026-01", value: 15, previous: 10, delta: 5, percent: 50, future: false });
    expect(points[1]).toMatchObject({ value: 15, previous: 15, delta: 0, percent: 0 });
    expect(points[2]).toMatchObject({ value: 12, previous: 15, delta: -3, percent: -20 });
    expect(points[9]).toMatchObject({ month: "2026-10", value: 30, future: false });
    for (const p of points.slice(10)) expect(p).toMatchObject({ value: null, previous: null, delta: null, percent: null, future: true });
  });
  test("bulan sebelumnya 0: persen 100 bila naik, 0 bila tetap 0 (tanpa Infinity/NaN)", () => {
    const points = buildTrend(2026, (ref) => (ref.month === 2 ? 4 : 0), { year: 2026, month: 12 });
    expect(points[1]).toMatchObject({ value: 4, previous: 0, delta: 4, percent: 100 });
    expect(points[0]).toMatchObject({ value: 0, previous: 0, delta: 0, percent: 0 });
    expect(points[2]).toMatchObject({ value: 0, previous: 4, delta: -4, percent: -100 });
  });
  test("tahun lampau: semua bulan terisi; tahun depan: semua future", () => {
    expect(buildTrend(2025, () => 1, now).every((p) => !p.future)).toBe(true);
    expect(buildTrend(2027, () => 1, now).every((p) => p.future && p.value === null)).toBe(true);
  });
});

describe("tenureBreakdown (Baru / Lanjutan tahun ke-1 / Tahun ke-2.. / Berhenti / Kembali)", () => {
  // Oktober 2027: a baru (mulai Okt 2027), b mulai Mar 2027 (lanjutan tahun ke-1), c mulai Mar 2026 (tahun ke-2, 19 bulan), d mulai Okt 2025 (tahun ke-3: 24 bulan),
  // e aktif September saja (berhenti), f punya jeda lalu kembali (awal pertama 2026-01, aktif Agustus lalu tidak aktif September, aktif lagi Oktober).
  const oct27 = { year: 2027, month: 10 };
  const subs = [
    sub("a", wib(2027, 10, 3), wib(2027, 11, 3)),
    sub("b", wib(2027, 3, 1), wib(2027, 11, 1)),
    sub("c", wib(2026, 3, 1), wib(2027, 12, 1)),
    sub("d", wib(2025, 10, 2), wib(2027, 12, 1)),
    sub("e", wib(2027, 1, 1), wib(2027, 10, 1)),
    sub("f", wib(2026, 1, 1), wib(2027, 8, 31)),
    sub("f", wib(2027, 10, 5), wib(2027, 11, 5)),
  ];
  test("pembagian kolom, jumlah aktif, berhenti, kembali", () => {
    const t = tenureBreakdown(subs, oct27, TZ);
    expect(t.baru).toBe(1); // a
    expect(t.lanjutanTahun1).toBe(1); // b (7 bulan)
    expect(t.byYear[2]).toBe(2); // c (19 bulan) dan f (21 bulan sejak awal pertama Jan 2026) → tahun ke-2
    expect(t.byYear[3]).toBe(1); // d (24 bulan → tahun ke-3)
    expect(t.aktif).toBe(5); // a b c d f
    expect(t.berhenti).toBe(1); // e aktif September tetapi tidak Oktober
    expect(t.kembali).toBe(1); // f: aktif lagi setelah jeda (irisan, BUKAN kolom tambahan)
    // kolom usia memartisi pelanggan aktif tepat satu kali
    expect(t.baru + t.lanjutanTahun1 + Object.values(t.byYear).reduce((sum, n) => sum + n, 0)).toBe(t.aktif);
  });
  test("bulan tanpa data → semua nol, tanpa melempar", () => {
    const t = tenureBreakdown([], oct27, TZ);
    expect(t).toMatchObject({ baru: 0, lanjutanTahun1: 0, byYear: {}, aktif: 0, berhenti: 0, kembali: 0 });
  });
});

describe("CSV aman", () => {
  test("csvCell: kutip bila ada koma/kutip/baris baru; kutip ganda digandakan; null/undefined kosong", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dia "bos"')).toBe('"dia ""bos"""');
    expect(csvCell("baris1\nbaris2")).toBe('"baris1\nbaris2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
    expect(csvCell("biasa")).toBe("biasa");
  });
  test("injeksi rumus: sel berawalan = + - @ tab CR dinetralkan dengan apostrof di depan (angka negatif asli tetap angka)", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+62812")).toBe("'+62812");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell(-5)).toBe("-5"); // tipe number: bukan teks pengguna
  });
  test("toCsv: BOM UTF-8 (Excel), header + baris, CRLF", () => {
    const csv = toCsv(["Nama", "Email"], [["Budi", "b@x.id"], ["Sari, S.", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Nama,Email\r\nBudi,b@x.id\r\n"Sari, S.",\r\n');
  });
});

describe("resolveDateRange (YYYY-MM-DD dalam zona perusahaan; sampai-dengan inklusif)", () => {
  test("rentang sah: awal hari `from` s.d. AWAL hari setelah `to` (eksklusif); sehari penuh = 24 jam", () => {
    const r = resolveDateRange("2026-10-01", "2026-10-31", TZ);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
      expect(r.endExclusive.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    }
    const oneDay = resolveDateRange("2026-10-05", "2026-10-05", TZ);
    expect(oneDay.ok && oneDay.endExclusive.getTime() - oneDay.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
  test("akhir tahun/bulan melompat benar (31 Des → 1 Jan)", () => {
    const r = resolveDateRange("2026-12-31", "2026-12-31", TZ);
    expect(r.ok && r.endExclusive.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
  test("galat: format salah / tanggal mustahil → INVALID_DATE; from > to → RANGE_ORDER; > 24 bulan → RANGE_TOO_LONG", () => {
    for (const [from, to] of [["2026-1-1", "2026-10-01"], ["2026-02-30", "2026-03-01"], ["abc", "2026-10-01"], ["2026-10-01", "2026-13-01"], ["", ""]]) {
      expect(resolveDateRange(from!, to!, TZ)).toEqual({ ok: false, code: "INVALID_DATE" });
    }
    expect(resolveDateRange("2026-10-02", "2026-10-01", TZ)).toEqual({ ok: false, code: "RANGE_ORDER" });
    expect(resolveDateRange("2024-01-01", "2026-01-01", TZ)).toEqual({ ok: false, code: "RANGE_TOO_LONG" });
    expect(MAX_RANGE_DAYS).toBe(731);
    expect(resolveDateRange("2024-10-01", "2026-09-30", TZ).ok).toBe(true); // tepat di batas
  });
});
