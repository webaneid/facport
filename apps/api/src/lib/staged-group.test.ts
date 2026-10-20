import { describe, test, expect } from "bun:test";
import { selectRowsToMark, describeStagedFailure } from "./staged-group";
import { AccurateApiError } from "./accurate";
import { rowEntryIndexes, entryKeysForRows } from "./staged-send";

describe("selectRowsToMark", () => {
  // baris: A, A, B, C → entri 0,0,1,2
  const rows = ["r1", "r2", "r3", "r4"].map((id) => ({ id }));
  const { indexes } = rowEntryIndexes(entryKeysForRows(["A", "a", "B", "C"]));
  test("hanya baris dari entri yang sudah tersimpan; yang sudah ditandai tidak diulang", () => {
    expect(selectRowsToMark(indexes, rows, 0, new Set())).toEqual([]);
    expect(selectRowsToMark(indexes, rows, 1, new Set())).toEqual(["r1", "r2"]);
    expect(selectRowsToMark(indexes, rows, 2, new Set(["r1", "r2"]))).toEqual(["r3"]);
    expect(selectRowsToMark(indexes, rows, 3, new Set(["r1"]))).toEqual(["r2", "r3", "r4"]);
  });
});

describe("describeStagedFailure", () => {
  test("menyebut kemajuan & bahwa Retry melanjutkan", () => {
    const msg = describeStagedFailure({ state: "failed", reason: "exhausted", message: "Berhenti.", doneEntries: 1500, docId: 9 }, 4000);
    expect(msg).toContain("1500 dari 4000");
    expect(msg).toContain("Retry melanjutkan");
  });
  test("tanpa kemajuan → pesan apa adanya; galat bisnis memakai deskripsi Accurate", () => {
    expect(describeStagedFailure({ state: "failed", reason: "mismatch", message: "Beda.", doneEntries: 0, docId: null }, 10)).toBe("Beda.");
    const biz = describeStagedFailure({ state: "failed", reason: "business", message: "x", error: new AccurateApiError("Nilai tidak cukup", 200), doneEntries: 0, docId: 1 }, 10);
    expect(biz).toBe("Nilai tidak cukup");
  });
});
