import { describe, expect, test } from "bun:test";
import { resolveSinglePreselectProductLine } from "./resolve-preselect-product-line";

describe("resolveSinglePreselectProductLine", () => {
  test("kosong -> null (tidak ada preselect, tidak ada redirect)", () => {
    expect(resolveSinglePreselectProductLine([])).toBeNull();
  });

  test("semua moduleKey dari 1 Produk (Facport) -> productLine itu", () => {
    expect(resolveSinglePreselectProductLine(["sales_invoice", "purchase_order"])).toBe("facport");
  });

  test("1 moduleKey Konverter -> \"konverter\"", () => {
    expect(resolveSinglePreselectProductLine(["konverter_sales_invoice"])).toBe("konverter");
  });

  test("1 moduleKey AutoProduksi -> \"autoproduksi\"", () => {
    expect(resolveSinglePreselectProductLine(["autoproduksi_production"])).toBe("autoproduksi");
  });

  test("lintas Produk (Facport + Konverter) -> null (tetap di Step 0)", () => {
    expect(resolveSinglePreselectProductLine(["sales_invoice", "konverter_sales_invoice"])).toBeNull();
  });

  test("moduleKey tidak dikenal (bukan di katalog manapun) diabaikan, bukan bikin error", () => {
    expect(resolveSinglePreselectProductLine(["moduleKey_asal_asalan"])).toBeNull();
  });
});
