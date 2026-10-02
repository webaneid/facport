import { describe, test, expect } from "bun:test";
import { checkUnitsAgainstItems, unitTargetKey, type ItemUnitsFetcher } from "./autoproduksi-unit-check";
import { matchItemUnit } from "./accurate-item-units";

const gula = [
  { name: "KG", ratio: 1 },
  { name: "Pouch", ratio: 10 },
];

describe("matchItemUnit", () => {
  test("cocok tanpa peduli huruf besar/kecil & spasi → ejaan kanonik dari Accurate", () => {
    expect(matchItemUnit(gula, " pouch ")).toEqual({ status: "ok", canonical: "Pouch" });
    expect(matchItemUnit(gula, "KG")).toEqual({ status: "ok", canonical: "KG" });
  });
  test("tidak ada di master → invalid + daftar satuan tersedia", () => {
    expect(matchItemUnit(gula, "pcs")).toEqual({ status: "invalid", available: ["KG", "Pouch"] });
  });
});

describe("checkUnitsAgainstItems", () => {
  const fetcherOf = (map: Record<string, { units: typeof gula; complete: boolean } | null | Error>): ItemUnitsFetcher => async (no) => {
    const v = map[no];
    if (v instanceof Error) throw v;
    return v ?? null;
  };

  test("satuan tidak ada di master & daftar lengkap → ditolak, menyebut barang/satuan/pilihan", async () => {
    const res = await checkUnitsAgainstItems([{ itemNo: "100028", unitName: "pcs" }], fetcherOf({ "100028": { units: gula, complete: true } }));
    expect(res).toEqual({ ok: false, itemNo: "100028", unitName: "pcs", available: ["KG", "Pouch"] });
  });

  test("ejaan beda huruf besar/kecil diperbaiki otomatis ke ejaan master (bukan ditolak)", async () => {
    const t = { itemNo: "100028", unitName: "kg" };
    const res = await checkUnitsAgainstItems([t], fetcherOf({ "100028": { units: gula, complete: true } }));
    expect(res).toEqual({ ok: true, canonical: { [unitTargetKey(t)]: "KG" } });
  });

  test("daftar TIDAK lengkap (field satuan tambahan tidak dikenali) → tidak pernah menolak (fail-open)", async () => {
    const res = await checkUnitsAgainstItems([{ itemNo: "100028", unitName: "Pouch" }], fetcherOf({ "100028": { units: [{ name: "KG", ratio: 1 }], complete: false } }));
    expect(res).toEqual({ ok: true, canonical: {} });
  });

  test("barang tidak ketemu / fetcher error / tanpa satuan → lolos (fail-open), pemeriksaan lanjut ke barang berikutnya", async () => {
    const res = await checkUnitsAgainstItems(
      [
        { itemNo: "X1", unitName: "pcs" },
        { itemNo: "X2", unitName: "pcs" },
        { itemNo: "X3", unitName: "pcs" },
        { itemNo: "100028", unitName: "pcs" },
      ],
      fetcherOf({ X1: null, X2: new Error("timeout"), X3: { units: [], complete: true }, "100028": { units: gula, complete: true } }),
    );
    expect(res).toMatchObject({ ok: false, itemNo: "100028" });
  });

  test("satu barang dipakai dua kali hanya diambil sekali dari Accurate", async () => {
    let calls = 0;
    const fetcher: ItemUnitsFetcher = async () => {
      calls++;
      return { units: gula, complete: true };
    };
    await checkUnitsAgainstItems([{ itemNo: "100028", unitName: "KG" }, { itemNo: "100028", unitName: "Pouch" }], fetcher);
    expect(calls).toBe(1);
  });
});
