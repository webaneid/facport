import { str, num, normDate, escapeXml, envelope, checkHeaders } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 156, ADR-0038 — port VERBATIM `TYPES.stdcost` dari `/Users/webane/sites/konverter/tool.html`
// (baris 560-593). PENUTUP seluruh 16 Varian Konverter. SATU-SATUNYA tipe yang BUKAN transaksi (update data
// master barang yang SUDAH ADA — Harga Pokok Standar & 5 tingkat Harga Jual), dan SATU-SATUNYA yang pakai
// `items` (flat, TANPA grouping per dokumen) bukan `order`/`groups` (§ `ConverterCtxBase`, `converterHasData`).
// Semua baris masuk 1 transaksi `MATERIALSTANDARDCOST` tunggal — TIDAK ada konsep "banyak dokumen" di tipe ini.
type StandardCostItem = { itemNo: string; std: number; p1: number; p2: number; p3: number; p4: number; p5: number };
type StandardCostCtx = ConverterCtxBase & { items: StandardCostItem[]; eff: string | null };

export const standardCostType: ConverterType<StandardCostCtx> = {
  key: "konverter_standard_cost",
  label: "Update Harga Pokok Standar & Harga Jual",
  needsCurrency: false,
  note:
    "<b>Update Harga Standar.</b> Memperbarui harga pokok standar dan daftar harga jual (Harga_Jual_1–5) barang " +
    "yang <b>sudah ada</b> di Accurate. Tidak membuat barang baru, tidak ada pajak. Semua baris masuk dalam " +
    "satu transaksi. <b>Tgl_Berlaku</b> opsional (dibaca dari baris pertama yang terisi) = tanggal efektif " +
    "pembaruan harga; kosongkan untuk memakai default Accurate.",
  headers: ["Kode_Barang", "Harga_Pokok_Standar", "Harga_Jual_1", "Harga_Jual_2", "Harga_Jual_3", "Harga_Jual_4", "Harga_Jual_5", "Tgl_Berlaku"],
  examples: [
    ["CB", 6500, 7500, 0, 0, 0, 0, "2026-01-15"],
    ["RK", 5000, 7500, 0, 0, 0, 0, ""],
    ["DB", 16000, 17500, 0, 0, 0, 0, ""],
  ],
  sheetName: "Harga Standar",
  fileName: "import_harga_standar_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const items: StandardCostItem[] = [];
    const seen: Record<string, boolean> = {};
    errors.push(...checkHeaders(rows, ["Kode_Barang", "Harga_Pokok_Standar"]));
    rows.forEach((r, i) => {
      const ln = i + 2;
      const itemNo = str(r.Kode_Barang);
      if (!itemNo) {
        errors.push("Baris " + ln + ": Kode_Barang kosong.");
        return;
      }
      if (seen[itemNo]) warnings.push("Baris " + ln + ": Kode_Barang '" + itemNo + "' muncul lebih dari sekali — baris terakhir yang dipakai Accurate.");
      seen[itemNo] = true;
      const std = num(r.Harga_Pokok_Standar);
      if (isNaN(std) || std < 0) errors.push("Baris " + ln + " (" + itemNo + "): Harga_Pokok_Standar tidak valid.");
      const p = [1, 2, 3, 4, 5].map((k) => {
        let v = num(r["Harga_Jual_" + k]);
        if (isNaN(v)) v = 0;
        if (v < 0) errors.push("Baris " + ln + " (" + itemNo + "): Harga_Jual_" + k + " negatif.");
        return v;
      });
      items.push({ itemNo, std: isNaN(std) ? 0 : std, p1: p[0]!, p2: p[1]!, p3: p[2]!, p4: p[3]!, p5: p[4]! });
    });
    let eff: string | null = null;
    rows.some((r) => {
      const d = normDate(r.Tgl_Berlaku);
      if (d) {
        eff = d;
        return true;
      }
      return false;
    });
    return { errors, warnings, branch: opts.branch, items, eff };
  },

  build(ctx) {
    let det = "";
    ctx.items.forEach((it) => {
      det +=
        '<MATERIALSTDCOSTDET operation="Add"><ITEMNO>' +
        escapeXml(it.itemNo) +
        "</ITEMNO><STANDARDCOST>" +
        it.std +
        "</STANDARDCOST><PRICE1>" +
        it.p1 +
        "</PRICE1><PRICE2>" +
        it.p2 +
        "</PRICE2><PRICE3>" +
        it.p3 +
        "</PRICE3><PRICE4>" +
        it.p4 +
        "</PRICE4><PRICE5>" +
        it.p5 +
        "</PRICE5></MATERIALSTDCOSTDET>";
    });
    const inner =
      '<MATERIALSTANDARDCOST operation="Add" REQUESTID="1"><ID>1</ID><TRANSACTIONID>1</TRANSACTIONID>' +
      det +
      "<STANDARDNO/>" +
      (ctx.eff ? "<STANDARDDATE>" + ctx.eff + "</STANDARDDATE><EFFECTIVEDATE>" + ctx.eff + "</EFFECTIVEDATE>" : "<STANDARDDATE/><EFFECTIVEDATE/>") +
      "<DESCRIPTION/></MATERIALSTANDARDCOST>";
    return envelope(ctx.branch, inner);
  },

  summary(ctx) {
    return {
      stats: [
        [ctx.items.length, "Barang"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: ctx.items.length + " barang akan diperbarui harga pokok & jualnya.",
      rowCount: ctx.items.length,
    };
  },
};
