import { str, num, flag1, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 155, ADR-0038 — port VERBATIM `TYPES.salesinvoice` dari `/Users/webane/sites/konverter/tool.html`
// (baris 497-559). Tipe PALING KOMPLEKS dari 16: multi-currency, pajak inklusif/eksklusif, DAN kasus khusus
// "Saldo Awal" (`Saldo_Awal=1` → pajak dimatikan otomatis, Kode_Barang/Deskripsi default "0"/"Opening Balance"
// kalau kosong). INVOICEAMOUNT TERMASUK PPN (sama prinsip Purchase Invoice).
type SalesInvoiceLine = { itemNo: string; desc: string; qty: number; price: number; wh: string; project: string; dept: string };
type SalesInvoiceHead = {
  inv: string;
  date: string | null;
  cust: string;
  ar: string;
  cur: string;
  rate: number;
  taxable: 0 | 1;
  taxCode: string;
  taxRate: number;
  inclusive: 0 | 1;
  terms: string;
  fp: string;
  fpCode: string;
  wh: string;
  isOB: 0 | 1;
};
type SalesInvoiceGroup = { head: SalesInvoiceHead; lines: SalesInvoiceLine[] };
type SalesInvoiceCtx = ConverterCtxBase & { order: string[]; groups: Record<string, SalesInvoiceGroup> };

export const salesInvoiceType: ConverterType<SalesInvoiceCtx> = {
  key: "konverter_sales_invoice",
  label: "Faktur Penjualan (Sales Invoice)",
  needsCurrency: true,
  note:
    "<b>Faktur Penjualan.</b> Satu baris = satu item; baris dengan No_Faktur sama digabung jadi satu faktur. " +
    "INVOICEAMOUNT dihitung TERMASUK PPN (DPP + pajak; kalau Pajak_Inklusif=1, harga dianggap sudah termasuk). " +
    "Untuk saldo awal piutang, isi kolom Saldo_Awal=1 — pajak otomatis dimatikan.",
  headers: ["No_Faktur", "Tgl_Faktur", "ID_Pelanggan", "Kode_Barang", "Deskripsi", "Kuantitas", "Harga_Satuan", "Akun_Piutang", "Gudang", "Mata_Uang", "Kurs", "Kena_Pajak", "Kode_Pajak", "Tarif_Pajak", "Pajak_Inklusif", "Termin", "No_Faktur_Pajak", "Kode_Faktur_Pajak", "Saldo_Awal", "Project", "Departemen"],
  examples: [
    ["INV/2026/001", "2026-01-15", "1001", "BRG-001", "HP Model A", 2, 3500000, "1103-001", "DEPAN", "IDR", 1, 1, "T", 11, 0, "NET 30", "", "", 0, "PRJ-01", "DEPT-01"],
    ["INV/2026/001", "2026-01-15", "1001", "BRG-002", "Casing", 3, 50000, "1103-001", "DEPAN", "IDR", 1, 1, "T", 11, 0, "NET 30", "", "", 0, "PRJ-01", "DEPT-01"],
    ["OB-2001", "2026-01-01", "2001", "0", "Opening Balance", 1, 15000000, "1103-001", "DEPAN", "IDR", 1, 0, "", 0, 0, "C.O.D", "", "", 1, "", ""],
  ],
  sheetName: "Faktur Penjualan",
  fileName: "import_faktur_penjualan_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_Faktur", "Tgl_Faktur", "ID_Pelanggan", "Kode_Barang", "Kuantitas", "Harga_Satuan", "Akun_Piutang"]));
    const groups: Record<string, SalesInvoiceGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const inv = str(r.No_Faktur);
      if (!inv) {
        errors.push("Baris " + ln + ": No_Faktur kosong.");
        return;
      }
      const date = normDate(r.Tgl_Faktur);
      if (!date) errors.push("Baris " + ln + " (" + inv + "): Tgl_Faktur kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pelanggan)) errors.push("Baris " + ln + " (" + inv + "): ID_Pelanggan kosong.");
      if (!str(r.Akun_Piutang)) errors.push("Baris " + ln + " (" + inv + "): Akun_Piutang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + inv + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + inv + "): Harga_Satuan tidak valid.");
      const isOB = flag1(r.Saldo_Awal);
      let taxable = flag1(r.Kena_Pajak);
      let taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      let fp = str(r.No_Faktur_Pajak);
      let fpCode = str(r.Kode_Faktur_Pajak);
      if (isOB) {
        if (taxable) warnings.push("Baris " + ln + " (" + inv + "): Saldo Awal — pajak dimatikan otomatis.");
        taxable = 0;
        taxCode = "";
        taxRate = 0;
        fp = "";
        fpCode = "";
      } else if (!str(r.Kena_Pajak)) {
        warnings.push("Baris " + ln + " (" + inv + "): Kena_Pajak kosong → dianggap TIDAK kena pajak.");
      } else if (taxable && taxRate <= 0) {
        warnings.push("Baris " + ln + " (" + inv + "): kena pajak tapi Tarif_Pajak 0.");
      }
      let itemNo = str(r.Kode_Barang);
      let desc = str(r.Deskripsi);
      if (isOB) {
        if (!itemNo) itemNo = "0";
        if (!desc) desc = "Opening Balance";
      } else if (!itemNo) {
        errors.push("Baris " + ln + " (" + inv + "): Kode_Barang kosong.");
      }
      const cur = str(r.Mata_Uang) || defCur;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const wh = str(r.Gudang);
      const line: SalesInvoiceLine = { itemNo, desc, qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, wh, project: str(r.Project), dept: str(r.Departemen) };
      const head: SalesInvoiceHead = { inv, date, cust: str(r.ID_Pelanggan), ar: str(r.Akun_Piutang), cur, rate, taxable, taxCode, taxRate, inclusive: flag1(r.Pajak_Inklusif), terms: str(r.Termin), fp, fpCode, wh, isOB };
      if (!groups[inv]) {
        groups[inv] = { head, lines: [] };
        order.push(inv);
      } else {
        const h = groups[inv]!.head;
        if (h.cust !== head.cust || h.date !== head.date || h.cur !== head.cur) warnings.push("Faktur " + inv + ": data faktur berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[inv]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((inv, gi) => {
      const g = ctx.groups[inv]!;
      const h = g.head;
      let subtotal = 0;
      let lines = "";
      g.lines.forEach((l, li) => {
        subtotal += l.qty * l.price;
        const unitPrice = h.inclusive && h.taxable && h.taxRate > 0 ? Math.round((l.price / (1 + h.taxRate / 100)) * 10000) / 10000 : l.price;
        lines +=
          '<ITEMLINE operation="Add"><KeyID>' +
          (li + 1) +
          "</KeyID><ITEMNO>" +
          escapeXml(l.itemNo) +
          "</ITEMNO><QUANTITY>" +
          l.qty +
          "</QUANTITY><ITEMUNIT/><UNITRATIO>1</UNITRATIO>" +
          reserved() +
          "<ITEMOVDESC>" +
          escapeXml(l.desc) +
          "</ITEMOVDESC><UNITPRICE>" +
          unitPrice +
          "</UNITPRICE><ITEMDISCPC/><TAXCODES>" +
          escapeXml(h.taxable ? h.taxCode : "") +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><SOSEQ/><BRUTOUNITPRICE>" +
          l.price +
          "</BRUTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(l.wh || h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><DOSEQ/><DOID/></ITEMLINE>";
      });
      const amount = h.inclusive ? subtotal : subtotal + (h.taxable && !h.inclusive ? Math.round((subtotal * h.taxRate) / 100) : 0);
      body +=
        '<SALESINVOICE operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<INVOICENO>" +
        escapeXml(h.inv) +
        "</INVOICENO><INVOICEDATE>" +
        escapeXml(h.date) +
        "</INVOICEDATE><TAX1ID>" +
        escapeXml(h.taxCode) +
        "</TAX1ID><TAX1CODE>" +
        escapeXml(h.taxCode) +
        "</TAX1CODE><TAX2CODE/><TAX1RATE>" +
        h.taxRate +
        "</TAX1RATE><TAX2RATE>0</TAX2RATE><RATE>" +
        h.rate +
        "</RATE><INCLUSIVETAX>" +
        h.inclusive +
        "</INCLUSIVETAX><CUSTOMERISTAXABLE>" +
        h.taxable +
        "</CUSTOMERISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>" +
        amount +
        "</INVOICEAMOUNT><FREIGHT>0</FREIGHT><TERMSID>" +
        escapeXml(h.terms) +
        "</TERMSID><FOB/><PURCHASEORDERNO/><WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><DESCRIPTION>" +
        escapeXml(h.isOB ? "Customer Opening Balance " + h.cust : "") +
        "</DESCRIPTION><SHIPDATE>" +
        escapeXml(h.date) +
        "</SHIPDATE><DELIVERYORDER/><FISCALRATE>" +
        h.rate +
        "</FISCALRATE><TAXDATE>" +
        escapeXml(h.date) +
        "</TAXDATE><CUSTOMERID>" +
        escapeXml(h.cust) +
        "</CUSTOMERID><PRINTED>0</PRINTED><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><ARACCOUNT>" +
        escapeXml(h.ar) +
        "</ARACCOUNT><TAXFORMNUMBER>" +
        escapeXml(h.fp) +
        "</TAXFORMNUMBER><TAXFORMCODE>" +
        escapeXml(h.fpCode) +
        "</TAXFORMCODE><CURRENCYNAME>" +
        escapeXml(h.cur) +
        "</CURRENCYNAME><AUTOMATICINSERTGROUPING/></SALESINVOICE>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    const byCur: Record<string, number> = {};
    ctx.order.forEach((inv) => {
      const g = ctx.groups[inv]!;
      const h = g.head;
      totalLines += g.lines.length;
      let a = 0;
      g.lines.forEach((l) => (a += l.qty * l.price));
      const tx = h.taxable && !h.inclusive ? Math.round((a * h.taxRate) / 100) : 0;
      byCur[h.cur] = (byCur[h.cur] ?? 0) + (h.inclusive ? a : a + tx);
    });
    return {
      stats: [
        [ctx.order.length, "Faktur"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: Object.keys(byCur).map((c) => fmtMoney(byCur[c]!) + " " + c + " (termasuk PPN)").join(" · "),
      rowCount: totalLines,
    };
  },
};
