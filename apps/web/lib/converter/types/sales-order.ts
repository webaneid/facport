import { str, num, flag1, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 155, ADR-0038 — port VERBATIM `TYPES.salesorder` dari `/Users/webane/sites/konverter/tool.html`
// (baris 735-792). Pesanan BELUM membebani stok/jurnal (§ note legacy, sama prinsip Purchase Order).
type SalesOrderLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; project: string; dept: string };
type SalesOrderHead = {
  so: string;
  date: string | null;
  cust: string;
  cur: string;
  rate: number;
  taxable: 0 | 1;
  taxCode: string;
  taxRate: number;
  inclusive: 0 | 1;
  terms: string;
  dp: number;
  dpAcc: string;
  estShip: string | null;
  pono: string;
};
type SalesOrderGroup = { head: SalesOrderHead; lines: SalesOrderLine[] };
type SalesOrderCtx = ConverterCtxBase & { order: string[]; groups: Record<string, SalesOrderGroup> };

export const salesOrderType: ConverterType<SalesOrderCtx> = {
  key: "konverter_sales_order",
  label: "Sales Order (Pesanan Penjualan)",
  needsCurrency: true,
  note: "<b>Sales Order.</b> Satu baris = satu item; baris dengan No_SO sama digabung. Pesanan belum membebani stok/jurnal. Uang muka opsional (Uang_Muka + Akun_Uang_Muka). Pelanggan harus sudah ada di Accurate.",
  headers: ["No_SO", "Tgl_SO", "ID_Pelanggan", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Satuan", "Kena_Pajak", "Kode_Pajak", "Tarif_Pajak", "Pajak_Inklusif", "Termin", "Uang_Muka", "Akun_Uang_Muka", "Tgl_Estimasi_Kirim", "No_PO_Pelanggan", "Mata_Uang", "Kurs", "Project", "Departemen"],
  examples: [
    ["SO/2026/001", "2026-01-27", "1001", "FG-0047", "Office Inspire", "unit", 1, 50000000, 1, "T", 11, 0, "2/10 n/30", 30000000, "2102-001", "2026-02-10", "PO-123", "IDR", 1, "PBT.005", "1000"],
    ["SO/2026/002", "2026-01-28", "1002", "FG-0050", "Meja Kantor", "unit", 5, 2000000, 1, "T", 11, 0, "NET 30", 0, "", "2026-02-05", "", "IDR", 1, "", ""],
  ],
  sheetName: "Sales Order",
  fileName: "import_sales_order_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_SO", "Tgl_SO", "ID_Pelanggan", "Kode_Barang", "Kuantitas", "Harga_Satuan"]));
    const groups: Record<string, SalesOrderGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const so = str(r.No_SO);
      if (!so) {
        errors.push("Baris " + ln + ": No_SO kosong.");
        return;
      }
      const date = normDate(r.Tgl_SO);
      if (!date) errors.push("Baris " + ln + " (" + so + "): Tgl_SO kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pelanggan)) errors.push("Baris " + ln + " (" + so + "): ID_Pelanggan kosong.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + so + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + so + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + so + "): Harga_Satuan tidak valid.");
      const taxable = flag1(r.Kena_Pajak);
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (!str(r.Kena_Pajak)) warnings.push("Baris " + ln + " (" + so + "): Kena_Pajak kosong → dianggap TIDAK kena pajak.");
      let dp = num(r.Uang_Muka);
      if (isNaN(dp) || dp < 0) dp = 0;
      const dpAcc = str(r.Akun_Uang_Muka);
      if (dp > 0 && !dpAcc) warnings.push("SO " + so + ": Uang_Muka diisi tapi Akun_Uang_Muka kosong.");
      const cur = str(r.Mata_Uang) || defCur;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const line: SalesOrderLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, project: str(r.Project), dept: str(r.Departemen) };
      const head: SalesOrderHead = { so, date, cust: str(r.ID_Pelanggan), cur, rate, taxable, taxCode, taxRate, inclusive: flag1(r.Pajak_Inklusif), terms: str(r.Termin), dp, dpAcc, estShip: normDate(r.Tgl_Estimasi_Kirim), pono: str(r.No_PO_Pelanggan) };
      if (!groups[so]) {
        groups[so] = { head, lines: [] };
        order.push(so);
      } else {
        const h = groups[so]!.head;
        if (h.cust !== head.cust || h.date !== head.date || h.cur !== head.cur) warnings.push("SO " + so + ": data order berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[so]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((so, gi) => {
      const g = ctx.groups[so]!;
      const h = g.head;
      let subtotal = 0;
      let lines = "";
      const tc = h.taxable ? h.taxCode : "";
      g.lines.forEach((l, li) => {
        subtotal += l.qty * l.price;
        lines +=
          '<ITEMLINE operation="Add"><KeyID>' +
          li +
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
          "</ITEMOVDESC><UNITPRICE>" +
          l.price +
          "</UNITPRICE><DISCPC/><TAXCODES>" +
          escapeXml(tc) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><QTYSHIPPED>0</QTYSHIPPED></ITEMLINE>";
      });
      const tax = h.taxable ? Math.round((h.inclusive ? (subtotal * h.taxRate) / (100 + h.taxRate) : (subtotal * h.taxRate) / 100) * 10000) / 10000 : 0;
      body +=
        '<SALESORDER operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<SONO>" +
        escapeXml(h.so) +
        "</SONO><SODATE>" +
        escapeXml(h.date) +
        "</SODATE><TAX1ID>" +
        escapeXml(tc) +
        "</TAX1ID><TAX1CODE>" +
        escapeXml(tc) +
        "</TAX1CODE><TAX2CODE/><TAX1RATE>" +
        (h.taxable ? h.taxRate : 0) +
        "</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>" +
        tax +
        "</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE>" +
        h.rate +
        "</RATE><TAXINCLUSIVE>" +
        h.inclusive +
        "</TAXINCLUSIVE><CUSTOMERISTAXABLE>" +
        (h.taxable ? 1 : 0) +
        "</CUSTOMERISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><FREIGHT>0</FREIGHT><TERMSID>" +
        escapeXml(h.terms) +
        "</TERMSID><FOB/><ESTSHIPDATE>" +
        escapeXml(h.estShip || h.date) +
        "</ESTSHIPDATE><DESCRIPTION/><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><DP>" +
        h.dp +
        "</DP><DPACCOUNTID>" +
        escapeXml(h.dpAcc) +
        "</DPACCOUNTID><DPUSED/><CUSTOMERID>" +
        escapeXml(h.cust) +
        "</CUSTOMERID><PONO>" +
        escapeXml(h.pono) +
        "</PONO><CURRENCYNAME>" +
        escapeXml(h.cur) +
        "</CURRENCYNAME></SALESORDER>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    const byCur: Record<string, number> = {};
    ctx.order.forEach((so) => {
      const g = ctx.groups[so]!;
      const h = g.head;
      totalLines += g.lines.length;
      let sub = 0;
      g.lines.forEach((l) => (sub += l.qty * l.price));
      const tax = h.taxable ? (h.inclusive ? 0 : Math.round((sub * h.taxRate) / 100)) : 0;
      byCur[h.cur] = (byCur[h.cur] ?? 0) + (h.inclusive ? sub : sub + tax);
    });
    return {
      stats: [
        [ctx.order.length, "Sales Order"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: Object.keys(byCur).map((c) => fmtMoney(byCur[c]!) + " " + c + " (termasuk PPN)").join(" · "),
      rowCount: totalLines,
    };
  },
};
