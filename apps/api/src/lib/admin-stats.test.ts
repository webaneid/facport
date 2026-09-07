import { describe, test, expect } from "bun:test";
import { last12Months, monthKey, aggregateMonthlyGrowth, aggregateModulePopularity, computeGrowthPercent, computeEfficiency } from "./admin-stats";

// § Fase 59 — unit test MURNI (tanpa DB), data sintetis. Dashboard admin
// § `docs/architecture/architecture-admin-dashboard.md`.

describe("last12Months / monthKey", () => {
  test("12 bulan rolling, urut kronologis, bulan terakhir = bulan `now`", () => {
    const now = new Date(Date.UTC(2026, 8, 15)); // September 2026 (bulan index 8)
    const months = last12Months(now);
    expect(months).toHaveLength(12);
    expect(months[0]!.key).toBe("2025-10");
    expect(months[11]!.key).toBe("2026-09");
    // urut kronologis, tiap key naik 1 bulan dari sebelumnya
    for (let i = 1; i < months.length; i++) {
      const [prevY, prevM] = months[i - 1]!.key.split("-").map(Number);
      const [curY, curM] = months[i]!.key.split("-").map(Number);
      const prevIndex = prevY! * 12 + prevM!;
      const curIndex = curY! * 12 + curM!;
      expect(curIndex).toBe(prevIndex + 1);
    }
  });

  test("monthKey pad bulan 1 digit jadi 2 digit", () => {
    expect(monthKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
  });
});

describe("aggregateMonthlyGrowth", () => {
  test("newUserCount per bulan benar, cumulativeUserCount akumulasi dari baseline", () => {
    const now = new Date(Date.UTC(2026, 8, 15));
    const months = last12Months(now);
    const userCreatedAts = [
      new Date(Date.UTC(2026, 8, 1)), // September (bulan terakhir)
      new Date(Date.UTC(2026, 8, 10)),
      new Date(Date.UTC(2026, 7, 5)), // Agustus
    ];
    const result = aggregateMonthlyGrowth(months, 100, userCreatedAts, []);
    expect(result).toHaveLength(12);
    const sep = result.find((m) => m.month === "2026-09")!;
    const aug = result.find((m) => m.month === "2026-08")!;
    expect(sep.newUserCount).toBe(2);
    expect(aug.newUserCount).toBe(1);
    // cumulative = baseline(100) + SEMUA newUserCount s.d. bulan itu
    expect(aug.cumulativeUserCount).toBe(101); // 100 + 1 (Agustus)
    expect(sep.cumulativeUserCount).toBe(103); // 101 + 2 (September)
    // bulan tanpa user baru sama sekali tetap 0, BUKAN undefined
    const jan = result.find((m) => m.month === "2025-10")!;
    expect(jan.newUserCount).toBe(0);
    expect(jan.cumulativeUserCount).toBe(100);
  });

  test("newSubscribingUserCount hitung DISTINCT userId per bulan (1 user 2 subscription bulan sama = 1, bukan 2)", () => {
    const now = new Date(Date.UTC(2026, 8, 15));
    const months = last12Months(now);
    const subs = [
      { createdAt: new Date(Date.UTC(2026, 8, 2)), userId: "u1" },
      { createdAt: new Date(Date.UTC(2026, 8, 3)), userId: "u1" }, // user sama, modul beda, bulan sama
      { createdAt: new Date(Date.UTC(2026, 8, 4)), userId: "u2" },
    ];
    const result = aggregateMonthlyGrowth(months, 0, [], subs);
    const sep = result.find((m) => m.month === "2026-09")!;
    expect(sep.newSubscribingUserCount).toBe(2);
  });
});

describe("aggregateModulePopularity", () => {
  test("group by modules[0], sort DESC by count", () => {
    const rows = [
      { modules: ["sales_invoice"] },
      { modules: ["sales_invoice"] },
      { modules: ["purchase_invoice"] },
      { modules: ["sales_invoice"] },
      { modules: ["journal_voucher"] },
      { modules: ["purchase_invoice"] },
    ];
    const result = aggregateModulePopularity(rows);
    expect(result).toEqual([
      { moduleKey: "sales_invoice", count: 3 },
      { moduleKey: "purchase_invoice", count: 2 },
      { moduleKey: "journal_voucher", count: 1 },
    ]);
  });

  test("modul tanpa subscription aktif TIDAK muncul di hasil (bukan count 0)", () => {
    const result = aggregateModulePopularity([{ modules: ["sales_invoice"] }]);
    expect(result.find((r) => r.moduleKey === "vendor_payable_account")).toBeUndefined();
  });

  test("array kosong -> hasil array kosong", () => {
    expect(aggregateModulePopularity([])).toEqual([]);
  });
});

describe("computeGrowthPercent", () => {
  test("growth normal: naik dari 100 ke 150 = +50%", () => {
    expect(computeGrowthPercent(150, 100)).toBe(50);
  });
  test("turun dari 100 ke 50 = -50%", () => {
    expect(computeGrowthPercent(50, 100)).toBe(-50);
  });
  test("bulan lalu 0, bulan ini > 0 -> 100% (bukan Infinity)", () => {
    expect(computeGrowthPercent(10, 0)).toBe(100);
  });
  test("bulan lalu 0, bulan ini juga 0 -> 0% (bukan NaN)", () => {
    expect(computeGrowthPercent(0, 0)).toBe(0);
  });
});

describe("computeEfficiency", () => {
  test("batch 100 baris x 30 detik manual = 3000 detik manual, batch selesai 10 detik -> efisiensi tinggi", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const completedAt = new Date("2026-01-01T00:00:10Z"); // 10 detik aktual
    const result = computeEfficiency([{ createdAt, completedAt, totalRows: 100 }], 30);
    expect(result.manualSecondsTotal).toBe(3000);
    expect(result.actualSecondsTotal).toBe(10);
    // (3000-10)/3000*100 = 99.666...
    expect(result.efficiencyPercent).toBeCloseTo(99.67, 1);
  });

  test("clamp 0-100 — batch kecil dengan durasi aktual LEBIH LAMA dari estimasi manual (antrian job lama) tidak boleh negatif", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const completedAt = new Date("2026-01-01T01:00:00Z"); // 3600 detik aktual
    const result = computeEfficiency([{ createdAt, completedAt, totalRows: 1 }], 30); // manual cuma 30 detik
    expect(result.efficiencyPercent).toBe(0); // bukan negatif
  });

  test("array kosong -> 0 (bukan NaN dari pembagian 0/0)", () => {
    const result = computeEfficiency([], 30);
    expect(result.efficiencyPercent).toBe(0);
    expect(result.manualSecondsTotal).toBe(0);
    expect(result.actualSecondsTotal).toBe(0);
  });

  test("beberapa batch diagregasi (SUM), bukan rata-rata", () => {
    const result = computeEfficiency(
      [
        { createdAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T00:00:05Z"), totalRows: 10 },
        { createdAt: new Date("2026-01-02T00:00:00Z"), completedAt: new Date("2026-01-02T00:00:05Z"), totalRows: 20 },
      ],
      30,
    );
    expect(result.manualSecondsTotal).toBe(900); // (10+20)*30
    expect(result.actualSecondsTotal).toBe(10); // 5+5
  });
});
