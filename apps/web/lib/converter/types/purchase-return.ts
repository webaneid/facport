import { str, num, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 154, ADR-0038 — port VERBATIM `TYPES.purchasereturn` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1130-1186). Merujuk faktur pembelian YANG SUDAH ADA di Accurate (`No_Faktur_Pembelian`) — sama prinsip
// customer-receipt/vendor-payment (tidak divalidasi eksistensinya). PENUTUP kategori Purchase (4/4).
type PurchaseReturnLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; wh: string; tax: string; inv: string; project: string; dept: string };
type PurchaseReturnHead = { ret: string; date: string | null; vendor: string; inv: string; wh: string; taxRate: number; fp: string };
type PurchaseReturnGroup = { head: PurchaseReturnHead; lines: PurchaseReturnLine[] };
type PurchaseReturnCtx = ConverterCtxBase & { order: string[]; groups: Record<string, PurchaseReturnGroup> };

export const purchaseReturnType: ConverterType<PurchaseReturnCtx> = {
  key: "konverter_purchase_return",
  label: "Retur Pembelian (Purchase Return)",
  needsCurrency: false,
  note:
    "<b>Retur Pembelian.</b> Satu baris = satu item; baris dengan No_Retur sama digabung. <b>No_Faktur_Pembelian " +
    "wajib persis sama</b> dengan nomor faktur pembelian yang SUDAH ADA di Accurate — kalau tidak, retur gagal " +
    "atau tidak terkait. Harga_Satuan = harga bruto per unit sesuai faktur asal. Retur mengeluarkan barang dari " +
    "gudang. Hanya IDR.",
  headers: ["No_Retur", "Tgl_Retur", "ID_Pemasok", "No_Faktur_Pembelian", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Satuan", "Gudang", "Kode_Pajak", "Tarif_Pajak", "No_Faktur_Pajak", "Project", "Departemen"],
  examples: [
    ["RB/2026/001", "2026-01-17", "V-0002", "BELI/2026/01", "AC-Chang", "AC Changhong CS-C09P3", "set", 1, 1500000, "ELEKTRONIK", "T", 11, "", "PBT.005", "1000"],
    ["RB/2026/002", "2026-01-20", "V-0003", "BELI/2026/05", "SG-40", "Semen Gresik 40kg", "zak", 10, 38000, "MATERIAL", "", 0, "", "", ""],
  ],
  sheetName: "Retur Pembelian",
  fileName: "import_retur_pembelian_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_Retur", "Tgl_Retur", "ID_Pemasok", "No_Faktur_Pembelian", "Kode_Barang", "Kuantitas", "Harga_Satuan"]));
    const groups: Record<string, PurchaseReturnGroup> = {};
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
      if (!str(r.ID_Pemasok)) errors.push("Baris " + ln + " (" + ret + "): ID_Pemasok kosong.");
      const inv = str(r.No_Faktur_Pembelian);
      if (!inv) errors.push("Baris " + ln + " (" + ret + "): No_Faktur_Pembelian kosong (wajib — nomor faktur asal di Accurate).");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + ret + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + ret + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + ret + "): Harga_Satuan tidak valid.");
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (taxCode && taxRate <= 0) warnings.push("Baris " + ln + " (" + ret + "): Kode_Pajak diisi tapi Tarif_Pajak 0 → PPN retur dihitung 0.");
      const line: PurchaseReturnLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, wh: str(r.Gudang), tax: taxCode, inv, project: str(r.Project), dept: str(r.Departemen) };
      const head: PurchaseReturnHead = { ret, date, vendor: str(r.ID_Pemasok), inv, wh: str(r.Gudang), taxRate, fp: str(r.No_Faktur_Pajak) };
      if (!groups[ret]) {
        groups[ret] = { head, lines: [] };
        order.push(ret);
      } else {
        const h = groups[ret]!.head;
        if (h.inv !== inv) warnings.push("Retur " + ret + ": No_Faktur_Pembelian berbeda antar baris — header memakai baris pertama, tiap baris tetap menunjuk fakturnya sendiri.");
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
          "<ITEMOVDESC/><UNITPRICE/><ITEMDISCPC/><TAXCODES>" +
          escapeXml(l.tax) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/><POSEQ/><BRUTOUNITPRICE>" +
          l.price +
          "</BRUTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(l.wh || h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><INVRI/><INVID>" +
          escapeXml(l.inv) +
          "</INVID><RIID/><INVOICESEQ>" +
          (li + 1) +
          "</INVOICESEQ><ITEMDESCRIPTION>" +
          escapeXml(l.desc) +
          "</ITEMDESCRIPTION></ITEMLINE>";
      });
      const tax = Math.round(((subtotal * h.taxRate) / 100) * 10000) / 10000;
      const gy = h.date ? h.date.slice(0, 4) : "";
      const gp = h.date ? String(parseInt(h.date.slice(5, 7), 10)) : "";
      body +=
        '<PURCHASERETURN operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><APRETURNID/><TRANSACTIONID>' +
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
        "</GLPERIOD><TAX1CODE/><TAX2CODE/><TAX1RATE/><TAX2RATE/><TAX1AMOUNT>" +
        tax +
        "</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE/><INCLUSIVETAX>0</INCLUSIVETAX><ISTAXABLE/><CASHDISCOUNT/><CASHDISCPC/><INVOICEAMOUNT>" +
        Math.round(subtotal * 100) / 100 +
        "</INVOICEAMOUNT><DESCRIPTION/><WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><TAXNO>" +
        escapeXml(h.fp) +
        "</TAXNO><TAXDATE>" +
        escapeXml(h.date) +
        "</TAXDATE><VENDORID>" +
        escapeXml(h.vendor) +
        "</VENDORID><APINVOICEID>" +
        escapeXml(h.inv) +
        "</APINVOICEID><RECEIVEITEMID/><SSPDATE>" +
        escapeXml(h.date) +
        "</SSPDATE></PURCHASERETURN>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let total = 0;
    ctx.order.forEach((ret) => {
      const g = ctx.groups[ret]!;
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
      totals: fmtMoney(Math.round(total)) + " termasuk PPN — tiap No_Faktur_Pembelian harus sudah ada di Accurate",
      rowCount: totalLines,
    };
  },
};
