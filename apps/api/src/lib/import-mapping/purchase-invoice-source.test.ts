import { describe, expect, it } from "bun:test";
import { parseSalesQuotationDetail } from "../accurate-sales-quotation";
import { decideGroupParallelism } from "../import-parallelism";
import { buildPurchaseInvoicePayload, missingRequiredValues, purchaseInvoiceMapping, purchaseSourceOfRow } from "./purchase-invoice.mapping";
import { expandPurchaseSourceRows } from "./source-doc-lines";

const map = purchaseInvoiceMapping.defaultColumnMap;
const column = (field: string) => Object.entries(map).find(([, f]) => f === field)![0];
const row = (fields: Record<string, unknown>) => Object.fromEntries(Object.entries(fields).map(([f, v]) => [column(f), v]));
const head = { vendorNo: "V1", transDate: "26/11/2026", number: "PI-1" };

describe("Fase 226 — Faktur Pembelian dari Penerimaan Barang / PO", () => {
  it("Penerimaan Barang menang atas PO; kolom barang terisi = bukan perluasan; tidak diwajibkan mengisi kolom barang", () => {
    const both = row({ ...head, itemReceiveItemNo: "RI-1", itemPurchaseOrderNo: "PO-1" });
    expect(purchaseSourceOfRow(both, map)).toEqual({ kind: "receiveItem", number: "RI-1" });
    expect(missingRequiredValues(both, map)).toEqual([]);
    expect(purchaseSourceOfRow({ ...both, ...row({ quantity: 1 }) }, map)).toBeNull();
    expect(decideGroupParallelism({ module: "purchase_invoice", rows: [{ rawData: both }], columnMapping: map, configured: 4, allowedModules: "all" }).reason).toBe("source_expansion");
  });

  it("menarik sisa + ID baris dan melaporkan offset untuk baris sesudahnya", async () => {
    const line = (id: number, available: number) => ({ id, item: { no: "A" }, unitPrice: 10, availableQuantity: available, availableItemUnitName: "PCS", warehouse: { name: "Utama" } });
    const rows = [row({ ...head, itemReceiveItemNo: "RI-1" }), row({ ...head, itemNo: "B", quantity: 1, unitPrice: 5 })];
    const payload = buildPurchaseInvoicePayload(rows, map);
    const offsets = await expandPurchaseSourceRows(payload, rows, map, [
      { number: "RI-1", label: "Penerimaan Barang", detailIdField: "receiveItemDetailId", fetch: async () => ({ ...parseSalesQuotationDetail({ detailItem: [line(102, 6), line(103, 2)] }, "RI-1", "Penerimaan Barang"), vendorNo: "V1" }) },
      null,
    ]);
    expect(offsets).toEqual([0, 2]);
    expect((payload.detailItem as Record<string, unknown>[]).map((d) => [d.itemNo, d.quantity, d.receiveItemDetailId, d.warehouseName])).toEqual([["A", 6, 102, "Utama"], ["A", 2, 103, "Utama"], ["B", 1, undefined, undefined]]);
  });
});
