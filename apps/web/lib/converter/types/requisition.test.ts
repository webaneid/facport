import { describe, test, expect } from "bun:test";
import { requisitionType } from "./requisition";

// § Fase 151, ADR-0038 — verifikasi kesetaraan Excel/XML dengan app legacy (`tool.html` `TYPES.requisition`,
// instruksi eksplisit user: "pastikan antara excel mereka dan excel yg kamu buat sama, sehingga tidak mengubah
// sama sekali mesin yg sudah ada, hanya mengubah bahasa programing saja"). Fixture di bawah dituliskan ULANG dari
// `examples` legacy (baris 1087-1088 `tool.html`) — bukan cuma dipanggil, supaya angka/isi field terlihat
// eksplisit di test ini, gampang dibandingkan manual kalau ada revisi.
const opts = { branch: "HO", defCurrency: "IDR" };

describe("requisitionType.process — grouping & validasi (mirror tool.html baris 1092-1105)", () => {
  test("1 baris = 1 dokumen, field ter-parse sesuai kolom Excel", () => {
    const rows = [{ No_Permintaan: "09/00004", Tgl_Permintaan: "2026-01-17", Kode_Barang: "AC-Chang", Deskripsi: "AC Changhong CS-C09P3", Satuan: "set", Kuantitas: 5, Catatan: "", Keterangan: "" }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.order).toEqual(["09/00004"]);
    expect(ctx.groups["09/00004"]!.head).toEqual({ req: "09/00004", date: "2026-01-17", desc: "" });
    expect(ctx.groups["09/00004"]!.lines).toEqual([{ itemNo: "AC-Chang", desc: "AC Changhong CS-C09P3", unit: "set", qty: 5, notes: "" }]);
  });

  test("2 baris dengan No_Permintaan SAMA digabung jadi 1 dokumen, 2 ITEMLINE", () => {
    const rows = [
      { No_Permintaan: "09/00005", Tgl_Permintaan: "2026-01-18", Kode_Barang: "SG-40", Deskripsi: "Semen Gresik 40kg", Satuan: "zak", Kuantitas: 100, Catatan: "untuk proyek PBT.005", Keterangan: "Kebutuhan proyek Januari" },
      { No_Permintaan: "09/00005", Tgl_Permintaan: "2026-01-18", Kode_Barang: "PSR-1", Deskripsi: "Pasir 1m3", Satuan: "m3", Kuantitas: 2, Catatan: "", Keterangan: "Kebutuhan proyek Januari" },
    ];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.order).toEqual(["09/00005"]);
    expect(ctx.groups["09/00005"]!.lines.length).toBe(2);
  });

  test("baris dengan No_Permintaan BEDA jadi dokumen terpisah, urutan sesuai kemunculan pertama (order array)", () => {
    const rows = [
      { No_Permintaan: "B", Tgl_Permintaan: "2026-01-01", Kode_Barang: "X", Kuantitas: 1 },
      { No_Permintaan: "A", Tgl_Permintaan: "2026-01-02", Kode_Barang: "Y", Kuantitas: 1 },
    ];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.order).toEqual(["B", "A"]);
  });

  test("Kolom wajib hilang (No_Permintaan/Tgl_Permintaan/Kode_Barang/Kuantitas) → error checkHeaders", () => {
    const rows = [{ No_Permintaan: "X", Kode_Barang: "Y" }]; // tanpa Tgl_Permintaan, Kuantitas
    const ctx = requisitionType.process(rows as Record<string, unknown>[], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
    expect(ctx.errors[0]).toContain("Tgl_Permintaan");
    expect(ctx.errors[0]).toContain("Kuantitas");
  });

  test("No_Permintaan kosong → baris DILEWATI (tidak masuk group manapun), error dicatat", () => {
    const rows = [{ No_Permintaan: "", Tgl_Permintaan: "2026-01-01", Kode_Barang: "X", Kuantitas: 1 }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("No_Permintaan kosong"))).toBe(true);
    expect(ctx.order).toEqual([]);
  });

  test("Tgl_Permintaan format salah → error, TAPI baris TETAP masuk group (beda dari No_Permintaan kosong)", () => {
    const rows = [{ No_Permintaan: "X", Tgl_Permintaan: "17-01-2026-salah", Kode_Barang: "Y", Kuantitas: 1 }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("Tgl_Permintaan kosong/format salah"))).toBe(true);
    expect(ctx.order).toEqual(["X"]);
  });

  test("Kode_Barang kosong → error", () => {
    const rows = [{ No_Permintaan: "X", Tgl_Permintaan: "2026-01-01", Kode_Barang: "", Kuantitas: 1 }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("Kode_Barang kosong"))).toBe(true);
  });

  test("Kuantitas <= 0 atau bukan angka → error, qty di-fallback 0 (bukan NaN, supaya build() tidak rusak)", () => {
    const rows = [{ No_Permintaan: "X", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Y", Kuantitas: 0 }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("Kuantitas tidak valid"))).toBe(true);
    expect(ctx.groups["X"]!.lines[0]!.qty).toBe(0);
  });

  test("Kuantitas format Indonesia (koma desimal) di-parse benar via num()", () => {
    const rows = [{ No_Permintaan: "X", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Y", Kuantitas: "2,5" }];
    const ctx = requisitionType.process(rows, opts);
    expect(ctx.groups["X"]!.lines[0]!.qty).toBe(2.5);
  });
});

describe("requisitionType.build — struktur XML PERSIS mirror tool.html baris 1108-1122", () => {
  test("1 dokumen 1 baris — XML PERSIS sama karakter-per-karakter dengan yang dihasilkan legacy", () => {
    const rows = [{ No_Permintaan: "09/00004", Tgl_Permintaan: "2026-01-17", Kode_Barang: "AC-Chang", Deskripsi: "AC Changhong CS-C09P3", Satuan: "set", Kuantitas: 5, Catatan: "", Keterangan: "" }];
    const ctx = requisitionType.process(rows, { branch: "HO", defCurrency: "IDR" });
    const xml = requisitionType.build(ctx);

    const reservedTags = Array.from({ length: 10 }, (_, i) => `<ITEMRESERVED${i + 1}/>`).join("");
    const expectedItemLine =
      '<ITEMLINE operation="Add"><KeyID>0</KeyID><ITEMNO>AC-Chang</ITEMNO><QUANTITY>5</QUANTITY><ITEMUNIT>set</ITEMUNIT><UNITRATIO>1</UNITRATIO>' +
      reservedTags +
      '<ITEMOVDESC>AC Changhong CS-C09P3</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES/><GROUPSEQ/><REQDATE>2026-01-17</REQDATE><NOTES/></ITEMLINE>';
    const expectedBody =
      '<REQUISITION operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID>' +
      expectedItemLine +
      "<REQNO>09/00004</REQNO><REQDATE>2026-01-17</REQDATE><DESCRIPTION/></REQUISITION>";
    const expectedXml = '<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n";

    expect(xml).toBe(expectedXml);
  });

  test("Catatan/Keterangan terisi → <NOTES> dan <DESCRIPTION> berisi teks (bukan self-closing)", () => {
    const rows = [{ No_Permintaan: "09/00005", Tgl_Permintaan: "2026-01-18", Kode_Barang: "SG-40", Deskripsi: "Semen Gresik 40kg", Satuan: "zak", Kuantitas: 100, Catatan: "untuk proyek PBT.005", Keterangan: "Kebutuhan proyek Januari" }];
    const ctx = requisitionType.process(rows, opts);
    const xml = requisitionType.build(ctx);
    expect(xml).toContain("<NOTES>untuk proyek PBT.005</NOTES>");
    expect(xml).toContain("<DESCRIPTION>Kebutuhan proyek Januari</DESCRIPTION>");
  });

  test("karakter XML terlarang di-escape (Deskripsi/Catatan mengandung & < >)", () => {
    const rows = [{ No_Permintaan: "X", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Y", Deskripsi: 'A & B <test> "quote"', Satuan: "pcs", Kuantitas: 1, Catatan: "" }];
    const ctx = requisitionType.process(rows, opts);
    const xml = requisitionType.build(ctx);
    expect(xml).toContain("A &amp; B &lt;test&gt; &quot;quote&quot;");
    expect(xml).not.toContain("A & B <test>"); // tidak ada yang lolos tanpa escape
  });

  test("2 dokumen — REQUESTID/TRANSACTIONID increment sesuai urutan (gi+1), BUKAN random/UUID", () => {
    const rows = [
      { No_Permintaan: "A", Tgl_Permintaan: "2026-01-01", Kode_Barang: "X", Kuantitas: 1 },
      { No_Permintaan: "B", Tgl_Permintaan: "2026-01-02", Kode_Barang: "Y", Kuantitas: 1 },
    ];
    const ctx = requisitionType.process(rows, opts);
    const xml = requisitionType.build(ctx);
    expect(xml).toContain('REQUESTID="1"');
    expect(xml).toContain('REQUESTID="2"');
    expect(xml.indexOf('REQNO>A<')).toBeLessThan(xml.indexOf('REQNO>B<'));
  });
});

describe("requisitionType.summary — mirror tool.html baris 1124-1128", () => {
  test("stats: [jumlah permintaan, total baris item, error, warning], totals bilang 'dokumen internal'", () => {
    const rows = [
      { No_Permintaan: "A", Tgl_Permintaan: "2026-01-01", Kode_Barang: "X", Kuantitas: 1 },
      { No_Permintaan: "A", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Z", Kuantitas: 2 },
      { No_Permintaan: "B", Tgl_Permintaan: "2026-01-02", Kode_Barang: "Y", Kuantitas: 1 },
    ];
    const ctx = requisitionType.process(rows, opts);
    const summary = requisitionType.summary(ctx);
    expect(summary.stats).toEqual([
      [2, "Permintaan"],
      [3, "Baris item"],
      [0, "Error"],
      [0, "Peringatan"],
    ]);
    expect(summary.totals).toBe("2 permintaan barang — dokumen internal, tidak menyentuh stok/jurnal.");
    expect(summary.rowCount).toBe(3);
  });
});

describe("requisitionType — metadata (headers/examples/file) mirror tool.html EXACT", () => {
  test("headers PERSIS sama urutan & nama dengan sheet template legacy", () => {
    expect(requisitionType.headers).toEqual(["No_Permintaan", "Tgl_Permintaan", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Catatan", "Keterangan"]);
  });

  test("moduleKey cocok entri MODULE_CATALOG (konverter_requisition)", () => {
    expect(requisitionType.key).toBe("konverter_requisition");
  });

  test("needsCurrency false — dokumen internal, tidak pakai mata uang", () => {
    expect(requisitionType.needsCurrency).toBe(false);
  });
});
