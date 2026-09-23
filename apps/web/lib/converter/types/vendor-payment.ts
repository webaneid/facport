import { str, num, normDate, escapeXml, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 153, ADR-0038 — port VERBATIM `TYPES.vendorpayment` dari `/Users/webane/sites/konverter/tool.html`
// (baris 915-967). Merujuk faktur AP YANG SUDAH ADA di Accurate (`No_Faktur`) — sama prinsip `customer-receipt.ts`
// (tidak divalidasi eksistensinya di sisi kita). `needsCurrency: false` BEDA dari Customer Receipt — nama mata
// uang di sini ikut data pemasok yang tersimpan di Accurate (bukan kolom `Mata_Uang` terpisah), cuma `Kurs`.
type VendorPaymentLine = { inv: string; amt: number; disc: number; pph: number };
type VendorPaymentHead = { v: string; date: string | null; cdate: string | null; vendor: string; bank: string; cek: string; payee: string; desc: string; rate: number; dept: string; project: string };
type VendorPaymentGroup = { head: VendorPaymentHead; lines: VendorPaymentLine[] };
type VendorPaymentCtx = ConverterCtxBase & { order: string[]; groups: Record<string, VendorPaymentGroup> };

export const vendorPaymentType: ConverterType<VendorPaymentCtx> = {
  key: "konverter_vendor_payment",
  label: "Pembayaran ke Pemasok (Vendor Payment)",
  needsCurrency: false,
  note:
    "<b>Pembayaran ke Pemasok.</b> Tiap baris membayar satu faktur. <b>No_Faktur harus = nomor faktur utang " +
    "(AP) yang SUDAH ADA di Accurate, persis sama.</b> Baris dengan No_Pembayaran sama digabung. Valas: isi " +
    "Kurs (nama mata uang ikut data pemasok di Accurate). PPh23 didukung tapi <b>belum teruji</b>.",
  headers: ["No_Pembayaran", "Tanggal", "Tgl_Cek", "ID_Pemasok", "Akun_Kas_Bank", "No_Faktur", "Jumlah_Bayar", "Diskon", "PPh23", "No_Cek", "Penerima", "Keterangan", "Kurs", "Project", "Departemen"],
  examples: [
    ["VP/2026/001", "2026-01-27", "2026-01-27", "V-0002", "1102-002", "BELI/2026/01", 5000000, 0, 0, "", "PT Pemasok Material", "Pelunasan", 1, "PBT.005", "1000"],
    ["VP/2026/002", "2026-01-28", "2026-02-05", "V-0009", "1102-005", "JSE/0569", 114, 0, 0, "CHQ-77", "Joo Seng Electric", "Bayar valas", 1, "", ""],
  ],
  sheetName: "Pembayaran",
  fileName: "import_pembayaran_pemasok_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_Pembayaran", "Tanggal", "ID_Pemasok", "Akun_Kas_Bank", "No_Faktur", "Jumlah_Bayar"]));
    const groups: Record<string, VendorPaymentGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const v = str(r.No_Pembayaran);
      if (!v) {
        errors.push("Baris " + ln + ": No_Pembayaran kosong.");
        return;
      }
      const date = normDate(r.Tanggal);
      if (!date) errors.push("Baris " + ln + " (" + v + "): Tanggal kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pemasok)) errors.push("Baris " + ln + " (" + v + "): ID_Pemasok kosong.");
      if (!str(r.Akun_Kas_Bank)) errors.push("Baris " + ln + " (" + v + "): Akun_Kas_Bank kosong.");
      if (!str(r.No_Faktur)) errors.push("Baris " + ln + " (" + v + "): No_Faktur kosong (harus = nomor faktur utang yang sudah ada di Accurate).");
      const amt = num(r.Jumlah_Bayar);
      if (isNaN(amt) || amt <= 0) errors.push("Baris " + ln + " (" + v + "): Jumlah_Bayar tidak valid (harus > 0).");
      let disc = num(r.Diskon);
      if (isNaN(disc) || disc < 0) disc = 0;
      let pph = num(r.PPh23);
      if (isNaN(pph) || pph < 0) pph = 0;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const cdate = normDate(r.Tgl_Cek) ?? date;
      const line: VendorPaymentLine = { inv: str(r.No_Faktur), amt: isNaN(amt) ? 0 : amt, disc, pph };
      const head: VendorPaymentHead = { v, date, cdate, vendor: str(r.ID_Pemasok), bank: str(r.Akun_Kas_Bank), cek: str(r.No_Cek), payee: str(r.Penerima), desc: str(r.Keterangan), rate, dept: str(r.Departemen), project: str(r.Project) };
      if (!groups[v]) {
        groups[v] = { head, lines: [] };
        order.push(v);
      } else {
        const h = groups[v]!.head;
        if (h.vendor !== head.vendor || h.date !== head.date || h.dept !== head.dept || h.project !== head.project) {
          warnings.push("Pembayaran " + v + ": data berbeda antar baris — dipakai baris pertama.");
        }
      }
      groups[v]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((v, gi) => {
      const g = ctx.groups[v]!;
      const h = g.head;
      let lines = "";
      g.lines.forEach((l, li) => {
        lines +=
          '<InvoiceLine operation="Add"><KeyID>' +
          (li + 1) +
          "</KeyID><PAYMENTAMOUNT>" +
          l.amt +
          "</PAYMENTAMOUNT><PPH23AMOUNT>" +
          l.pph +
          "</PPH23AMOUNT><PPH23RATE>0</PPH23RATE><PPH23FISCALRATE>" +
          h.rate +
          "</PPH23FISCALRATE><PPH23NUMBER/><DISCOUNT>" +
          l.disc +
          "</DISCOUNT><APINVOICEID>" +
          escapeXml(l.inv) +
          "</APINVOICEID><APINVOICESEQUENCE/></InvoiceLine>";
      });
      body +=
        '<VENDORPAYMENT operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID><IMPORTEDTRANSACTIONID/>" +
        lines +
        "<SEQUENCENO>" +
        escapeXml(h.v) +
        "</SEQUENCENO><PAYMENTDATE>" +
        escapeXml(h.date) +
        "</PAYMENTDATE><CHEQUENO>" +
        escapeXml(h.cek) +
        "</CHEQUENO><BANKACCNT>" +
        escapeXml(h.bank) +
        "</BANKACCNT><CHEQUEDATE>" +
        escapeXml(h.cdate) +
        "</CHEQUEDATE><RATE>" +
        h.rate +
        "</RATE><DESCRIPTION>" +
        escapeXml(h.desc) +
        "</DESCRIPTION><FISCALPMT>0</FISCALPMT>" +
        (h.dept ? "<DEPTID>" + escapeXml(h.dept) + "</DEPTID>" : "") +
        (h.project ? "<PROJECTID>" + escapeXml(h.project) + "</PROJECTID>" : "") +
        "<VOID>0</VOID><VENDORID>" +
        escapeXml(h.vendor) +
        "</VENDORID><PAYEE>" +
        escapeXml(h.payee) +
        "</PAYEE></VENDORPAYMENT>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let total = 0;
    ctx.order.forEach((v) => {
      const g = ctx.groups[v]!;
      totalLines += g.lines.length;
      g.lines.forEach((l) => (total += l.amt));
    });
    return {
      stats: [
        [ctx.order.length, "Pembayaran"],
        [totalLines, "Faktur dibayar"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: "Total " + fmtMoney(total) + " (nilai mata uang transaksi) — pastikan tiap No_Faktur sudah ada di Accurate",
      rowCount: totalLines,
    };
  },
};
