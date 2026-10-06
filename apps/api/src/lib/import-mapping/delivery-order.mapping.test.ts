import { describe, test, expect } from "bun:test";
import {
  buildDeliveryOrderPayload,
  buildDetailItemFromRow,
  extractDataClassificationValues,
  deliveryOrderMapping,
  groupDeliveryOrderRows,
  validateGroupCustomerConsistency,
  resolveSalesOrderDetailId,
  type ImportRowRecord,
  resolveSalesOrderDetailIdsInPayload,
} from "./delivery-order.mapping";

// § Fase 157-158 — mirror `receive-item.mapping.test.ts`, disesuaikan
// dengan perbedaan Delivery Order: grouping DEFAULT ADR-0011 by "number"
// (BUKAN wajib seperti Receive Number Receive Item), `salesOrderDetailId`
// SEKARANG mengalir normal ke payload sebagai manual override, logic
// AUTO-RESOLVE murni (`resolveSalesOrderDetailId`, § Fase 158) DITEST di
// sini (lapisan fetch-nya sendiri, `getSalesOrderDetailByNumber`, TIDAK
// di-mock — konvensi project: I/O ke Accurate diverifikasi test call
// nyata, § lessons-learned 2026-09-24, bukan mock) + struktur
// `detailSerialNumber[]`.
describe("buildDeliveryOrderPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Cust No": "C.00001",
      "Trans Date": "2026-09-24",
      "Item No": "9900012",
      "Item Unit Price": 10000,
      "Item Qty": 5,
    };
    const columnMapping = {
      "Cust No": "customerNo",
      "Trans Date": "transDate",
      "Item No": "itemNo",
      "Item Unit Price": "unitPrice",
      "Item Qty": "quantity",
    };

    const payload = buildDeliveryOrderPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.transDate).toBe("24/09/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Cust No": "C.00001", Description: "" };
    const columnMapping = { "Cust No": "customerNo", Description: "description" };

    const payload = buildDeliveryOrderPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO dan Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    const isoPayload = buildDeliveryOrderPayload([{ "Cust No": "C.001", "Trans Date": "2026-09-24" }], {
      "Cust No": "customerNo",
      "Trans Date": "transDate",
    });
    expect(isoPayload.transDate).toBe("24/09/2026");

    // 46289 = 24 September 2026 (basis epoch Excel 30 Des 1899)
    const serialPayload = buildDeliveryOrderPayload([{ "Cust No": "C.001", "Trans Date": 46289 }], {
      "Cust No": "customerNo",
      "Trans Date": "transDate",
    });
    expect(serialPayload.transDate).toBe("24/09/2026");
  });

  test("2 baris jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { "Trans Date": "24/09/2026", "Trans No": "DO-001", "Cust No": "C1", "Item No": "BRG-1", "Item Qty": 2 },
      { "Trans Date": "25/09/2026", "Trans No": "DO-001", "Cust No": "C1-BEDA", "Item No": "BRG-2", "Item Qty": 3 },
    ];
    const columnMapping = { "Trans Date": "transDate", "Trans No": "number", "Cust No": "customerNo", "Item No": "itemNo", "Item Qty": "quantity" };
    const payload = buildDeliveryOrderPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("24/09/2026"); // dari baris pertama
    expect(payload.customerNo).toBe("C1"); // dari baris pertama, baris kedua diabaikan
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });

  test("§ Fase 158 — 'Sales Order Detail ID' dipetakan MANUAL mengalir normal ke payload (override, auto-resolve terjadi di worker bukan di sini)", () => {
    const rawRow = { "Cust No": "C.001", "Item No": "BRG-1", "Sales Order Detail ID": "120" };
    const columnMapping = { "Cust No": "customerNo", "Item No": "itemNo", "Sales Order Detail ID": "salesOrderDetailId" };

    const payload = buildDeliveryOrderPayload([rawRow], columnMapping);
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.salesOrderDetailId).toBe("120");
  });

  test("Serial Num + Qty + Exp Date dirangkai jadi 1 entri detailSerialNumber[]", () => {
    const rawRow = { "Item No": "BRG-1", "Serial Num": "SN-001", "Serial Num Qty": 3, "Serial Num Exp Date": "2027-01-01" };
    const columnMapping = { "Item No": "itemNo", "Serial Num": "serialNum", "Serial Num Qty": "serialNumQty", "Serial Num Exp Date": "serialNumExpDate" };

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailSerialNumber).toEqual([{ serialNumberNo: "SN-001", quantity: 3, expiredDate: "01/01/2027" }]);
  });

  test("tanpa Serial Num, detailSerialNumber TIDAK muncul sama sekali", () => {
    const rawRow = { "Item No": "BRG-1" };
    const columnMapping = { "Item No": "itemNo" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailSerialNumber).toBeUndefined();
  });
});

