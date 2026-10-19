import { describe, test, expect } from "bun:test";
import { parseSalesQuotationLines, parseSalesQuotationDetail, MAX_QUOTATION_LINES } from "./accurate-sales-quotation";

// § Fase 169 — parser KETAT: bentuk respons `sales-quotation/detail.do` belum diverifikasi dengan respons asli, jadi data yang tidak
// terbaca lengkap TIDAK BOLEH lolos jadi baris setengah (harga 0 diam-diam = data akuntansi salah).
describe("parseSalesQuotationLines", () => {
  const line = { item: { no: "A-1" }, detailName: "Barang A", detailNotes: "cat", unitPrice: 5000, quantity: 10, itemUnit: { name: "PCS" } };

  test("bentuk utama (item.no, itemUnit.name) terbaca lengkap; angka string dikonversi; nama/catatan kosong jadi null", () => {
    expect(parseSalesQuotationLines({ detailItem: [line, { ...line, item: { no: "B-2" }, detailName: " ", detailNotes: null, unitPrice: "7500.5", quantity: "3" }] }, "SQ-1")).toEqual([
      { itemNo: "A-1", itemName: "Barang A", unitPrice: 5000, quantity: 10, unitName: "PCS", notes: "cat" },
      { itemNo: "B-2", itemName: null, unitPrice: 7500.5, quantity: 3, unitName: "PCS", notes: null },
    ]);
  });

  test("bentuk cadangan (itemNo flat, unit.name / itemUnitName) juga terbaca", () => {
    const flat = { itemNo: "C-3", unitPrice: 1, quantity: 2, itemUnitName: "BOX" };
    expect(parseSalesQuotationLines({ detailItem: [flat, { ...flat, itemNo: "D-4", itemUnitName: undefined, unit: { name: "DUS" } }] }, "SQ-1").map((l) => l.unitName)).toEqual(["BOX", "DUS"]);
  });

  test("harga 0 yang SAH diterima (bonus/gratis), tapi harga hilang / qty ≤ 0 / tanpa satuan / tanpa kode barang → ditolak dengan nomor baris & field", () => {
    expect(parseSalesQuotationLines({ detailItem: [{ ...line, unitPrice: 0 }] }, "SQ-1")[0]!.unitPrice).toBe(0);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, unitPrice: undefined }] }, "SQ-1")).toThrow(/Baris ke-1.*SQ-1.*harga/);
    expect(() => parseSalesQuotationLines({ detailItem: [line, { ...line, quantity: 0 }] }, "SQ-1")).toThrow(/Baris ke-2.*qty/);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, itemUnit: null }] }, "SQ-1")).toThrow(/satuan/);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, item: null }] }, "SQ-1")).toThrow(/kode barang/);
  });

  test("penawaran tanpa baris item / respons kosong → error jelas", () => {
    expect(() => parseSalesQuotationLines({ detailItem: [] }, "SQ-9")).toThrow('Penawaran "SQ-9" tidak punya baris item');
    expect(() => parseSalesQuotationLines(undefined, "SQ-9")).toThrow("tidak punya baris item");
  });
});

describe("parseSalesQuotationLines — batas jumlah baris (security review Fase 169)", () => {
  const line = { item: { no: "A-1" }, unitPrice: 1, quantity: 1, itemUnit: { name: "PCS" } };
  test("tepat di batas lolos; satu baris di atas batas ditolak dengan pesan jelas", () => {
    expect(parseSalesQuotationLines({ detailItem: Array.from({ length: MAX_QUOTATION_LINES }, () => line) }, "SQ-1")).toHaveLength(MAX_QUOTATION_LINES);
    expect(() => parseSalesQuotationLines({ detailItem: Array.from({ length: MAX_QUOTATION_LINES + 1 }, () => line) }, "SQ-1")).toThrow(/melebihi batas 500/);
  });
});

