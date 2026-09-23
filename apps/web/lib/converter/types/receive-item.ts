import { str, num, flag1, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 154, ADR-0038 — port VERBATIM `TYPES.receiveitem` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1246-1303). Ejaan tag XML `RECIEVEITEM` (bukan "RECEIVEITEM") MENGIKUTI SKEMA RESMI ACCURATE — JANGAN
// dikoreksi, itu bukan typo kita.
type ReceiveItemLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; wh: string; po: string; project: string; dept: string };
type ReceiveItemHead = {
  ri: string;
  sj: string;
  date: string | null;
  vendor: string;
  ap: string;
  wh: string;
  po: string;
  rate: number;
  taxable: 0 | 1;
  taxCode: string;
  taxRate: number;
  terms: string;
};
type ReceiveItemGroup = { head: ReceiveItemHead; lines: ReceiveItemLine[] };
type ReceiveItemCtx = ConverterCtxBase & { order: string[]; groups: Record<string, ReceiveItemGroup> };

export const receiveItemType: ConverterType<ReceiveItemCtx> = {
  key: "konverter_receive_item",
  label: "Penerimaan Barang (Receive Item)",
  needsCurrency: false,
  note:
    "<b>Penerimaan Barang (RI).</b> Satu baris = satu item; baris dengan <b>No_Form_RI</b> sama digabung. RI " +
    "menambah stok gudang dan mencatat utang belum-tertagih (Akun_Utang wajib). <b>No_Surat_Jalan</b> = nomor " +
    "dokumen dari pemasok (wajib). Isi <b>No_PO</b> bila menerima dari Pesanan Pembelian yang sudah ada (nomor " +
    "harus persis sama); kosongkan untuk RI lepas. Vendor valas: isi <b>Kurs</b>. Harga selalu dianggap belum " +
    "termasuk PPN.",
  headers: ["No_Form_RI", "No_Surat_Jalan", "Tgl_Terima", "ID_Pemasok", "No_PO", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Beli", "Akun_Utang", "Gudang", "Kena_Pajak", "Kode_Pajak", "Tarif_Pajak", "Termin", "Kurs", "Project", "Departemen"],
  examples: [
    ["RI/2026/0001", "SJ-8891", "2026-01-21", "V-0002", "PO/2026/001", "SG-40", "Semen Gresik 40kg", "zak", 100, 38000, "2101-001", "MATERIAL", 1, "T", 11, "2/10 n/30", 1, "PBT.005", "1000"],
    ["RI/2026/0002", "SJ-8905", "2026-01-23", "V-0003", "", "AC-Gen", "AC General LCT 12", "set", 2, 3500000, "2101-001", "ELEKTRONIK", 0, "", 0, "NET 30", 1, "", ""],
  ],
  sheetName: "Penerimaan Barang",
  fileName: "import_penerimaan_barang_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_Form_RI", "No_Surat_Jalan", "Tgl_Terima", "ID_Pemasok", "Kode_Barang", "Kuantitas", "Harga_Beli", "Akun_Utang"]));
    const groups: Record<string, ReceiveItemGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const ri = str(r.No_Form_RI);
      if (!ri) {
        errors.push("Baris " + ln + ": No_Form_RI kosong.");
        return;
      }
      if (!str(r.No_Surat_Jalan)) errors.push("Baris " + ln + " (" + ri + "): No_Surat_Jalan kosong (wajib — nomor dokumen pemasok).");
      const date = normDate(r.Tgl_Terima);
      if (!date) errors.push("Baris " + ln + " (" + ri + "): Tgl_Terima kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pemasok)) errors.push("Baris " + ln + " (" + ri + "): ID_Pemasok kosong.");
      if (!str(r.Akun_Utang)) errors.push("Baris " + ln + " (" + ri + "): Akun_Utang kosong.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + ri + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + ri + "): Kuantitas tidak valid.");
      const price = num(r.Harga_Beli);
      if (isNaN(price) || price < 0) errors.push("Baris " + ln + " (" + ri + "): Harga_Beli tidak valid.");
      const taxable = flag1(r.Kena_Pajak);
      const taxCode = str(r.Kode_Pajak);
      let taxRate = num(r.Tarif_Pajak);
      if (isNaN(taxRate)) taxRate = 0;
      if (!str(r.Kena_Pajak)) warnings.push("Baris " + ln + " (" + ri + "): Kena_Pajak kosong → dianggap TIDAK kena pajak.");
      else if (taxable && taxRate <= 0) warnings.push("Baris " + ln + " (" + ri + "): kena pajak tapi Tarif_Pajak 0.");
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const line: ReceiveItemLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price: isNaN(price) ? 0 : price, wh: str(r.Gudang), po: str(r.No_PO), project: str(r.Project), dept: str(r.Departemen) };
      const head: ReceiveItemHead = { ri, sj: str(r.No_Surat_Jalan), date, vendor: str(r.ID_Pemasok), ap: str(r.Akun_Utang), wh: str(r.Gudang), po: str(r.No_PO), rate, taxable, taxCode, taxRate, terms: str(r.Termin) };
      if (!groups[ri]) {
        groups[ri] = { head, lines: [] };
        order.push(ri);
      } else {
        const h = groups[ri]!.head;
        if (h.vendor !== head.vendor || h.date !== head.date) warnings.push("RI " + ri + ": data penerimaan berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[ri]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((ri, gi) => {
      const g = ctx.groups[ri]!;
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
          "<GROUPSEQ/>" +
          (l.po ? "<POSEQ>0</POSEQ>" : "<POSEQ/>") +
          "<BRUTOUNITPRICE>" +
          l.price +
          "</BRUTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(l.wh || h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><RISEQ/>" +
          (l.po ? "<POID>" + escapeXml(l.po) + "</POID>" : "<POID/>") +
          "<RIID/></ITEMLINE>";
      });
      body +=
        '<RECIEVEITEM operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<INVOICENO>" +
        escapeXml(h.sj) +
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
        "</RATE><INCLUSIVETAX>0</INCLUSIVETAX><INVOICEISTAXABLE>" +
        (h.taxable ? 1 : 0) +
        "</INVOICEISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>" +
        Math.round(subtotal * 100) / 100 +
        "</INVOICEAMOUNT><TERMSID>" +
        escapeXml(h.terms) +
        "</TERMSID><FOB/>" +
        (h.po ? "<PURCHASEORDERNO>" + escapeXml(h.po) + "</PURCHASEORDERNO>" : "<PURCHASEORDERNO/>") +
        "<WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><DESCRIPTION/><SHIPDATE>" +
        escapeXml(h.date) +
        "</SHIPDATE><POSTED>0</POSTED><FISCALRATE>" +
        h.rate +
        "</FISCALRATE><INVFROMPR/><TAXDATE>" +
        escapeXml(h.date) +
        "</TAXDATE><VENDORID>" +
        escapeXml(h.vendor) +
        "</VENDORID><SEQUENCENO>" +
        escapeXml(h.ri) +
        "</SEQUENCENO><APACCOUNT>" +
        escapeXml(h.ap) +
        "</APACCOUNT><SHIPVENDID/><INVTAXNO2/><INVTAXNO1/><SSPDATE/><EXPENSESOFBILLID/><EXPENSESJOURNALDATETYPE/><LOCKED_BY/><LOCKED_TIME/></RECIEVEITEM>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let total = 0;
    ctx.order.forEach((ri) => {
      const g = ctx.groups[ri]!;
      totalLines += g.lines.length;
      g.lines.forEach((l) => (total += l.qty * l.price));
    });
    return {
      stats: [
        [ctx.order.length, "Penerimaan"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: fmtMoney(Math.round(total)) + " (DPP, belum termasuk PPN) — RI menambah stok gudang",
      rowCount: totalLines,
    };
  },
};
