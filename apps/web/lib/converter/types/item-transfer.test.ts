import { describe, test, expect } from "bun:test";
import { itemTransferType } from "./item-transfer";

const opts = { branch: "HO", defCurrency: "IDR" };

describe("itemTransferType.process — grouping & validasi (mirror tool.html baris 1313-1330)", () => {
  test("1 baris = 1 dokumen, field ter-parse sesuai kolom Excel", () => {
    const rows = [{ No_Pindah: "1000", Tgl_Pindah: "2026-01-17", Dari_Gudang: "DEPAN", Ke_Gudang: "ELEKTRONIK", Kode_Barang: "AC-Pan", Satuan: "set", Kuantitas: 2, Harga_Satuan: 5700000, Keterangan: "" }];
    const ctx = itemTransferType.process(rows, opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["1000"]!.head).toEqual({ no: "1000", date: "2026-01-17", from: "DEPAN", to: "ELEKTRONIK", desc: "" });
    expect(ctx.groups["1000"]!.lines).toEqual([{ itemNo: "AC-Pan", unit: "set", qty: 2, price: 5700000 }]);
  });

  test("Dari_Gudang === Ke_Gudang → error (harus antar gudang berbeda)", () => {
    const rows = [{ No_Pindah: "X", Tgl_Pindah: "2026-01-01", Dari_Gudang: "A", Ke_Gudang: "A", Kode_Barang: "Y", Kuantitas: 1 }];
    const ctx = itemTransferType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("harus antar gudang berbeda"))).toBe(true);
  });

  test("Harga_Satuan kosong/negatif → fallback 0 (opsional, BUKAN error)", () => {
    const rows = [{ No_Pindah: "X", Tgl_Pindah: "2026-01-01", Dari_Gudang: "A", Ke_Gudang: "B", Kode_Barang: "Y", Kuantitas: 1, Harga_Satuan: -5 }];
    const ctx = itemTransferType.process(rows, opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["X"]!.lines[0]!.price).toBe(0);
  });

  test("2 baris No_Pindah sama tapi gudang/tanggal beda → warning 'dipakai nilai baris pertama', TETAP 1 grup", () => {
    const rows = [
      { No_Pindah: "X", Tgl_Pindah: "2026-01-01", Dari_Gudang: "A", Ke_Gudang: "B", Kode_Barang: "Y1", Kuantitas: 1 },
      { No_Pindah: "X", Tgl_Pindah: "2026-01-02", Dari_Gudang: "A", Ke_Gudang: "C", Kode_Barang: "Y2", Kuantitas: 1 },
    ];
    const ctx = itemTransferType.process(rows, opts);
    expect(ctx.warnings.some((w) => w.includes("dipakai nilai baris pertama"))).toBe(true);
    expect(ctx.order).toEqual(["X"]);
    expect(ctx.groups["X"]!.lines.length).toBe(2);
    expect(ctx.groups["X"]!.head.to).toBe("B"); // baris pertama menang
  });

  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = itemTransferType.process([{ No_Pindah: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("itemTransferType.build — struktur XML PERSIS mirror tool.html baris 1333-1344", () => {
  test("1 dokumen 1 baris — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const rows = [{ No_Pindah: "1000", Tgl_Pindah: "2026-01-17", Dari_Gudang: "DEPAN", Ke_Gudang: "ELEKTRONIK", Kode_Barang: "AC-Pan", Satuan: "set", Kuantitas: 2, Harga_Satuan: 5700000, Keterangan: "" }];
    const ctx = itemTransferType.process(rows, opts);
    const xml = itemTransferType.build(ctx);
    const expectedBody =
      '<WTRAN operation="Add" REQUESTID="1"><TRANSFERID>1</TRANSFERID><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID/><ITEMNO>AC-Pan</ITEMNO><QUANTITY>2</QUANTITY><ITEMUNIT>set</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><UNITPRICE>5700000</UNITPRICE><QTYCONTROL>0</QTYCONTROL></ITEMLINE><TRANSFERNO>1000</TRANSFERNO><TRANSFERDATE>2026-01-17</TRANSFERDATE><DESCRIPTION/><FROMWHID>DEPAN</FROMWHID><TOWHID>ELEKTRONIK</TOWHID><FROMWHADDRESS></FROMWHADDRESS><TOWHADDRESS></TOWHADDRESS></WTRAN>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("Keterangan terisi → <DESCRIPTION> berisi teks (bukan self-closing)", () => {
    const rows = [{ No_Pindah: "X", Tgl_Pindah: "2026-01-01", Dari_Gudang: "A", Ke_Gudang: "B", Kode_Barang: "Y", Kuantitas: 1, Keterangan: "stok balik dari proyek" }];
    const ctx = itemTransferType.process(rows, opts);
    expect(itemTransferType.build(ctx)).toContain("<DESCRIPTION>stok balik dari proyek</DESCRIPTION>");
  });
});

describe("itemTransferType.summary — mirror tool.html baris 1346-1349", () => {
  test("stats + totals pakai fmtMoney (format Indonesia)", () => {
    const rows = [
      { No_Pindah: "A", Tgl_Pindah: "2026-01-01", Dari_Gudang: "X", Ke_Gudang: "Y", Kode_Barang: "I1", Kuantitas: 1000 },
      { No_Pindah: "B", Tgl_Pindah: "2026-01-02", Dari_Gudang: "X", Ke_Gudang: "Y", Kode_Barang: "I2", Kuantitas: 500 },
    ];
    const ctx = itemTransferType.process(rows, opts);
    const summary = itemTransferType.summary(ctx);
    expect(summary.stats).toEqual([[2, "Pindah Barang"], [2, "Baris item"], [0, "Error"], [0, "Peringatan"]]);
    expect(summary.totals).toBe("1.500 total kuantitas dipindah antar gudang");
    expect(summary.rowCount).toBe(2);
  });
});