// § Fase 172 — atribut tambahan: bentuk respons belum terverifikasi → yang tidak terbaca TIDAK ditarik (bukan error), kecuali Beban.
describe("parseSalesQuotationDetail — header, atribut baris, Beban", () => {
  const line = { item: { no: "A-1" }, unitPrice: 5000, quantity: 10, itemUnit: { name: "PCS" } };

  test("header dibaca dari relasi nested (paymentTerm.name, currency.code) maupun bentuk datar; diskon 0 tidak ditarik", () => {
    const nested = parseSalesQuotationDetail(
      { detailItem: [line], paymentTerm: { name: "net 30" }, currency: { code: "IDR" }, toAddress: "Jl. A", description: "Q3", cashDiscount: 1000, cashDiscPercent: "5" },
      "SQ-1",
    );
    expect(nested.header).toEqual({ paymentTermName: "net 30", currencyCode: "IDR", toAddress: "Jl. A", description: "Q3", cashDiscPercent: "5" });
    expect(parseSalesQuotationDetail({ detailItem: [line], cashDiscount: 2547.5, cashDiscPercent: "" }, "SQ-1").header).toEqual({ cashDiscount: 2547.5 });
    const flat = parseSalesQuotationDetail({ detailItem: [line], paymentTermName: "cod", currencyCode: "USD", cashDiscount: 0, cashDiscPercent: 0 }, "SQ-1");
    expect(flat.header).toEqual({ paymentTermName: "cod", currencyCode: "USD" });
    expect(parseSalesQuotationDetail({ detailItem: [line] }, "SQ-1").header).toEqual({});
  });

  test("atribut baris: dept/proyek/penjual/diskon/pajak terbaca; yang kosong atau tidak dikenal tidak muncul", () => {
    const d = parseSalesQuotationDetail(
      {
        detailItem: [
          { ...line, department: { name: "Penjualan" }, project: { projectNo: "PRJ-1" }, salesmanList: [{ number: "S-1" }, "S-2"], itemCashDiscount: 250, itemDiscPercent: "2", useTax1: true, tax3: { id: 1 } },
          { ...line, department: null, salesmanList: [], itemCashDiscount: 0 },
        ],
      },
      "SQ-1",
    );
    expect(d.lines[0]).toMatchObject({ departmentName: "Penjualan", projectNo: "PRJ-1", salesmanListNumber: ["S-1", "S-2"], itemDiscPercent: "2", useTax1: true, useTax3: true });
    // persen & nominal sama-sama ada (pola respons asli) → hanya persen
    expect(d.lines[0]).not.toHaveProperty("itemCashDiscount");
    expect(Object.keys(d.lines[1]!).sort()).toEqual(["itemName", "itemNo", "notes", "quantity", "unitName", "unitPrice"]);
  });

  test("Beban penawaran terbaca; baris Beban yang akun/jumlahnya tidak terbaca → GAGAL jelas (data akuntansi, tidak ditebak)", () => {
    const ok = parseSalesQuotationDetail({ detailItem: [line], detailExpense: [{ account: { no: "6101" }, expenseName: "Ongkir", expenseAmount: 15000, expenseNotes: "kirim" }] }, "SQ-1");
    expect(ok.expenses).toEqual([{ accountNo: "6101", expenseName: "Ongkir", expenseAmount: 15000, expenseNotes: "kirim" }]);
    expect(parseSalesQuotationDetail({ detailItem: [line] }, "SQ-1").expenses).toEqual([]);
    expect(() => parseSalesQuotationDetail({ detailItem: [line], detailExpense: [{ expenseAmount: 5 }] }, "SQ-1")).toThrow(/Beban ke-1.*SQ-1.*akun/);
  });
});

// § Fase 198 tahap B — parser yang sama dipakai Sales Order sebagai dokumen sumber; hanya kata di pesan galat yang berganti.
describe("parseSalesQuotationDetail — label dokumen (Pesanan)", () => {
  test("pesan galat menyebut Pesanan (bukan Penawaran) bila label Pesanan; default tetap Penawaran", () => {
    expect(() => parseSalesQuotationDetail({ detailItem: [] }, "SO-1", "Pesanan")).toThrow(/Pesanan "SO-1" tidak punya baris item/);
    expect(() => parseSalesQuotationDetail({ detailItem: [] }, "SQ-1")).toThrow(/Penawaran "SQ-1" tidak punya baris item/);
    expect(() => parseSalesQuotationDetail({ detailItem: [{ unitPrice: 1, quantity: 1 }] }, "SO-1", "Pesanan")).toThrow(/Baris ke-1 pesanan "SO-1"/);
  });
});

// § Fase 198 tahap C — gudang baris dibaca bila ada (dipakai sumber Delivery Order); label "Pengiriman".
describe("parseSalesQuotationDetail — gudang & label Pengiriman", () => {
  const base = { item: { no: "A" }, unitPrice: 10, quantity: 1, itemUnit: { name: "PCS" } };
  test("warehouse.name / warehouseName dibaca; tanpa gudang = tidak ada field (bukan error)", () => {
    expect(parseSalesQuotationDetail({ detailItem: [{ ...base, warehouse: { name: "Gudang A" } }] }, "DO-1", "Pengiriman").lines[0]!.warehouseName).toBe("Gudang A");
    expect(parseSalesQuotationDetail({ detailItem: [{ ...base, warehouseName: "Gudang B" }] }, "DO-1", "Pengiriman").lines[0]!.warehouseName).toBe("Gudang B");
    expect(parseSalesQuotationDetail({ detailItem: [base] }, "DO-1", "Pengiriman").lines[0]!.warehouseName).toBeUndefined();
  });
  test("pesan galat menyebut Pengiriman", () => {
    expect(() => parseSalesQuotationDetail({ detailItem: [] }, "DO-1", "Pengiriman")).toThrow(/Pengiriman "DO-1" tidak punya baris item/);
  });
});

