import { str, num, normDate, escapeXml, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 153, ADR-0038 — port VERBATIM `TYPES.customerreceipt` dari `/Users/webane/sites/konverter/tool.html`
// (baris 861-908). Merujuk faktur AR YANG SUDAH ADA di Accurate (`No_Faktur`) — TIDAK divalidasi eksistensinya
// di sisi kita (tidak ada koneksi Accurate), Accurate Desktop sendiri yang menolak saat impor kalau salah (§
// architecture-konverter.md "Catatan bisnis khusus per tipe").
type CustomerReceiptLine = { inv: string; amt: number; disc: number; pph: number };
type CustomerReceiptHead = { v: string; date: string | null; cust: string; bank: string; cek: string; desc: string; cur: string; rate: number; dept: string; project: string };
type CustomerReceiptGroup = { head: CustomerReceiptHead; lines: CustomerReceiptLine[] };
type CustomerReceiptCtx = ConverterCtxBase & { order: string[]; groups: Record<string, CustomerReceiptGroup> };

export const customerReceiptType: ConverterType<CustomerReceiptCtx> = {
  key: "konverter_customer_receipt",
  label: "Penerimaan dari Pelanggan (Customer Receipt)",
  needsCurrency: true,
  note:
    "<b>Penerimaan dari Pelanggan.</b> Tiap baris melunasi satu faktur. <b>No_Faktur harus = nomor faktur AR " +
    "yang SUDAH ADA di Accurate, persis sama</b> — kalau tidak cocok, baris gagal. Baris dengan No_Penerimaan " +
    "sama digabung (satu penerimaan bisa melunasi beberapa faktur). PPh23 didukung tapi <b>belum teruji</b> " +
    "(sampel hanya tanpa potongan); pakai hati-hati.",
  headers: ["No_Penerimaan", "Tanggal", "ID_Pelanggan", "Akun_Kas_Bank", "No_Faktur", "Jumlah_Bayar", "Diskon", "PPh23", "No_Cek", "Keterangan", "Mata_Uang", "Kurs", "Project", "Departemen"],
  examples: [
    ["CR/2026/001", "2026-01-27", "1001", "1102-002", "INV/2026/001", 4125000, 0, 0, "", "Pelunasan faktur", "IDR", 1, "PBT.005", "1000"],
    ["CR/2026/003", "2026-01-29", "1003", "1102-002", "INV/2026/008", 5000000, 0, 0, "", "Pelunasan 2 faktur", "IDR", 1, "", ""],
    ["CR/2026/003", "2026-01-29", "1003", "1102-002", "INV/2026/009", 3000000, 0, 0, "", "Pelunasan 2 faktur", "IDR", 1, "", ""],
  ],
  sheetName: "Penerimaan",
  fileName: "import_penerimaan_pelanggan_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_Penerimaan", "Tanggal", "ID_Pelanggan", "Akun_Kas_Bank", "No_Faktur", "Jumlah_Bayar"]));
    const groups: Record<string, CustomerReceiptGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const v = str(r.No_Penerimaan);
      if (!v) {
        errors.push("Baris " + ln + ": No_Penerimaan kosong.");
        return;
      }
      const date = normDate(r.Tanggal);
      if (!date) errors.push("Baris " + ln + " (" + v + "): Tanggal kosong/format salah (YYYY-MM-DD).");
      if (!str(r.ID_Pelanggan)) errors.push("Baris " + ln + " (" + v + "): ID_Pelanggan kosong.");
      if (!str(r.Akun_Kas_Bank)) errors.push("Baris " + ln + " (" + v + "): Akun_Kas_Bank kosong.");
      if (!str(r.No_Faktur)) errors.push("Baris " + ln + " (" + v + "): No_Faktur kosong (harus = nomor faktur yang sudah ada di Accurate).");
      const amt = num(r.Jumlah_Bayar);
      if (isNaN(amt) || amt <= 0) errors.push("Baris " + ln + " (" + v + "): Jumlah_Bayar tidak valid (harus > 0).");
      let disc = num(r.Diskon);
      if (isNaN(disc) || disc < 0) disc = 0;
      let pph = num(r.PPh23);
      if (isNaN(pph) || pph < 0) pph = 0;
      const cur = str(r.Mata_Uang) || defCur;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const line: CustomerReceiptLine = { inv: str(r.No_Faktur), amt: isNaN(amt) ? 0 : amt, disc, pph };
      const head: CustomerReceiptHead = { v, date, cust: str(r.ID_Pelanggan), bank: str(r.Akun_Kas_Bank), cek: str(r.No_Cek), desc: str(r.Keterangan), cur, rate, dept: str(r.Departemen), project: str(r.Project) };
      if (!groups[v]) {
        groups[v] = { head, lines: [] };
        order.push(v);
      } else {
        const h = groups[v]!.head;
        if (h.cust !== head.cust || h.date !== head.date || h.cur !== head.cur || h.dept !== head.dept || h.project !== head.project) {
          warnings.push("Penerimaan " + v + ": data berbeda antar baris — dipakai baris pertama.");
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
      let total = 0;
      let lines = "";
      g.lines.forEach((l, li) => {
        total += l.amt;
        lines +=
          '<InvoiceLine operation="Add"><KeyID>' +
          (li + 1) +
          "</KeyID><PAYMENTAMOUNT>" +
          l.amt +
          "</PAYMENTAMOUNT><PPH23AMOUNT>" +
          l.pph +
          "</PPH23AMOUNT><PPH23RATE>0</PPH23RATE><PPH23FISCALRATE>" +
          h.rate +
          "</PPH23FISCALRATE><PPH23NUMBER/><DISCTAKENAMOUNT>" +
          l.disc +
          "</DISCTAKENAMOUNT><ARINVOICEID>" +
          escapeXml(l.inv) +
          "</ARINVOICEID></InvoiceLine>";
      });
      body +=
        '<CUSTOMERRECEIPT operation="Add" REQUESTID="' +
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
        "</CHEQUENO><BANKACCOUNT>" +
        escapeXml(h.bank) +
        "</BANKACCOUNT><CHEQUEDATE>" +
        escapeXml(h.date) +
        "</CHEQUEDATE><CHEQUEAMOUNT>" +
        total +
        "</CHEQUEAMOUNT><RATE>" +
        h.rate +
        "</RATE><DESCRIPTION>" +
        escapeXml(h.desc) +
        "</DESCRIPTION><FISCALPMT>0</FISCALPMT>" +
        (h.dept ? "<DEPTID>" + escapeXml(h.dept) + "</DEPTID>" : "") +
        (h.project ? "<PROJECTID>" + escapeXml(h.project) + "</PROJECTID>" : "") +
        "<VOID>0</VOID><BILLTOID>" +
        escapeXml(h.cust) +
        "</BILLTOID><OVERPAYUSED/><APPLYFROMCREDIT>0</APPLYFROMCREDIT><CURRENCYNAME>" +
        escapeXml(h.cur) +
        "</CURRENCYNAME><RETURNCREDIT>0</RETURNCREDIT></CUSTOMERRECEIPT>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    const byCur: Record<string, number> = {};
    ctx.order.forEach((v) => {
      const g = ctx.groups[v]!;
      totalLines += g.lines.length;
      let t = 0;
      g.lines.forEach((l) => (t += l.amt));
      byCur[g.head.cur] = (byCur[g.head.cur] ?? 0) + t;
    });
    return {
      stats: [
        [ctx.order.length, "Penerimaan"],
        [totalLines, "Faktur dilunasi"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: Object.keys(byCur).map((c) => fmtMoney(byCur[c]!) + " " + c).join(" · ") + " — pastikan tiap No_Faktur sudah ada di Accurate",
      rowCount: totalLines,
    };
  },
};