// § grouping DEFAULT ADR-0011 by "number" (Trans No), OPSIONAL — kosong
// = 1 baris = 1 dokumen sendiri. BEDA dari Receive Item yang wajib.
describe("groupDeliveryOrderRows", () => {
  const columnMapping = { "Trans No": "number", "Cust No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Trans No sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Trans No": "DO-001", "Cust No": "C1" }),
      row("2", { "Trans No": "DO-001", "Cust No": "C1" }),
      row("3", { "Trans No": "DO-002", "Cust No": "C1" }),
    ];
    const groups = groupDeliveryOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
    expect(groups[0]!.groupColumn).toBe("Trans No");
  });

  test("Trans No kosong -> tetap jadi grup sendiri per baris (BEDA Receive Item, di sini itu SAH bukan pengecualian)", () => {
    const rows = [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C1" })];
    const groups = groupDeliveryOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1 && g.groupKey === null)).toBe(true);
  });

  test("Trans No sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "Trans No": " do-001 " }), row("2", { "Trans No": "DO-001" })];
    const groups = groupDeliveryOrderRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Cust No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "DO-001", groupColumn: "Trans No", rows: [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("DO-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "DO-001", groupColumn: "Trans No", rows: [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Cust No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });
});

describe("extractDataClassificationValues (khusus CLS2/CLS5, § tidak ada versi header)", () => {
  test("ambil index 2 dan 5 yang terisi, skip yang kosong", () => {
    const rawRow = { CLS2_1: "KATKEG 2", CLS5_1: "" };
    const columnMapping = { CLS2_1: "attribut2", CLS5_1: "attribut5" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 2, name: "KATKEG 2" }]);
  });
});

describe("defaultColumnMap — TIDAK ada auto-suggest untuk CLS2/CLS5 (§ ambiguitas header vs item, lihat komentar file)", () => {
  test("kunci 'CLS2'/'CLS5' polos TIDAK ada di defaultColumnMap", () => {
    expect(deliveryOrderMapping.defaultColumnMap["CLS2"]).toBeUndefined();
    expect(deliveryOrderMapping.defaultColumnMap["CLS5"]).toBeUndefined();
  });

  test("field attribut2/attribut5 TETAP bisa dipetakan manual (ada di fieldToAccuratePath)", () => {
    expect(deliveryOrderMapping.fieldToAccuratePath.attribut2).toBe("detailItem.dataClassification2Name");
    expect(deliveryOrderMapping.fieldToAccuratePath.attribut5).toBe("detailItem.dataClassification5Name");
  });
});

describe("requiredFields", () => {
  test("requiredFields memuat field bisnis inti, TIDAK memaksa branchName/number (beda Receive Item)", () => {
    expect(deliveryOrderMapping.requiredFields).toContain("customerNo");
    expect(deliveryOrderMapping.requiredFields).toContain("transDate");
    expect(deliveryOrderMapping.requiredFields).toContain("itemNo");
    expect(deliveryOrderMapping.requiredFields).toContain("quantity");
    expect(deliveryOrderMapping.requiredFields).toContain("itemUnitName");
    expect(deliveryOrderMapping.requiredFields).not.toContain("branchName");
    expect(deliveryOrderMapping.requiredFields).not.toContain("number");
  });
});