// § Fase 198 (lanjutan) — pajak & kurs header: hanya nilai bertipe benar yang dibaca; sisanya TIDAK ditarik (bukan galat).
describe("parseSalesQuotationDetail — inclusiveTax / taxable / rate", () => {
  const line = { item: { no: "A" }, unitPrice: 10, quantity: 1, itemUnit: { name: "PCS" } };
  test("boolean dan kurs positif dibaca", () => {
    const { header } = parseSalesQuotationDetail({ detailItem: [line], inclusiveTax: true, taxable: false, rate: 15500 }, "SQ-1");
    expect(header).toMatchObject({ inclusiveTax: true, taxable: false, rate: 15500 });
  });
  test("tipe salah/0/tidak ada → tidak ditarik", () => {
    const { header } = parseSalesQuotationDetail({ detailItem: [line], inclusiveTax: "true", taxable: 1, rate: 0 }, "SQ-1");
    expect(header.inclusiveTax).toBeUndefined();
    expect(header.taxable).toBeUndefined();
    expect(header.rate).toBeUndefined();
  });
});

// § Fase 198 (lanjutan, sedang) — atribut tambahan baris/header, PPnBM, departemen Beban: dibaca toleran.
describe("parseSalesQuotationDetail — atribut tambahan", () => {
  const base = { item: { no: "A" }, unitPrice: 10, quantity: 1, itemUnit: { name: "PCS" } };
  test("baris: klasifikasi (objek & string datar), karakter, angka (0 diabaikan), PPnBM → line.extra dengan nama field TULIS", () => {
    const { lines } = parseSalesQuotationDetail(
      {
        detailItem: [
          {
            ...base,
            dataClassification5: { id: 1, name: "Week 1" },
            dataClassification3Name: "SPK-9",
            dataClassification7: null,
            charField2: "  catatan  ",
            charField4: "",
            numericField1: 25,
            numericField2: 0,
            dateField1: "01/10/2026",
            useTax2: true,
          },
        ],
      },
      "SQ-1",
    );
    expect(lines[0]!.extra).toEqual({ dataClassification5Name: "Week 1", dataClassification3Name: "SPK-9", charField2: "catatan", numericField1: 25, dateField1: "01/10/2026", useTax2: true });
  });
  test("tanpa atribut apa pun → tidak ada `extra`; tanggal berformat selain dd/MM/yyyy tidak ditarik", () => {
    expect(parseSalesQuotationDetail({ detailItem: [{ ...base, dateField1: "2026-10-01", dateField2: "1/2/2026" }] }, "SQ-1").lines[0]!.extra).toBeUndefined();
  });
  test("header: charField/numericField dibaca (0 diabaikan) → headerExtra; kosong → tidak ada", () => {
    const d = parseSalesQuotationDetail({ detailItem: [base], charField1: "H1", numericField3: 9, numericField4: 0, charField2: null }, "SQ-1");
    expect(d.headerExtra).toEqual({ charField1: "H1", numericField3: 9 });
    expect(parseSalesQuotationDetail({ detailItem: [base] }, "SQ-1").headerExtra).toBeUndefined();
  });
  test("header: dateField dibaca hanya bila dd/MM/yyyy", () => {
    expect(parseSalesQuotationDetail({ detailItem: [base], dateField1: "05/10/2026", dateField2: "2026-10-05" }, "SQ-1").headerExtra).toEqual({ dateField1: "05/10/2026" });
  });
  test("Beban: departemen dibaca bila ada", () => {
    const d = parseSalesQuotationDetail({ detailItem: [base], detailExpense: [{ account: { no: "6101" }, expenseAmount: 5, department: { name: "Umum" } }, { account: { no: "6102" }, expenseAmount: 6 }] }, "SQ-1");
    expect(d.expenses[0]!.departmentName).toBe("Umum");
    expect(d.expenses[1]!.departmentName).toBeUndefined();
  });
});

// § Fase 198 (lanjutan, rendah) — pengiriman & cabang header; shipDate hanya format dd/MM/yyyy.
describe("parseSalesQuotationDetail — pengiriman & cabang", () => {
  const line = { item: { no: "A" }, unitPrice: 10, quantity: 1, itemUnit: { name: "PCS" } };
  test("shipment.name, shipDate (dd/MM/yyyy), branch.name dibaca", () => {
    const { header } = parseSalesQuotationDetail({ detailItem: [line], shipment: { name: "JNE" }, shipDate: "20/10/2026", branch: { name: "JAKARTA" } }, "SQ-1");
    expect(header).toMatchObject({ shipmentName: "JNE", shipDate: "20/10/2026", branchName: "JAKARTA" });
  });
  test("bentuk datar dibaca; shipDate berformat lain TIDAK ditarik", () => {
    const flat = parseSalesQuotationDetail({ detailItem: [line], shipmentName: "SiCepat", branchName: "BDG", shipDate: "2026-10-20" }, "SQ-1").header;
    expect(flat).toMatchObject({ shipmentName: "SiCepat", branchName: "BDG" });
    expect(flat.shipDate).toBeUndefined();
    expect(parseSalesQuotationDetail({ detailItem: [line], shipDate: "1/2/2026" }, "SQ-1").header.shipDate).toBeUndefined();
  });
});
