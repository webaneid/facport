import { describe, test, expect } from "bun:test";
import { computeStagedPlan, formatEstimate } from "./staged-plan";
import { parseStagedConfig } from "./staged-send";
import type { ImportRowRecord } from "./import-mapping/sales-receipt.mapping";

const cm = { "No. Sales Receipt": "receiptNumber", "No Pelanggan": "customerNo", "Akun Bank/Kas": "bankNo", Tanggal: "transDate", "No Faktur": "invoiceNo", "Jumlah Bayar": "chequeAmount" };
const rows = (receipt: string, n: number, start = 0): ImportRowRecord[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${receipt}-${i}`, rawData: { "No. Sales Receipt": receipt, "No Faktur": `F-${start + i}`, "Jumlah Bayar": 10 } }));
const cfg = (src: Record<string, string> = {}) => parseStagedConfig({ IMPORT_STAGED_MODULES: "sales_receipt", IMPORT_STAGED_THRESHOLD_ROWS: "200", IMPORT_STAGED_CHUNK_ROWS: "500", ...src });

describe("computeStagedPlan", () => {
  test("hanya dokumen bernomor yang melebihi ambang; dokumen kecil & tanpa nomor tidak", () => {
    const all = [...rows("BIG", 1200), ...rows("SMALL", 50), ...rows("EDGE", 200), { id: "x", rawData: { "No Faktur": "Z", "Jumlah Bayar": 1 } }];
    const plan = computeStagedPlan("sales_receipt", all, cm, cfg());
    expect(plan.items.map((i) => i.number)).toEqual(["BIG"]);
    expect(plan.items[0]).toMatchObject({ rows: 1200, entries: 1200, steps: 3 });
    expect(plan.estimatedSeconds).toBe(plan.items[0]!.estimatedSeconds);
  });
  test("faktur sama di banyak baris = 1 entri (entri < baris)", () => {
    const dup = Array.from({ length: 300 }, (_, i) => ({ id: `d${i}`, rawData: { "No. Sales Receipt": "D", "No Faktur": `F-${i % 100}`, "Jumlah Bayar": 10 } }));
    const plan = computeStagedPlan("sales_receipt", dup, cm, cfg());
    expect(plan.items[0]).toMatchObject({ rows: 300, entries: 100, steps: 1 });
  });
  test("dokumen besar ber-PPh (Tax ID terisi) TIDAK dicicil: tercatat di skippedForTax, bukan di items", () => {
    const withTax = Array.from({ length: 300 }, (_, i) => ({ id: `t${i}`, rawData: { "No. Sales Receipt": "TAX", "No Faktur": `F-${i}`, "Jumlah Bayar": 10, "Tax ID": i === 7 ? "PPh 23" : "" } }));
    const plan = computeStagedPlan("sales_receipt", [...withTax, ...rows("BIG", 250)], { ...cm, "Tax ID": "taxId" }, cfg());
    expect(plan.items.map((i) => i.number)).toEqual(["BIG"]);
    expect(plan.skippedForTax).toEqual(["TAX"]);
  });
  test("perkiraan waktu melampaui batas → TIDAK dicicil (skippedTooLarge), supaya tak menahan slot worker berhari-hari", () => {
    const plan = computeStagedPlan("sales_receipt", rows("HUGE", 600), cm, cfg({ IMPORT_STAGED_MAX_ESTIMATE_SECONDS: "60" }));
    expect(plan.items).toEqual([]);
    expect(plan.skippedTooLarge.map((d) => [d.number, d.rows])).toEqual([["HUGE", 600]]);
    expect(computeStagedPlan("sales_receipt", rows("HUGE", 600), cm, cfg()).items.length).toBe(1);
  });
  test("modul tidak bersaklar atau tidak didukung → rencana kosong", () => {
    expect(computeStagedPlan("sales_receipt", rows("BIG", 900), cm, cfg({ IMPORT_STAGED_MODULES: "" })).items).toEqual([]);
    expect(computeStagedPlan("sales_invoice", rows("BIG", 900), cm, cfg({ IMPORT_STAGED_MODULES: "sales_invoice" })).items).toEqual([]);
  });
  test("ambang bisa diubah lewat env", () => {
    expect(computeStagedPlan("sales_receipt", rows("M", 150), cm, cfg({ IMPORT_STAGED_THRESHOLD_ROWS: "100" })).items.length).toBe(1);
  });
});

describe("formatEstimate", () => {
  test("detik / menit / jam", () => {
    expect(formatEstimate(30)).toBe("sekitar 30 detik");
    expect(formatEstimate(600)).toBe("sekitar 10 menit");
    expect(formatEstimate(3 * 3600)).toBe("sekitar 3,0 jam");
    expect(formatEstimate(20 * 3600)).toBe("sekitar 20 jam");
  });
});