// § Fase 158 — logic MURNI auto-resolve Sales Order Detail ID, dites
// TANPA mock HTTP (kandidat dikonstruksi manual, mirror data nyata hasil
// test call `SO-IDR-01` 2026-09-24: 2 baris `itemNo` "9900014" sama, `id`
// 102300/102301 beda).
describe("resolveSalesOrderDetailId", () => {
  const dup = [
    { id: 102300, itemNo: "9900014", dataClassification5Name: "Week 37" },
    { id: 102301, itemNo: "9900014", dataClassification5Name: "Week 38" },
  ];

  test("itemNo cuma muncul 1× di SO -> langsung return id-nya, TIDAK butuh CLS5/week", () => {
    const candidates = [{ id: 500, itemNo: "BRG-1", dataClassification5Name: null }];
    expect(resolveSalesOrderDetailId(candidates, "BRG-1", "SO-001", undefined)).toBe(500);
  });

  test("itemNo TIDAK ditemukan di SO -> lempar error jelas (bukan diam-diam 0/undefined)", () => {
    const candidates = [{ id: 500, itemNo: "BRG-LAIN", dataClassification5Name: null }];
    expect(() => resolveSalesOrderDetailId(candidates, "BRG-1", "SO-001", undefined)).toThrow(/tidak ditemukan/i);
  });

  test("itemNo duplikat + week diisi + cocok tepat 1 -> return id yang benar (mirror kasus nyata SO-IDR-01)", () => {
    expect(resolveSalesOrderDetailId(dup, "9900014", "SO-IDR-01", "Week 37")).toBe(102300);
    expect(resolveSalesOrderDetailId(dup, "9900014", "SO-IDR-01", "Week 38")).toBe(102301);
  });

  test("itemNo duplikat TANPA week -> lempar error minta isi CLS5 (aman, bukan tebak)", () => {
    expect(() => resolveSalesOrderDetailId(dup, "9900014", "SO-IDR-01", undefined)).toThrow(/CLS5/i);
  });

  test("itemNo duplikat + week diisi TAPI tidak cocok satu pun -> lempar error", () => {
    expect(() => resolveSalesOrderDetailId(dup, "9900014", "SO-IDR-01", "Week 99")).toThrow(/tidak ditemukan/i);
  });
});

// § Fase 171 — Sales Order Detail ID otomatis via Atribut Tambahan 1 ("Week", charField1 baris SO) + bersihkan sel. Data = file contoh client
// (`Sample_Format_DO_v8`): SO `SOTES_EKA01`, Item 9900016 di 2 baris SO (Week 1 → 102950, Week 2 → 102901), Item No di Excel `"\n9900016"`.
describe("Fase 171 — resolve Sales Order Detail ID via Item Notes ↔ charField1", () => {
  const so = [
    { id: 102950, itemNo: "9900016", dataClassification5Name: null, charField1: "Week 1" },
    { id: 102901, itemNo: "9900016", dataClassification5Name: null, charField1: "Week 2" },
  ];
  const mapping = {
    "Cust No": "customerNo",
    "Trans Date": "transDate",
    "Item No": "itemNo",
    "Item Qty": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Notes": "itemNotes",
    "Item Sales Order No": "salesOrderNumber",
    "Sales Order Detail ID": "salesOrderDetailId",
    CLS5: "attribut5",
  };
  const rowOf = (extra: Record<string, unknown>) => ({ "Cust No": "CSBY-0005", "Trans Date": "06/10/2026", "Item No": "\n9900016", "Item Qty": 1, "Item Unit Name": "PCS", "Item Sales Order No": "SOTES_EKA01", ...extra });

  test("Item Notes cocok dengan Atribut Tambahan 1 → ID baris SO yang benar (tanpa beda huruf besar-kecil/spasi berlebih)", () => {
    expect(resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, "Week 1")).toBe(102950);
    expect(resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, "  week   2 ")).toBe(102901);
  });

  test("end-to-end data client: 2 baris DO, Item No berbaris-baru dibersihkan, tiap baris dapat ID-nya sendiri, SO dibaca SEKALI", async () => {
    const payload = buildDeliveryOrderPayload([rowOf({ "Item Notes": "Week 1" }), rowOf({ "Item Notes": "Week 2" })], mapping);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items.map((i) => i.itemNo)).toEqual(["9900016", "9900016"]); // "\n9900016" dibersihkan
    let fetched = 0;
    await resolveSalesOrderDetailIdsInPayload(payload, async (n) => {
      fetched++;
      expect(n).toBe("SOTES_EKA01");
      return so;
    });
    expect(fetched).toBe(1);
    expect(items.map((i) => i.salesOrderDetailId)).toEqual([102950, 102901]);
  });

  test("ID manual di kolom Sales Order Detail ID TIDAK ditimpa dan SO tidak dibaca; baris tanpa No SO dilewati", async () => {
    const payload = buildDeliveryOrderPayload([rowOf({ "Sales Order Detail ID": 555 }), rowOf({ "Item Sales Order No": "" })], mapping);
    let fetched = 0;
    await resolveSalesOrderDetailIdsInPayload(payload, async () => {
      fetched++;
      return so;
    });
    expect(fetched).toBe(0);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items[0]!.salesOrderDetailId).toBe(555);
    expect(items[1]!.salesOrderDetailId).toBeUndefined();
  });

  test("gagal jelas: Item No kembar tanpa Item Notes/CLS5; Item Notes tidak cocok; dua baris SO ber-Week sama (ambigu)", () => {
    expect(() => resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, undefined)).toThrow(/Item Notes.*Pilihan yang ada: Week 1, Week 2/s);
    expect(() => resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, "Week 9")).toThrow(/tidak ditemukan/);
    const same = [{ ...so[0]! }, { ...so[1]!, charField1: "Week 1" }];
    expect(() => resolveSalesOrderDetailId(same, "9900016", "SOTES_EKA01", undefined, "Week 1")).toThrow(/ambigu \(2 baris cocok\)/);
  });

  test("CLS5 di Excel diabaikan kalau baris SO tidak punya data CLS5 (bukan pemblokir); kalau SO memakai CLS5, perilaku lama tetap (dicocokkan ke CLS5)", () => {
    expect(resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", "Apa saja", "Week 2")).toBe(102901);
    const withCls = [
      { id: 1, itemNo: "X", dataClassification5Name: "Week 37", charField1: null },
      { id: 2, itemNo: "X", dataClassification5Name: "Week 38", charField1: null },
    ];
    expect(resolveSalesOrderDetailId(withCls, "X", "SO", "Week 38")).toBe(2);
  });

  test("pembersihan sel: spasi/baris baru di ujung semua teks dibuang; sel hanya spasi/baris baru dianggap kosong", () => {
    const payload = buildDeliveryOrderPayload([rowOf({ "Item Notes": "  Week 1\n", "Item Sales Order No": " SOTES_EKA01 \n" })], mapping);
    const item = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(item.detailNotes).toBe("Week 1");
    expect(item.salesOrderNumber).toBe("SOTES_EKA01");
    const blank = buildDeliveryOrderPayload([rowOf({ "Item Notes": " \n " })], mapping);
    expect((blank.detailItem as Record<string, unknown>[])[0]!.detailNotes).toBeUndefined();
  });
});

