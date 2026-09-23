import { str, num, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 155, ADR-0038 — port VERBATIM `TYPES.deliveryorder` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1030-1081). DO MEMOTONG stok gudang (§ note legacy). Referensi SO opsional (sama pola Receive Item →
// PO): kosongkan untuk DO lepas.
type DeliveryOrderLine = { itemNo: string; desc: string; unit: string; qty: number; price: number; wh: string; tax: string; so: string; project: string; dept: string };
type DeliveryOrderHead = { doNo: string; date: string | null; cust: string; wh: string; cur: string; ship: string | null };
type DeliveryOrderGroup = { head: DeliveryOrderHead; lines: DeliveryOrderLine[] };
type DeliveryOrderCtx = ConverterCtxBase & { order: string[]; groups: Record<string, DeliveryOrderGroup> };

export const deliveryOrderType: ConverterType<DeliveryOrderCtx> = {
  key: "konverter_delivery_order",
  label: "Pengiriman Pesanan (Delivery Order)",
  needsCurrency: true,
  note:
    "<b>Pengiriman Pesanan.</b> Satu baris = satu item; baris dengan No_DO sama digabung. <b>DO memotong stok " +
    "gudang.</b> Isi <b>No_SO</b> bila DO mengambil dari Pesanan Penjualan yang sudah ada (nomor harus persis " +
    "sama); kosongkan untuk DO lepas. Alamat kirim diisi Accurate dari master pelanggan.",
  headers: ["No_DO", "Tgl_DO", "ID_Pelanggan", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Harga_Satuan", "Gudang", "Kode_Pajak", "No_SO", "Tgl_Kirim", "Mata_Uang", "Project", "Departemen"],
  examples: [
    ["DO/2026/001", "2026-01-25", "1001", "AC-Gen", "AC General LCT 12", "set", 1, 3850000, "ELEKTRONIK", "T", "SO/2026/001", "2026-01-25", "IDR", "PBT.005", "1000"],
    ["DO/2026/002", "2026-01-26", "1002", "SG-40", "Semen Gresik 40kg", "zak", 50, 60000, "MATERIAL", "", "", "2026-01-27", "IDR", "", ""],
  ],
  sheetName: "Pengiriman Pesanan",
  fileName: "import_pengiriman_pesanan_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_DO", "Tgl_DO", "ID_Pelanggan", "Kode_Barang", "Kuantitas"]));
    const groups: Record<string, DeliveryOrderGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const doNo = str(r.No_DO);
      if (!doNo) {
        errors.push("Baris " + ln + ": No_DO kosong.");
        return;
      }
      const date = normDate(r.Tgl_DO);
      if (!date) errors.push("Baris " + ln + " (" + doNo + "): Tgl_DO kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pelanggan)) errors.push("Baris " + ln + " (" + doNo + "): ID_Pelanggan kosong.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + doNo + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + doNo + "): Kuantitas tidak valid.");
      let price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) price = 0;
      const cur = str(r.Mata_Uang) || defCur;
      const line: DeliveryOrderLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price, wh: str(r.Gudang), tax: str(r.Kode_Pajak), so: str(r.No_SO), project: str(r.Project), dept: str(r.Departemen) };
      const head: DeliveryOrderHead = { doNo, date, cust: str(r.ID_Pelanggan), wh: str(r.Gudang), cur, ship: normDate(r.Tgl_Kirim) };
      if (!groups[doNo]) {
        groups[doNo] = { head, lines: [] };
        order.push(doNo);
      } else {
        const h = groups[doNo]!.head;
        if (h.cust !== head.cust || h.date !== head.date || h.cur !== head.cur) warnings.push("DO " + doNo + ": data pengiriman berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[doNo]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((doNo, gi) => {
      const g = ctx.groups[doNo]!;
      const h = g.head;
      let lines = "";
      g.lines.forEach((l, li) => {
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
          "</ITEMOVDESC><UNITPRICE>" +
          l.price +
          "</UNITPRICE><ITEMDISCPC/><TAXCODES>" +
          escapeXml(l.tax) +
          "</TAXCODES>" +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          "<GROUPSEQ/>" +
          (l.so ? "<SOSEQ>0</SOSEQ>" : "<SOSEQ/>") +
          "<BRUTOUNITPRICE>" +
          l.price +
          "</BRUTOUNITPRICE><WAREHOUSEID>" +
          escapeXml(l.wh || h.wh) +
          "</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><DOSEQ/>" +
          (l.so ? "<SOID>" + escapeXml(l.so) + "</SOID>" : "<SOID/>") +
          "<DOID/></ITEMLINE>";
      });
      body +=
        '<DELIVERYORDER operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<INVOICENO>" +
        escapeXml(h.doNo) +
        "</INVOICENO><INVOICEDATE>" +
        escapeXml(h.date) +
        "</INVOICEDATE><INVOICEAMOUNT>0</INVOICEAMOUNT><PURCHASEORDERNO/><WAREHOUSEID>" +
        escapeXml(h.wh) +
        "</WAREHOUSEID><DESCRIPTION/><SHIPDATE>" +
        escapeXml(h.ship || h.date) +
        "</SHIPDATE><DELIVERYORDER></DELIVERYORDER><CUSTOMERID>" +
        escapeXml(h.cust) +
        "</CUSTOMERID><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><CURRENCYNAME>" +
        escapeXml(h.cur) +
        "</CURRENCYNAME><AUTOMATICINSERTGROUPING/></DELIVERYORDER>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let totalQty = 0;
    ctx.order.forEach((v) => {
      const g = ctx.groups[v]!;
      totalLines += g.lines.length;
      g.lines.forEach((l) => (totalQty += l.qty));
    });
    return {
      stats: [
        [ctx.order.length, "DO"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: fmtMoney(totalQty) + " total kuantitas keluar — DO memotong stok gudang",
      rowCount: totalLines,
    };
  },
};
