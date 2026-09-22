import { describe, test, expect } from "bun:test";
import { collectSerialEntries, groupSlipDocuments } from "./manufacture-slip-shared";

// § Fase 148/149 — grouping 2-level ditemukan dari data produksi RIIL client 2026-09-22 (Material Slip & Finished Good Slip).
const map = {
  "Trans No": "number",
  "Item No": "itemNo",
  Qty: "quantity",
  "Warehouse Name": "warehouseName",
  "Serial No": "serialNo",
  "Qty_1": "serialQty",
  "Expired Date": "serialExpDate",
};
const row = (id: string, data: Record<string, unknown>) => ({ id, rawData: data });
const toAccurateDate = (v: unknown) => (typeof v === "string" ? v : String(v));

describe("groupSlipDocuments — pola Finished Good Slip (1 barang, banyak baris serial)", () => {
  test("baris lanjutan (quantity kosong, serial terisi) digabung ke barang TERAKHIR, bukan barang baru", () => {
    const docs = groupSlipDocuments(
      [
        row("1", { "Trans No": "18320", "Item No": "3300500719", Qty: 101, "Warehouse Name": "WH FG" }),
        row("2", { "Trans No": "18320", "Item No": "3300500719", "Serial No": "28/10/2025", Qty_1: 15, "Expired Date": "22/10/2026" }),
        row("3", { "Trans No": "18320", "Item No": "3300500719", "Serial No": "29/10/2025", Qty_1: 1500, "Expired Date": "23/10/2026" }),
      ],
      map,
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]!.items).toHaveLength(1);
    const item = docs[0]!.items[0]!;
    expect(item.itemRow.id).toBe("1");
    expect(item.serialRows.map((r) => r.id)).toEqual(["2", "3"]);
    expect(collectSerialEntries(item, map, toAccurateDate)).toEqual([
      { serialNumberNo: "28/10/2025", quantity: 15, expiredDate: "22/10/2026" },
      { serialNumberNo: "29/10/2025", quantity: 1500, expiredDate: "23/10/2026" },
    ]);
  });
});

describe("groupSlipDocuments — pola Material Slip (banyak barang, tiap barang bawa serial sendiri)", () => {
  test("2 baris Trans No sama, Item No beda → 2 barang terpisah, masing-masing serial dari baris itu sendiri", () => {
    const docs = groupSlipDocuments(
      [
        row("1", { "Trans No": "MS-001", "Item No": 10001, Qty: 10, "Serial No": "XX1", Qty_1: 10 }),
        row("2", { "Trans No": "MS-001", "Item No": 10002, Qty: 10, "Serial No": "XX2", Qty_1: 10 }),
      ],
      map,
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]!.items).toHaveLength(2);
    expect(docs[0]!.items.map((it) => it.itemRow.rawData["Item No"])).toEqual([10001, 10002]);
    expect(docs[0]!.items[0]!.serialRows).toEqual([]);
    expect(collectSerialEntries(docs[0]!.items[0]!, map, toAccurateDate)).toEqual([{ serialNumberNo: "XX1", quantity: 10 }]);
    expect(collectSerialEntries(docs[0]!.items[1]!, map, toAccurateDate)).toEqual([{ serialNumberNo: "XX2", quantity: 10 }]);
  });
});

describe("groupSlipDocuments — kasus umum", () => {
  test("Trans No kosong → 1 baris = 1 dokumen = 1 barang", () => {
    const docs = groupSlipDocuments([row("1", { "Item No": "A", Qty: 1 }), row("2", { "Item No": "B", Qty: 2 })], map);
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.groupKey === null)).toBe(true);
    expect(docs[0]!.items).toHaveLength(1);
  });
  test("kolom Trans No tidak dipetakan → tiap baris dokumen sendiri", () => {
    const docs = groupSlipDocuments([row("1", { "Item No": "A", Qty: 1 }), row("2", { "Item No": "A", Qty: 1 })], { "Item No": "itemNo", Qty: "quantity" });
    expect(docs).toHaveLength(2);
  });
  test("baris tanpa quantity DAN tanpa serial di tengah dokumen → jadi barang tersendiri (aman, tidak hilang diam-diam)", () => {
    const docs = groupSlipDocuments(
      [row("1", { "Trans No": "X", "Item No": "A", Qty: 1 }), row("2", { "Trans No": "X", "Item No": "" })],
      map,
    );
    expect(docs[0]!.items).toHaveLength(2);
    expect(docs[0]!.items[1]!.itemRow.id).toBe("2");
  });
  test("Trans No dicocokkan case-insensitive", () => {
    const docs = groupSlipDocuments([row("1", { "Trans No": "ms-1", "Item No": "A", Qty: 1 }), row("2", { "Trans No": "MS-1", "Item No": "B", Qty: 2 })], map);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.items).toHaveLength(2);
  });
  test("collectSerialEntries: tidak ada serial di baris manapun → array kosong", () => {
    const docs = groupSlipDocuments([row("1", { "Trans No": "X", "Item No": "A", Qty: 1 })], map);
    expect(collectSerialEntries(docs[0]!.items[0]!, map, toAccurateDate)).toEqual([]);
  });
});
