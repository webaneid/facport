import { describe, expect, test } from "bun:test";
import { itemComboboxOptions } from "./accurate-combobox-options";

describe("itemComboboxOptions", () => {
  test("belum ada nilai & belum ada hasil pencarian -> kosong", () => {
    expect(itemComboboxOptions("", undefined, [])).toEqual([]);
  });

  test("belum ada pencarian, tapi sudah punya nilai tersimpan (mis. buka Edit) -> tetap tampil dengan nama", () => {
    const options = itemComboboxOptions("100011", "Bolu Kukus SP", []);
    expect(options).toEqual([{ value: "100011", label: "100011 — Bolu Kukus SP" }]);
  });

  test("nilai tersimpan TANPA nama (Formula lama sebelum Fase 163) -> label cuma kode", () => {
    const options = itemComboboxOptions("100011", undefined, []);
    expect(options).toEqual([{ value: "100011", label: "100011" }]);
  });

  test("ada hasil pencarian baru, nilai lama TIDAK ada di hasil -> keduanya tampil, nilai lama tetap di depan", () => {
    const options = itemComboboxOptions("100011", "Bolu Kukus SP", [{ no: "100012", name: "Telur" }]);
    expect(options).toEqual([
      { value: "100011", label: "100011 — Bolu Kukus SP" },
      { value: "100012", label: "100012 — Telur" },
    ]);
  });

  test("hasil pencarian MENGANDUNG nilai saat ini -> tidak duplikat", () => {
    const options = itemComboboxOptions("100011", "Bolu Kukus SP", [{ no: "100011", name: "Bolu Kukus SP" }]);
    expect(options).toEqual([{ value: "100011", label: "100011 — Bolu Kukus SP" }]);
  });
});
