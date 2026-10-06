import { describe, test, expect } from "bun:test";
import { splitIdList } from "./split-id-list";

describe("splitIdList", () => {
  test("koma (dengan/ tanpa spasi) memecah jadi banyak ID, spasi dibuang — contoh Excel client", () => {
    expect(splitIdList("42620120010, K-01")).toEqual(["42620120010", "K-01"]);
    expect(splitIdList("SLS-01,SLS-02 ,  SLS-03")).toEqual(["SLS-01", "SLS-02", "SLS-03"]);
  });
  test("titik-koma & baris baru juga diterima; entri kosong dibuang; satu ID tetap satu elemen; angka murni jadi string", () => {
    expect(splitIdList("A;B\nC")).toEqual(["A", "B", "C"]);
    expect(splitIdList(" , ; ")).toEqual([]);
    expect(splitIdList("SM-001")).toEqual(["SM-001"]);
    expect(splitIdList(101)).toEqual(["101"]);
  });
});
