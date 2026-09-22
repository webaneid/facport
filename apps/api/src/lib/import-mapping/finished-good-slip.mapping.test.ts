import { describe, test, expect } from "bun:test";
import {
  buildFinishedGoodSlipPayload,
  extractDataClassificationValues,
  finishedGoodSlipHeaderMissing,
  finishedGoodSlipMapping,
  finishedGoodSlipRowError,
  groupFinishedGoodSlipRows,
} from "./finished-good-slip.mapping";

// § Fase 149, architecture-finished-good-slip.md — data riil client 2026-09-22 (Trans No 18320): 1 barang, 2 baris serial lanjutan.
const map = finishedGoodSlipMapping.defaultColumnMap;
const row = (id: string, data: Record<string, unknown>) => ({ id, rawData: data });

describe("finishedGoodSlipRowError", () => {
  test("itemNo, quantity, portion WAJIB SEKALIGUS (dikonfirmasi live, beda dari Material Slip)", () => {
    expect(finishedGoodSlipRowError({ "Item No": "A", Qty: 1, Portion: 100 }, map)).toEqual([]);
    expect(finishedGoodSlipRowError({ "Item No": "A" }, map).sort()).toEqual(["portion", "quantity"]);
    expect(finishedGoodSlipRowError({}, map).sort()).toEqual(["itemNo", "portion", "quantity"]);
  });
});

describe("finishedGoodSlipHeaderMissing", () => {
  test("lengkap → kosong; kosong → label kolom", () => {
    expect(finishedGoodSlipHeaderMissing({ "Trans Date": "03/11/2025", "Branch Name": "Kantor Pusat", "Work Order No": "6682" }, map)).toEqual([]);
    expect(finishedGoodSlipHeaderMissing({ "Branch Name": "Kantor Pusat" }, map).sort()).toEqual(["Trans Date", "Work Order No"]);
  });
});

describe("groupFinishedGoodSlipRows & buildFinishedGoodSlipPayload — data riil client (Trans No 18320)", () => {
  test("1 barang + 2 baris lanjutan serial digabung jadi 1 detailItem dengan 2 entri detailSerialNumber", () => {
    const groups = groupFinishedGoodSlipRows(
      [
        row("1", { "Branch Name": "Kantor Pusat", "Trans Date": "2025-11-03", "Trans No": "18320", "Work Order No": "6682", Description: "Production Result", "Item No": "3300500719", "Item Name": "TAMAGOYAKI (MASUYA)", Qty: 101, Portion: 100, "Unit Name": "CTN", "Warehouse Name": "WH FG" }),
        row("2", { "Trans No": "18320", "Item No": "3300500719", "Item Name": "TAMAGOYAKI (MASUYA)", "Serial No": "28/10/2025", Qty_1: 15, "Expired Date": "2026-10-22" }),
        row("3", { "Trans No": "18320", "Item No": "3300500719", "Item Name": "TAMAGOYAKI (MASUYA)", "Serial No": "29/10/2025", Qty_1: 1500, "Expired Date": "2026-10-23" }),
      ],
      map,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(1);

    const payload = buildFinishedGoodSlipPayload(groups[0]!, map);
    expect(payload).toMatchObject({ transDate: "03/11/2025", branchName: "Kantor Pusat", workOrderNumber: "6682", number: "18320", description: "Production Result" });
    expect(payload.detailItem).toEqual([
      {
        itemNo: "3300500719",
        quantity: 101,
        portion: 100,
        detailName: "TAMAGOYAKI (MASUYA)",
        itemUnitName: "CTN",
        warehouseName: "WH FG",
        detailSerialNumber: [
          { serialNumberNo: "28/10/2025", quantity: 15, expiredDate: "22/10/2026" },
          { serialNumberNo: "29/10/2025", quantity: 1500, expiredDate: "23/10/2026" },
        ],
      },
    ]);
  });

  test("dokumen tanpa baris lanjutan → detailSerialNumber tidak muncul", () => {
    const groups = groupFinishedGoodSlipRows([row("1", { "Trans No": "X", "Branch Name": "Pusat", "Work Order No": "1", "Item No": "A", Qty: 1, Portion: 100 })], map);
    expect((groups[0]!.items[0]! as unknown as { itemRow: unknown })).toBeDefined();
    const payload = buildFinishedGoodSlipPayload(groups[0]!, map);
    expect(payload.detailItem).toEqual([{ itemNo: "A", quantity: 1, portion: 100 }]);
  });
});

describe("extractDataClassificationValues", () => {
  test("5 slot, hanya yang terisi", () => {
    expect(extractDataClassificationValues({ CLS2: "B" }, map)).toEqual([{ index: 2, name: "B" }]);
  });
});

describe("finishedGoodSlipMapping", () => {
  test("required: tanggal, cabang, Work Order No (portion/quantity/itemNo wajib bersyarat per baris, bukan di level mapping)", () => {
    expect([...finishedGoodSlipMapping.requiredFields]).toEqual(["transDate", "branchName", "workOrderNumber"]);
  });
  test("semua field defaultColumnMap valid di fieldToAccuratePath", () => {
    for (const field of Object.values(map)) expect(finishedGoodSlipMapping.fieldToAccuratePath).toHaveProperty(field);
  });
});

describe("finishedGoodSlipRowError — baris lanjutan serial (dipanggil berdiri sendiri, TIDAK tahu konteks grup)", () => {
  test("baris lanjutan MURNI (quantity & portion kosong, Serial No terisi) → SAH, bukan galat", () => {
    expect(finishedGoodSlipRowError({ "Item No": "A", "Serial No": "S1" }, finishedGoodSlipMapping.defaultColumnMap)).toEqual([]);
  });
  test("baris kosong total (tanpa quantity/portion/serial) → tetap galat penuh (aman, tidak hilang diam-diam)", () => {
    expect(finishedGoodSlipRowError({}, finishedGoodSlipMapping.defaultColumnMap).sort()).toEqual(["itemNo", "portion", "quantity"]);
  });
  test("quantity terisi tapi portion kosong (typo user, BUKAN baris lanjutan) → tetap galat portion", () => {
    expect(finishedGoodSlipRowError({ "Item No": "A", Qty: 10 }, finishedGoodSlipMapping.defaultColumnMap)).toEqual(["portion"]);
  });
});
