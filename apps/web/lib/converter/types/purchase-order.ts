import { str, num, flag1, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 154, ADR-0038 — port VERBATIM `TYPES.purchaseorder` dari `/Users/webane/sites/konverter/tool.html`
// (baris 969-1029). Pesanan BELUM membebani stok/jurnal (§ note legacy). Diskon BELUM didukung (catatan legacy
// sendiri — "belum ada sampel XML ekspor ber-diskon", PORT APA ADANYA, jangan tambah fitur yang tidak ada di
// sumber).
type PurchaseOrderLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; project: string; dept: string };
type PurchaseOrderHead = {
  po: string;
  date: string | null;
  vendor: string;
  rate: number;
  taxable: 0 | 1;
  taxCode: string;
  taxRate: number;
  inclusive: 0 | 1;
  terms: string;
  expected: string | null;
  dp: number;
  dpAcc: string;
};
type PurchaseOrderGroup = { head: PurchaseOrderHead; lines: PurchaseOrderLine[] };
type PurchaseOrderCtx = ConverterCtxBase & { order: string[]; groups: Record<string, PurchaseOrderGroup> };

export const purchaseOrderType: ConverterType<PurchaseOrderCtx> = {
  key: "konverter_purchase_order",
  label: "Pesanan Pembelian (Purchase Order)",
  needsCurrency: false,
  note:
    "<b>Pesanan Pembelian.</b> Satu baris = satu item; baris dengan No_PO sama digabung jadi satu pesanan. " +
    "Pesanan belum membebani stok/jurnal. Pemasok harus sudah ada di Accurate. Vendor valas: isi <b>Kurs</b> " +
    "(mata uang mengikuti pemasok). Uang muka opsional (Uang_Muka + Akun_Uang_Muka). Diskon belum didukung " +
    "(belum ada sampel XML ekspor ber-diskon).",
  headers: ["No_PO", "Tgl_PO", "ID_Pemasok", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Beli", "Kena_Pajak", "Kode_Pajak", "Tarif_Pajak", "Pajak_Inklusif", "Termin", "Tgl_Estimasi_Terima", "Kurs", "Uang_Muka", "Akun_Uang_Muka", "Project", "Departemen"],
  examples: [
    ["PO/2026/001", "2026-01-20", "V-0002", "SG-40", "Semen Gresik 40kg", "zak", 100, 38000, 1, "T", 11, 0, "2/10 n/30", "2026-02-01", 1, 0, "1104-001", "PBT.005", "1000"],
    ["PO/2026/001", "2026-01-20", "V-0002", "P-Btn", "Pasir Beton", "m3", 20, 185000, 1, "T", 11, 0, "2/10 n/30", "2026-02-01", 1, 0, "1104-001", "PBT.005", "1000"],
    ["PO/2026/002", "2026-01-22", "V-0003", "AC-Gen", "AC General LCT 12", "set", 2, 3500000, 0, "", 0, 0, "NET 30", "", 1, 0, "", "", ""],
  ],
  sheetName: "Pesanan Pembelian",
  fileName: "import_pesanan_pembelian_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_PO", "Tgl_PO", "ID_Pemasok", "Kode_Barang", "Kuantitas", "Harga_Beli"]));
    const groups: Record<string, PurchaseOrderGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const po = str(r.No_PO);
      if (!po) {
        errors.push("Baris " + ln + ": No_PO kosong.");
        return;
      }
      const date = normDate(r.Tgl_PO);
      if (!date) errors.push("Baris " + ln + " (" + po + "): Tgl_PO kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pemasok)) errors.push("Baris " + ln + " (" + po + "): ID_Pemasok kosong.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + po + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + po + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Beli);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + po + "): Harga_Beli tidak valid.");
      const taxable = flag1(r.Kena_Pajak);
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (!str(r.Kena_Pajak)) warnings.push("Baris " + ln + " (" + po + "): Kena_Pajak kosong → dianggap TIDAK kena pajak.");
      else if (taxable && taxRate <= 0) warnings.push("Baris " + ln + " (" + po + "): kena pajak tapi Tarif_Pajak 0.");
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      let dp = num(r.Uang_Muka);
      if (isNaN(dp) || dp < 0) dp = 0;
      const dpAcc = str(r.Akun_Uang_Muka);
      if (dp > 0 && !dpAcc) warnings.push("PO " + po + ": Uang_Muka diisi tapi Akun_Uang_Muka kosong.");
      const line: PurchaseOrderLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, project: str(r.Project), dept: str(r.Departemen) };
      const head: PurchaseOrderHead = { po, date, vendor: str(r.ID_Pemasok), rate, taxable, taxCode, taxRate, inclusive: flag1(r.Pajak_Inklusif), terms: str(r.Termin), expected: normDate(r.Tgl_Estimasi_Terima), dp, dpAcc };
      if (!groups[po]) {
        groups[po] = { head, lines: [] };
        order.push(po);
      } else {
        const h = groups[po]!.head;
        if (h.vendor !== head.vendor || h.date !== head.date) warnings.push("PO " + po + ": data pesanan berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[po]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((po, gi) => {
      const g = ctx.groups[po]!;
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
          "</UNITPRICE><ITEMDISCPC/><TAXCODES>" +
          escapeXml(tc) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><REQUISITIONSEQ/></ITEMLINE>";
      });
      const tax = h.taxable ? Math.round((h.inclusive ? (subtotal * h.taxRate) / (100 + h.taxRate) : (subtotal * h.taxRate) / 100) * 10000) / 10000 : 0;
      const amount = Math.round(h.inclusive ? subtotal : subtotal + tax);
      body +=
        '<PO operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><POID>' +
        (gi + 1) +
        "</POID><TRANSACTIONID>" +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<PONO>" +
        escapeXml(h.po) +
        "</PONO><PODATE>" +
        escapeXml(h.date) +
        "</PODATE><GLYEAR/><GLPERIOD/><TAX1REF>" +
        escapeXml(tc) +
        "</TAX1REF><TAX1CODE>" +
        escapeXml(tc) +
        "</TAX1CODE><TAX2CODE/><TAX1RATE>" +
        (h.taxable ? h.taxRate : 0) +
        "</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>" +
        tax +
        "</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE>" +
        h.rate +
        "</RATE><INCLUSIVETAX>" +
        h.inclusive +
        "</INCLUSIVETAX><VENDORISTAXABLE>" +
        (h.taxable ? 1 : 0) +
        "</VENDORISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC>0</CASHDISCPC><POAMOUNT>" +
        amount +
        "</POAMOUNT><FREIGHT>0</FREIGHT><TERMREF>" +
        escapeXml(h.terms) +
        "</TERMREF><FOB/><EXPECTED>" +
        escapeXml(h.expected || "") +
        "</EXPECTED><DESCRIPTION/><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><PROCEED/><CLOSED>0</CLOSED>" +
        (h.dp > 0 ? "<DP>" + h.dp + "</DP>" : "<DP/>") +
        "<DPACCOUNTREF>" +
        escapeXml(h.dpAcc) +
        "</DPACCOUNTREF><DPUSED/><VENDORREF>" +
        escapeXml(h.vendor) +
        "</VENDORREF></PO>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let total = 0;
    ctx.order.forEach((po) => {
      const g = ctx.groups[po]!;
      const h = g.head;
      totalLines += g.lines.length;
      let sub = 0;
      g.lines.forEach((l) => (sub += l.qty * l.price));
      const tax = h.taxable && !h.inclusive ? Math.round(((sub * h.taxRate) / 100) * 100) / 100 : 0;
      total += Math.round(h.inclusive ? sub : sub + tax);
    });
    return {
      stats: [
        [ctx.order.length, "Pesanan"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: fmtMoney(Math.round(total)) + " (nilai mata uang transaksi, termasuk PPN) — pesanan belum membebani stok/jurnal",
      rowCount: totalLines,
    };
  },
};
