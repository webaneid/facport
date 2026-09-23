import { str, num, flag1, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 154, ADR-0038 — port VERBATIM `TYPES.purchaseinvoice` dari `/Users/webane/sites/konverter/tool.html`
// (baris 675-734). BEDA dari `purchase_invoice` Facport (modul terpisah, API Accurate Online) — ini versi
// Accurate DESKTOP (XML `PURCHASEINVOICE`), TIDAK ADA hubungan/reuse kode dengan modul Facport. INVOICEAMOUNT =
// total TERMASUK PPN (§ note legacy).
type PurchaseInvoiceLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; project: string; dept: string };
type PurchaseInvoiceHead = {
  inv: string;
  seqno: string;
  date: string | null;
  vendor: string;
  ap: string;
  wh: string;
  cur: string;
  rate: number;
  taxable: 0 | 1;
  taxCode: string;
  taxRate: number;
  inclusive: 0 | 1;
  terms: string;
  fpajak: string;
};
type PurchaseInvoiceGroup = { head: PurchaseInvoiceHead; lines: PurchaseInvoiceLine[] };
type PurchaseInvoiceCtx = ConverterCtxBase & { order: string[]; groups: Record<string, PurchaseInvoiceGroup> };

export const purchaseInvoiceType: ConverterType<PurchaseInvoiceCtx> = {
  key: "konverter_purchase_invoice",
  label: "Faktur Pembelian (Purchase Invoice)",
  needsCurrency: true,
  note:
    "<b>Faktur Pembelian.</b> Satu baris = satu item; baris dengan <b>No_Internal</b> sama digabung jadi satu " +
    "faktur. <b>No_Internal</b> (nomor dokumen internal Accurate) & <b>No_Faktur_Supplier</b> (no. faktur dari " +
    "pemasok) keduanya WAJIB diisi. <b>Penting:</b> beda dengan faktur penjualan, INVOICEAMOUNT di sini = total " +
    "<b>TERMASUK PPN</b> (otomatis dihitung). Harga isi di Harga_Beli. Pemasok & akun utang harus sudah ada di Accurate.",
  headers: ["No_Faktur_Supplier", "No_Internal", "Tgl_Faktur", "ID_Pemasok", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Beli", "Akun_Utang", "Gudang", "Mata_Uang", "Kurs", "Kena_Pajak", "Kode_Pajak", "Tarif_Pajak", "Pajak_Inklusif", "Termin", "No_Faktur_Pajak", "Project", "Departemen"],
  examples: [
    ["BELI/2026/01", "PI/2026/0001", "2026-01-15", "V-0002", "SG-40", "Semen Gresik 40kg", "zak", 100, 38000, "2101-001", "MATERIAL", "IDR", 1, 1, "T", 11, 0, "NET 30", "", "PRJ-01", "DEPT-01"],
    ["BELI/2026/01", "PI/2026/0001", "2026-01-15", "V-0002", "P-Btn", "Pasir Beton", "m3", 20, 185000, "2101-001", "MATERIAL", "IDR", 1, 1, "T", 11, 0, "NET 30", "", "PRJ-01", "DEPT-01"],
  ],
  sheetName: "Faktur Pembelian",
  fileName: "import_faktur_pembelian_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_Faktur_Supplier", "No_Internal", "Tgl_Faktur", "ID_Pemasok", "Kode_Barang", "Kuantitas", "Harga_Beli", "Akun_Utang"]));
    const groups: Record<string, PurchaseInvoiceGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const seqno = str(r.No_Internal);
      const inv = str(r.No_Faktur_Supplier);
      if (!seqno) {
        errors.push("Baris " + ln + ": No_Internal kosong (wajib — nomor dokumen internal Accurate).");
        return;
      }
      if (!inv) errors.push("Baris " + ln + " (" + seqno + "): No_Faktur_Supplier kosong (wajib isi).");
      const date = normDate(r.Tgl_Faktur);
      if (!date) errors.push("Baris " + ln + " (" + inv + "): Tgl_Faktur kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pemasok)) errors.push("Baris " + ln + " (" + inv + "): ID_Pemasok kosong.");
      if (!str(r.Akun_Utang)) errors.push("Baris " + ln + " (" + inv + "): Akun_Utang kosong.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + inv + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + inv + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Beli);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + inv + "): Harga_Beli tidak valid.");
      const taxable = flag1(r.Kena_Pajak);
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (!str(r.Kena_Pajak)) warnings.push("Baris " + ln + " (" + inv + "): Kena_Pajak kosong → dianggap TIDAK kena pajak.");
      else if (taxable && taxRate <= 0) warnings.push("Baris " + ln + " (" + inv + "): kena pajak tapi Tarif_Pajak 0.");
      const cur = str(r.Mata_Uang) || defCur;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const line: PurchaseInvoiceLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, project: str(r.Project), dept: str(r.Departemen) };
      const head: PurchaseInvoiceHead = { inv, seqno: str(r.No_Internal), date, vendor: str(r.ID_Pemasok), ap: str(r.Akun_Utang), wh: str(r.Gudang), cur, rate, taxable, taxCode, taxRate, inclusive: flag1(r.Pajak_Inklusif), terms: str(r.Termin), fpajak: str(r.No_Faktur_Pajak) };
      if (!groups[seqno]) {
        groups[seqno] = { head, lines: [] };
        order.push(seqno);
      } else {
        const h = groups[seqno]!.head;
        if (h.vendor !== head.vendor || h.date !== head.date || h.cur !== head.cur) warnings.push("Faktur " + seqno + ": data faktur berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[seqno]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((seqno, gi) => {
      const g = ctx.groups[seqno]!;
      const h = g.head;
      let subtotal = 0;
      let lines = "";
      const tc = h.taxable ? h.taxCode : "";
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
          escapeXml(tc) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><POSEQ/><BRUTOUNITPRICE>" +
          l.price +
          "</BRUTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><RISEQ/><RIID/></ITEMLINE>";
      });
      const tax = h.taxable && !h.inclusive ? Math.round((subtotal * h.taxRate) / 100) : 0;
      const amount = h.inclusive ? subtotal : subtotal + tax; // PI: INVOICEAMOUNT termasuk PPN
      body +=
        '<PURCHASEINVOICE operation="Add" REQUESTID="' +
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
        escapeXml(tc) +
        "</TAX1ID><TAX1CODE>" +
        escapeXml(tc) +
        "</TAX1CODE><TAX2CODE/><TAX1RATE>" +
        (h.taxable ? h.taxRate : 0) +
        "</TAX1RATE><TAX2RATE>0</TAX2RATE><RATE>" +
        h.rate +
        "</RATE><INCLUSIVETAX>" +
        h.inclusive +
        "</INCLUSIVETAX><INVOICEISTAXABLE>" +
        (h.taxable ? 1 : 0) +
        "</INVOICEISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>" +
        amount +
        "</INVOICEAMOUNT><TERMSID>" +
        escapeXml(h.terms) +
        "</TERMSID><FOB/><PURCHASEORDERNO/><WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><DESCRIPTION/><SHIPDATE>" +
        escapeXml(h.date) +
        "</SHIPDATE><POSTED>1</POSTED><FISCALRATE>" +
        h.rate +
        "</FISCALRATE><INVFROMPR/><TAXDATE>" +
        escapeXml(h.date) +
        "</TAXDATE><VENDORID>" +
        escapeXml(h.vendor) +
        "</VENDORID><SEQUENCENO>" +
        escapeXml(h.seqno) +
        "</SEQUENCENO><APACCOUNT>" +
        escapeXml(h.ap) +
        "</APACCOUNT><SHIPVENDID/><INVTAXNO2>" +
        escapeXml(h.inv) +
        "</INVTAXNO2><INVTAXNO1>" +
        escapeXml(h.fpajak) +
        "</INVTAXNO1><SSPDATE>" +
        escapeXml(h.date) +
        "</SSPDATE><EXPENSESOFBILLID/><EXPENSESJOURNALDATETYPE>0</EXPENSESJOURNALDATETYPE><LOCKED_BY/><LOCKED_TIME/></PURCHASEINVOICE>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    const byCur: Record<string, number> = {};
    ctx.order.forEach((seqno) => {
      const g = ctx.groups[seqno]!;
      const h = g.head;
      totalLines += g.lines.length;
      let sub = 0;
      g.lines.forEach((l) => (sub += l.qty * l.price));
      const tax = h.taxable && !h.inclusive ? Math.round((sub * h.taxRate) / 100) : 0;
      const amt = h.inclusive ? sub : sub + tax;
      byCur[h.cur] = (byCur[h.cur] ?? 0) + amt;
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
