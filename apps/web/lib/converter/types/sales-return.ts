import { str, num, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 155, ADR-0038 — port VERBATIM `TYPES.salesreturn` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1187-1245). Merujuk faktur penjualan YANG SUDAH ADA di Accurate (`No_Faktur_Penjualan`) — sama prinsip
// Purchase Return (tidak divalidasi eksistensinya). PENUTUP kategori Sales (4/4) DAN seluruh 16 Varian Konverter.
type SalesReturnLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; wh: string; tax: string; inv: string; project: string; dept: string };
type SalesReturnHead = { ret: string; date: string | null; cust: string; inv: string; wh: string; taxCode: string; taxRate: number; fp: string; cur: string };
type SalesReturnGroup = { head: SalesReturnHead; lines: SalesReturnLine[] };
type SalesReturnCtx = ConverterCtxBase & { order: string[]; groups: Record<string, SalesReturnGroup> };

export const salesReturnType: ConverterType<SalesReturnCtx> = {
  key: "konverter_sales_return",
  label: "Retur Penjualan (Sales Return)",
  needsCurrency: true,
  note:
    "<b>Retur Penjualan.</b> Satu baris = satu item; baris dengan No_Retur sama digabung. <b>No_Faktur_Penjualan " +
    "wajib persis sama</b> dengan nomor faktur penjualan yang SUDAH ADA di Accurate — kalau tidak, retur gagal " +
    "atau tidak terkait. Harga_Satuan = harga bruto per unit sesuai faktur asal. Retur mengembalikan barang ke " +
    "gudang. Total ditulis TERMASUK PPN.",
  headers: ["No_Retur", "Tgl_Retur", "ID_Pelanggan", "No_Faktur_Penjualan", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Satuan", "Gudang", "Kode_Pajak", "Tarif_Pajak", "No_Faktur_Pajak", "Mata_Uang", "Project", "Departemen"],
  examples: [
    ["RJ/2026/001", "2026-01-17", "1001", "DP-BG-011", "AC-Chang", "AC Changhong CS-C09P3", "set", 1, 2300000, "ELEKTRONIK", "T", 11, "", "IDR", "PBT.005", "1000"],
    ["RJ/2026/002", "2026-01-20", "1002", "INV/2026/001", "BRG-001", "HP Model A", "unit", 1, 3500000, "DEPAN", "", 0, "", "IDR", "", ""],
  ],
  sheetName: "Retur Penjualan",
  fileName: "import_retur_penjualan_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_Retur", "Tgl_Retur", "ID_Pelanggan", "No_Faktur_Penjualan", "Kode_Barang", "Kuantitas", "Harga_Satuan"]));
    const groups: Record<string, SalesReturnGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const ret = str(r.No_Retur);
      if (!ret) {
        errors.push("Baris " + ln + ": No_Retur kosong.");
        return;
      }
      const date = normDate(r.Tgl_Retur);
      if (!date) errors.push("Baris " + ln + " (" + ret + "): Tgl_Retur kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pelanggan)) errors.push("Baris " + ln + " (" + ret + "): ID_Pelanggan kosong.");
      const inv = str(r.No_Faktur_Penjualan);
      if (!inv) errors.push("Baris " + ln + " (" + ret + "): No_Faktur_Penjualan kosong (wajib — nomor faktur asal di Accurate).");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + ret + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + ret + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + ret + "): Harga_Satuan tidak valid.");
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (taxCode && taxRate <= 0) warnings.push("Baris " + ln + " (" + ret + "): Kode_Pajak diisi tapi Tarif_Pajak 0 → PPN retur dihitung 0.");
      const cur = str(r.Mata_Uang) || defCur;
      const line: SalesReturnLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, wh: str(r.Gudang), tax: taxCode, inv, project: str(r.Project), dept: str(r.Departemen) };
      const head: SalesReturnHead = { ret, date, cust: str(r.ID_Pelanggan), inv, wh: str(r.Gudang), taxCode, taxRate, fp: str(r.No_Faktur_Pajak), cur };
      if (!groups[ret]) {
        groups[ret] = { head, lines: [] };
        order.push(ret);
      } else {
        const h = groups[ret]!.head;
        if (h.inv !== inv) warnings.push("Retur " + ret + ": No_Faktur_Penjualan berbeda antar baris — header memakai baris pertama, tiap baris tetap menunjuk fakturnya sendiri.");
      }
      groups[ret]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((ret, gi) => {
      const g = ctx.groups[ret]!;
      const h = g.head;
      let subtotal = 0;
      let lines = "";
      g.lines.forEach((l, li) => {
        subtotal += l.qty * l.price;
        lines +=
          '<ITEMLINE operation="Add"><KeyID>' +
          (li + 1) +
          "</KeyID><ITEMNO>" +
          escapeXml(l.itemNo) +
          "</ITEMNO><QUANTITY>" +
          l.qty +
          "</QUANTITY><ITEMUNIT>" +
          escapeXml(l.unit) +
          "</ITEMUNIT><UNITRATIO>1</UNITRATIO>" +
          reserved() +
          "<ITEMOVDESC>" +
          escapeXml(l.desc) +
          "</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES>" +
          escapeXml(l.tax) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><SOSEQ/><BRUTTOUNITPRICE>" +
          l.price +
          "</BRUTTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(l.wh || h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><INVDO/><INVID>" +
          escapeXml(l.inv) +
          "</INVID><DOID/><INVOICESEQ>" +
          (li + 1) +
          "</INVOICESEQ></ITEMLINE>";
      });
      const tax = Math.round(((subtotal * h.taxRate) / 100) * 10000) / 10000;
      const amount = Math.round((subtotal + tax) * 100) / 100;
      const gy = h.date ? h.date.slice(0, 4) : "";
      const gp = h.date ? String(parseInt(h.date.slice(5, 7), 10)) : "";
      body +=
        '<SALESRETURN operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><ARREFUNDID/><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<INVOICENO>" +
        escapeXml(h.ret) +
        "</INVOICENO><INVOICEDATE>" +
        escapeXml(h.date) +
        "</INVOICEDATE><GLYEAR>" +
        gy +
        "</GLYEAR><GLPERIOD>" +
        gp +
        "</GLPERIOD><TAX1ID>" +
        escapeXml(h.taxCode) +
        "</TAX1ID><TAX2ID/><TAX1CODE>" +
        escapeXml(h.taxCode) +
        "</TAX1CODE><TAX2CODE/><TAX1RATE>" +
        h.taxRate +
        "</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>" +
        tax +
        "</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE/><INCLUSIVETAX>0</INCLUSIVETAX><CUSTOMERISTAXABLE/><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>" +
        amount +
        "</INVOICEAMOUNT><DESCRIPTION/><WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><TAXNO>" +
        escapeXml(h.fp) +
        "</TAXNO><CUSTOMERID>" +
        escapeXml(h.cust) +
        "</CUSTOMERID><ARINVOICEID/><SALESINVOICEID>" +
        escapeXml(h.inv) +
        "</SALESINVOICEID><DELIVERYORDERID/><CURRENCYNAME>" +
        escapeXml(h.cur) +
        "</CURRENCYNAME></SALESRETURN>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let total = 0;
    ctx.order.forEach((v) => {
      const g = ctx.groups[v]!;
      const h = g.head;
      totalLines += g.lines.length;
      let sub = 0;
      g.lines.forEach((l) => (sub += l.qty * l.price));
      total += sub + Math.round(((sub * h.taxRate) / 100) * 100) / 100;
    });
    return {
      stats: [
        [ctx.order.length, "Retur"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: fmtMoney(Math.round(total)) + " termasuk PPN — tiap No_Faktur_Penjualan harus sudah ada di Accurate",
      rowCount: totalLines,
    };
  },
};
