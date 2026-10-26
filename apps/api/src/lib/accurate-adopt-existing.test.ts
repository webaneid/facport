import { describe, test, expect } from "bun:test";
import { AccurateApiError } from "./accurate";
import { ADOPTED_NOTE_PREFIX, isDuplicateNumberError, matchExistingSalesInvoice, type SentInvoiceLine } from "./accurate-adopt-existing";
import type { ExistingSalesInvoice } from "./accurate-sales-invoice";

const sentLine = (itemNo: string, quantity: number, unitPrice = 0): SentInvoiceLine => ({ itemNo, quantity, unitPrice });
const saved = (id: number, itemNo: string, quantity: number, unitPrice = 0) => ({ id, itemNo, quantity, unitPrice });

// pola nyata Tuparev: 6 dikirim, 9 kembali (tiap PKT diikuti baris NP berharga 0)
const sent6 = [sentLine("A004", 15), sentLine("PKT014", 15, 58558.5586), sentLine("A003", 15), sentLine("PKT013", 15, 54054.0541), sentLine("PKT018", 9, 58558.5586), sentLine("A009", 9)];
const existing9: ExistingSalesInvoice = {
  id: 5001,
  number: "Tiktok/Tuparev/3010-003",
  customerNo: "TIKTOK",
  detailItem: [saved(1, "A004", 15), saved(2, "PKT014", 15, 58558.56), saved(3, "NP0014", 15), saved(4, "A003", 15), saved(5, "PKT013", 15, 54054.05), saved(6, "NP0013", 15), saved(7, "PKT018", 9, 58558.56), saved(8, "NP0018", 9), saved(9, "A009", 9)],
};
const rowIds = ["r0", "r1", "r2", "r3", "r4", "r5"];
const base = { rowIds, number: "Tiktok/Tuparev/3010-003", customerNo: "TIKTOK", sent: sent6, existing: existing9 };

describe("matchExistingSalesInvoice — faktur yang sudah ada di Accurate dikenali", () => {
  test("pola nyata Tuparev (6 dikirim, 9 di Accurate) → ditautkan; id tiap baris = id baris ASLI (bukan baris NP); keterangan menyebut 3 baris otomatis", () => {
    const r = matchExistingSalesInvoice(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invoiceId).toBe(5001);
    expect(r.rows.map((x) => x.detailItemId)).toEqual([1, 2, 4, 5, 7, 9]);
    expect(r.note.startsWith(ADOPTED_NOTE_PREFIX)).toBe(true);
    expect(r.note).toContain("3 baris tambahan otomatis");
    expect(r.note).toContain("Tiktok/Tuparev/3010-003");
  });

  test("tanpa baris tambahan & huruf besar/kecil pada nomor/Customer tidak membedakan", () => {
    const r = matchExistingSalesInvoice({
      rowIds: ["a"],
      number: "inv-1",
      customerNo: "cust",
      sent: [sentLine("X", 2, 100)],
      existing: { id: 1, number: "INV-1", customerNo: "CUST", detailItem: [saved(9, "X", 2, 100)] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.note).not.toContain("baris tambahan");
  });

  test("harga dibulatkan Accurate (selisih ≤ Rp1) tetap dianggap sama — sudah tercakup pola nyata di atas (58558.5586 vs 58558.56)", () => {
    expect(matchExistingSalesInvoice(base).ok).toBe(true);
  });
});

describe("matchExistingSalesInvoice — yang TIDAK boleh ditautkan", () => {
  const rejects = (over: Partial<Parameters<typeof matchExistingSalesInvoice>[0]>, reason: RegExp) => {
    const r = matchExistingSalesInvoice({ ...base, ...over });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(reason);
      expect(r.message).toContain("Facport tidak menautkannya"); // jelaskan, jangan diam
    }
  };

  test("kuantitas berbeda", () => rejects({ sent: sent6.map((l, i) => (i === 4 ? { ...l, quantity: 99 } : l)) }, /kuantitas PKT018 di Accurate 9, di file 99/));
  test("harga berbeda lebih dari pembulatan", () => rejects({ sent: sent6.map((l, i) => (i === 1 ? { ...l, unitPrice: 60000 } : l)) }, /harga PKT014/));
  test("Customer berbeda", () => rejects({ customerNo: "GOFOOD" }, /Customer di Accurate "TIKTOK", di file "GOFOOD"/));
  test("nomor faktur berbeda", () => rejects({ number: "Tiktok/Tuparev/3010-001" }, /nomor tidak cocok/));
  test("barang pada file tidak ada di faktur", () => rejects({ sent: [...sent6.slice(0, 5), sentLine("ZZZ", 1)] }, /daftar barang tidak cocok/));

  test("baris tambahan berkode SAMA dengan baris yang dikirim → ambigu → tidak ditautkan", () => {
    const existing = { ...existing9, detailItem: [...existing9.detailItem, saved(10, "A003", 1)] };
    rejects({ existing }, /daftar barang tidak cocok/);
  });

  test("file berisi SEBAGIAN item dari faktur yang memakai nomor sama (baris tambahan > baris dikirim) → tidak ditautkan", () => {
    const eight = { ...existing9, detailItem: [saved(1, "A004", 15), saved(2, "X1", 1), saved(3, "X2", 1), saved(4, "X3", 1), saved(5, "X4", 1), saved(6, "X5", 1), saved(7, "X6", 1), saved(8, "A009", 9)] };
    rejects({ rowIds: ["r0", "r1"], sent: [sentLine("A004", 15), sentLine("A009", 9)], existing: eight }, /jauh lebih banyak/);
  });

  test("jumlah baris tidak lengkap (rowIds ≠ baris dikirim)", () => rejects({ rowIds: ["r0"] }, /baris tidak lengkap/));
});

describe("isDuplicateNumberError", () => {
  test("hanya galat Accurate 'Sudah ada data lain dengan …'", () => {
    expect(isDuplicateNumberError(new AccurateApiError("Sudah ada data lain dengan Tiktok/Tuparev/3010-003", 200))).toBe(true);
    expect(isDuplicateNumberError(new AccurateApiError("Pemasok tidak ditemukan", 200))).toBe(false);
    expect(isDuplicateNumberError(new Error("Sudah ada data lain dengan X"))).toBe(false); // bukan AccurateApiError
  });
});
