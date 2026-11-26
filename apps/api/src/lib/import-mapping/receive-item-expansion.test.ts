import { describe, expect, it } from "bun:test";
import { parseSalesQuotationDetail } from "../accurate-sales-quotation";
import { buildReceiveItemPayload, receiveItemMapping } from "./receive-item.mapping";
import { assertReceiveItemLines, expandPurchaseOrderRowsInPayload, isRequiredFieldExemptForRow, type PurchaseOrderSource } from "./receive-item-expansion";

const map = receiveItemMapping.defaultColumnMap;
const row = (extra: Record<string, unknown> = {}) => ({ Date: "26/11/2026", "Vendor No": "V1", "Receive Number": "SJ-1", "Branch Name": "Pusat", "ITEM: Purchase Order No": "PO-1", ...extra });
// bentuk respons asli `purchase-order/detail.do` (Tahap 0): item kembar, sebagian diterima, satu baris habis
const line = (id: number, no: string, price: number, available: number) => ({ id, item: { no }, quantity: 10, availableQuantity: available, unitPrice: price, availableUnitPrice: price, availableItemUnitName: "PCS", warehouse: { name: "Utama" } });
const order = (): PurchaseOrderSource => ({
  ...parseSalesQuotationDetail({ cashDiscount: 500, detailItem: [line(50, "A", 1000, 7), line(51, "A", 1200, 5), line(52, "B", 500, 0)] }, "PO-1", "Pesanan Pembelian"),
  vendorNo: "V1",
});
const run = async (rows: Record<string, unknown>[], src = order()) => {
  const payload = buildReceiveItemPayload(rows, map);
  await expandPurchaseOrderRowsInPayload(payload, rows, map, async () => src);
  return payload as Record<string, any>;
};

describe("Fase 225 — Receive Item dari Purchase Order", () => {
  it("menarik sisa tiap baris beserta ID baris dan gudang", async () => {
    const p = await run([row()]);
    expect(p.detailItem.map((d: any) => [d.itemNo, d.quantity, d.unitPrice, d.purchaseOrderDetailId, d.warehouseName, d.purchaseOrderNumber])).toEqual([
      ["A", 7, 1000, 50, "Utama", "PO-1"],
      ["A", 5, 1200, 51, "Utama", "PO-1"],
    ]);
    expect(p.cashDiscount).toBeUndefined();
  });
  it("isian Excel menang; kolom barang terisi = tidak diperluas", async () => {
    expect((await run([row({ "Item Warehouse": "Cabang" })])).detailItem[0].warehouseName).toBe("Cabang");
    expect((await run([row({ "Item No": "A", Quantity: 1 })])).detailItem).toHaveLength(1);
  });
  it("menolak pemasok beda, PO dobel, dan PO tanpa sisa", async () => {
    expect(run([row({ "Vendor No": "V9" })])).rejects.toThrow("milik pemasok");
    expect(run([row(), row()])).rejects.toThrow("lebih dari satu baris");
    expect(() => parseSalesQuotationDetail({ detailItem: [line(1, "A", 1, 0)] }, "PO-1", "Pesanan Pembelian")).toThrow("sisa yang bisa diterima");
  });
  it("pengecualian wajib hanya baris perluasan; baris kosong tanpa PO ditolak jelas", () => {
    expect(isRequiredFieldExemptForRow(row(), map, "itemNo")).toBe(true);
    expect(isRequiredFieldExemptForRow(row(), map, "vendorNo")).toBe(false);
    expect(() => assertReceiveItemLines(buildReceiveItemPayload([row({ "ITEM: Purchase Order No": "" })], map))).toThrow("masih kosong");
  });
});
