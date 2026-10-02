import { describe, test, expect } from "bun:test";
import { parseAutoproduksiTransDate, autoproduksiProductionRowError } from "./autoproduksi-production.mapping";

const columnMapping: Record<string, string> = {
  Tanggal: "transDate",
  "Nama Resep/Formula": "formulaName",
  Jumlah: "producedQty",
};

describe("parseAutoproduksiTransDate — client eksplisit terima 2 format", () => {
  test("yyyy-mm-dd", () => {
    expect(parseAutoproduksiTransDate("2026-07-13")).toBe("2026-07-13");
  });

  test("dd/mm/yyyy", () => {
    expect(parseAutoproduksiTransDate("13/07/2026")).toBe("2026-07-13");
  });

  test("Excel date serial number", () => {
    // 46216 = 13 Jul 2026 (epoch 30 Des 1899)
    expect(parseAutoproduksiTransDate(46216)).toBe("2026-07-13");
  });

  test("format tidak dikenali -> null", () => {
    expect(parseAutoproduksiTransDate("13 Juli 2026")).toBeNull();
    expect(parseAutoproduksiTransDate(undefined)).toBeNull();
  });
});

describe("autoproduksiProductionRowError", () => {
  const validRow = { Tanggal: "2026-07-13", "Nama Resep/Formula": "Bolu Kukus SP (Spesial)", Jumlah: "15" };

  test("baris lengkap & valid -> tidak ada error", () => {
    expect(autoproduksiProductionRowError(validRow, columnMapping)).toEqual([]);
  });

  test("tanggal tidak valid -> error transDate", () => {
    expect(autoproduksiProductionRowError({ ...validRow, Tanggal: "bukan tanggal" }, columnMapping)).toContain("transDate");
  });

  test("Nama Resep kosong -> error formulaName", () => {
    expect(autoproduksiProductionRowError({ ...validRow, "Nama Resep/Formula": "" }, columnMapping)).toContain("formulaName");
  });

  test("Jumlah 0 atau negatif -> error producedQty", () => {
    expect(autoproduksiProductionRowError({ ...validRow, Jumlah: "0" }, columnMapping)).toContain("producedQty");
    expect(autoproduksiProductionRowError({ ...validRow, Jumlah: "-5" }, columnMapping)).toContain("producedQty");
  });

  test("Jumlah bukan angka -> error producedQty", () => {
    expect(autoproduksiProductionRowError({ ...validRow, Jumlah: "lima belas" }, columnMapping)).toContain("producedQty");
  });
});

// § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Gudang Bahan
// Baku/Proyek/Departemen BARU, semua opsional, pindahan dari Import
// Formula (§ autoproduksi.schema.ts). Insert LANGSUNG ke kolom varchar
// kita sendiri (autoproduksi_production_entries) — sama kelas bug security
// review Fase 166, WAJIB divalidasi panjangnya.
describe("autoproduksiProductionRowError — kolom baru Fase 168 (opsional)", () => {
  const extendedMapping: Record<string, string> = {
    ...columnMapping,
    Cabang: "branchName",
    "Gudang Barang Jadi": "warehouseName",
    "Gudang Bahan Baku": "rawMaterialWarehouseName",
    Proyek: "projectNo",
    Departemen: "departmentName",
  };
  const validRow = { Tanggal: "2026-07-13", "Nama Resep/Formula": "Bolu Kukus SP (Spesial)", Jumlah: "15" };

  test("kolom baru KOSONG semua -> tetap valid (opsional)", () => {
    expect(autoproduksiProductionRowError(validRow, extendedMapping)).toEqual([]);
  });

  test("kolom baru TERISI wajar -> tetap valid", () => {
    const row = { ...validRow, Cabang: "JAKARTA", "Gudang Barang Jadi": "Utama", "Gudang Bahan Baku": "Utama", Proyek: "PRJ-1", Departemen: "Produksi" };
    expect(autoproduksiProductionRowError(row, extendedMapping)).toEqual([]);
  });

  test("Cabang lebih panjang dari varchar(100) -> error branchName, bukan nge-insert lalu gagal", () => {
    const row = { ...validRow, Cabang: "X".repeat(101) };
    expect(autoproduksiProductionRowError(row, extendedMapping)).toContain("branchName");
  });

  test("Proyek lebih panjang dari varchar(50) -> error projectNo", () => {
    const row = { ...validRow, Proyek: "X".repeat(51) };
    expect(autoproduksiProductionRowError(row, extendedMapping)).toContain("projectNo");
  });
});