// § 2026-10-06 — kalimat error dibuat ramah user Excel: menyebut KOLOM yang harus diisi ("Item Notes") dan PILIHAN label yang ada di SO.
describe("Fase 171 — pesan error resolver menampilkan pilihan label", () => {
  const so = [
    { id: 102950, itemNo: "9900016", dataClassification5Name: null, charField1: "Week 1" },
    { id: 102901, itemNo: "9900016", dataClassification5Name: null, charField1: "Week 2" },
  ];
  const message = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    return "";
  };

  test("Item Notes kosong → menyebut kolom 'Item Notes' + pilihan 'Week 1, Week 2' (tanpa istilah teknis sebagai instruksi utama)", () => {
    const m = message(() => resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, undefined));
    expect(m).toContain('Barang "9900016" ada 2× di Sales Order "SOTES_EKA01"');
    expect(m).toContain('Isi kolom "Item Notes" pada baris ini');
    expect(m).toContain("Pilihan yang ada: Week 1, Week 2");
  });

  test("Item Notes tidak cocok → 'tidak ditemukan' + daftar pilihan yang valid (tinggal disalin)", () => {
    const m = message(() => resolveSalesOrderDetailId(so, "9900016", "SOTES_EKA01", undefined, "Week 9"));
    expect(m).toContain('Item Notes "Week 9" tidak ditemukan');
    expect(m).toContain("Week 1, Week 2");
  });

  test("label sama di dua baris SO → ambigu, minta ID manual; baris SO tanpa label terbaca → minta ID manual (bukan teka-teki)", () => {
    const same = [{ ...so[0]! }, { ...so[1]!, charField1: "Week 1" }];
    expect(message(() => resolveSalesOrderDetailId(same, "9900016", "SO", undefined, "Week 1"))).toContain('Isi kolom "Sales Order Detail ID" secara manual');
    const noLabel = [{ ...so[0]!, charField1: null }, { ...so[1]!, charField1: null }];
    expect(message(() => resolveSalesOrderDetailId(noLabel, "9900016", "SO", undefined, undefined))).toContain('isi kolom "Sales Order Detail ID" secara manual');
    expect(message(() => resolveSalesOrderDetailId(noLabel, "9900016", "SO", undefined, "Week 1"))).toContain('"Sales Order Detail ID" secara manual');
  });
});
