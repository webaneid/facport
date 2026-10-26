import { describe, test, expect } from "bun:test";
import { describeUndeletedReason, groupUndeletedDocuments, numberColumnOf, documentNumberOf, type CancelResult } from "./import-cancel-result";

const result: CancelResult = {
  deleted: ["202"],
  blocked: ["201"],
  failed: ["200", "199"],
  failedReasons: { "200": 'Tidak dapat menghapus faktur "X-1". sudah ada pembayarannya' },
};

describe("describeUndeletedReason", () => {
  test("pesan Accurate dipakai apa adanya", () => {
    expect(describeUndeletedReason("200", result)).toBe('Accurate menolak menghapus: Tidak dapat menghapus faktur "X-1". sudah ada pembayarannya');
  });
  test("faktur diblokir (dipakai batch lain) dijelaskan terpisah", () => {
    expect(describeUndeletedReason("201", result)).toContain("dipakai batch import lain");
  });
  test("gagal tanpa alasan tercatat (batch/audit lama) → pesan umum, bukan kosong", () => {
    expect(describeUndeletedReason("199", result)).toContain("alasan tidak tercatat");
  });
  test("tanpa hasil pembatalan sama sekali → 'Belum terhapus.'", () => {
    expect(describeUndeletedReason("200", null)).toBe("Belum terhapus.");
  });
});

describe("groupUndeletedDocuments", () => {
  const row = (status: string, id: string | null, no: string) => ({ status, accurateTransactionId: id, rawData: { No: no } });
  test("hanya baris success berid Accurate; 1 dokumen banyak baris digabung; yang cancelled/failed diabaikan", () => {
    const docs = groupUndeletedDocuments(
      [row("success", "200", "X-1"), row("success", "200", "X-1"), row("cancelled", "202", "X-3"), row("failed", null, "X-4"), row("success", "201", "X-2")],
      result,
      (r) => String(r.rawData.No),
    );
    expect(docs.map((d) => [d.id, d.number, d.rowCount])).toEqual([["200", "X-1", 2], ["201", "X-2", 1]]);
    expect(docs[0]!.reason).toContain("sudah ada pembayarannya");
    expect(docs[1]!.reason).toContain("dipakai batch import lain");
  });
});

describe("numberColumnOf / documentNumberOf", () => {
  test("kolom yang dipetakan ke field `number`", () => {
    expect(numberColumnOf({ "Purchase Payment No": "number", Date: "transDate" })).toBe("Purchase Payment No");
    expect(numberColumnOf({ Date: "transDate" })).toBeNull();
    expect(numberColumnOf(null)).toBeNull();
  });
  test("nilai dibaca & di-trim; kosong/ tak ada kolom → string kosong", () => {
    expect(documentNumberOf({ rawData: { No: "  PP-1 " } }, "No")).toBe("PP-1");
    expect(documentNumberOf({ rawData: {} }, "No")).toBe("");
    expect(documentNumberOf({ rawData: { No: "x" } }, null)).toBe("");
  });
});
