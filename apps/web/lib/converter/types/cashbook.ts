import { str, num, normDate, escapeXml, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 153, ADR-0038 — port VERBATIM `cashbookType(kind)` dari `/Users/webane/sites/konverter/tool.html`
// (baris 603-671) — factory function TUNGGAL yang legacy pakai untuk `otherdeposit`/`otherpayment` (struktur
// XML SAMA, cuma root tag/beberapa field beda). Diporting SEBAGAI factory juga (BUKAN 2 file terduplikasi) —
// mirror pola DRY sumbernya, § architecture-konverter.md "otherdeposit/otherpayment ... 1 builder generik".
type CashbookLine = { akun: string; amt: number; desc: string; dept: string; project: string };
type CashbookHead = { v: string; date: string | null; bank: string; memo: string; payee: string; cek: string };
type CashbookGroup = { head: CashbookHead; lines: CashbookLine[] };
type CashbookCtx = ConverterCtxBase & { order: string[]; groups: Record<string, CashbookGroup> };

function cashbookType(kind: "deposit" | "payment"): ConverterType<CashbookCtx> {
  const isPay = kind === "payment";
  const root = isPay ? "OTHERPAYMENT" : "OTHERDEPOSIT";
  const transtype = isPay ? "other payment" : "other deposit";
  const headers = ["No_Voucher", "Tanggal", "Akun_Kas_Bank", "Memo", "Akun_Lawan", "Jumlah", "Keterangan_Baris", "Project", "Departemen"].concat(isPay ? ["Penerima", "No_Cek"] : []);
  const examples: (string | number)[][] = isPay
    ? [
        ["BKK-001", "2026-01-27", "1102-002", "Biaya ATK", "6200-001", 500000, "Pembelian ATK", "PRJ-01", "DEPT-01", "Toko Maju", ""],
        ["BKK-002", "2026-01-28", "1102-002", "Bayar listrik", "6200-002", 1200000, "Listrik Januari", "", "", "PLN", ""],
      ]
    : [
        ["BKM-001", "2026-01-12", "1102-002", "Bunga bank", "7100-003", 3500000, "Jasa giro Januari", "PRJ-01", "DEPT-01"],
        ["BKM-002", "2026-01-20", "1102-002", "Penerimaan lain", "7100-003", 1000000, "Refund supplier", "", ""],
        ["BKM-002", "2026-01-20", "1102-002", "Penerimaan lain", "4200-001", 500000, "Penjualan aset kecil", "", ""],
      ];

  return {
    key: isPay ? "konverter_other_payment" : "konverter_other_deposit",
    label: isPay ? "Pembayaran Lain (Other Payment)" : "Penerimaan Lain (Other Deposit)",
    needsCurrency: false,
    note:
      "<b>" +
      (isPay ? "Pembayaran Lain" : "Penerimaan Lain") +
      ".</b> " +
      (isPay ? "Uang keluar dari kas/bank ke akun biaya/lawan." : "Uang masuk ke kas/bank dari akun pendapatan/lawan.") +
      " <b>Akun_Kas_Bank</b> = rekening kas/bank; <b>Akun_Lawan</b> = " +
      (isPay ? "akun biaya/tujuan" : "akun pendapatan/sumber") +
      ". Baris dengan No_Voucher sama digabung jadi satu transaksi. <b>IDR saja</b> di versi ini. Kolom <b>Project</b> & <b>Departemen</b> opsional (per baris distribusi).",
    headers,
    examples,
    sheetName: isPay ? "Pembayaran Lain" : "Penerimaan Lain",
    fileName: isPay ? "import_pembayaran_lain_accurate5.xml" : "import_penerimaan_lain_accurate5.xml",

    process(rows, opts) {
      const errors: string[] = [];
      const warnings: string[] = [];
      errors.push(...checkHeaders(rows, ["No_Voucher", "Tanggal", "Akun_Kas_Bank", "Akun_Lawan", "Jumlah"]));
      const groups: Record<string, CashbookGroup> = {};
      const order: string[] = [];
      rows.forEach((r, i) => {
        const ln = i + 2;
        const v = str(r.No_Voucher);
        if (!v) {
          errors.push("Baris " + ln + ": No_Voucher kosong.");
          return;
        }
        const date = normDate(r.Tanggal);
        if (!date) errors.push("Baris " + ln + " (" + v + "): Tanggal kosong/format salah (YYYY-MM-DD).");
        const bank = str(r.Akun_Kas_Bank);
        if (!bank) errors.push("Baris " + ln + " (" + v + "): Akun_Kas_Bank kosong.");
        const akun = str(r.Akun_Lawan);
        if (!akun) errors.push("Baris " + ln + " (" + v + "): Akun_Lawan kosong.");
        const amt = num(r.Jumlah);
        if (isNaN(amt) || amt <= 0) errors.push("Baris " + ln + " (" + v + "): Jumlah tidak valid (harus > 0).");
        if (bank && akun && bank === akun) warnings.push("Baris " + ln + " (" + v + "): Akun_Lawan sama dengan Akun_Kas_Bank — baris saling meniadakan.");
        const line: CashbookLine = { akun, amt: isNaN(amt) ? 0 : amt, desc: str(r.Keterangan_Baris), dept: str(r.Departemen), project: str(r.Project) };
        const head: CashbookHead = { v, date, bank, memo: str(r.Memo), payee: isPay ? str(r.Penerima) : "", cek: isPay ? str(r.No_Cek) : "" };
        if (!groups[v]) {
          groups[v] = { head, lines: [] };
          order.push(v);
        } else {
          const h = groups[v]!.head;
          if (h.bank !== head.bank || h.date !== head.date) warnings.push("Voucher " + v + ": Akun_Kas_Bank/Tanggal berbeda antar baris — dipakai nilai baris pertama.");
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
            '<ACCOUNTLINE operation="Add"><KeyID>' +
            (li + 1) +
            "</KeyID><GLACCOUNT>" +
            escapeXml(l.akun) +
            "</GLACCOUNT><GLAMOUNT>" +
            l.amt +
            "</GLAMOUNT>" +
            (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
            (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
            "<DESCRIPTION>" +
            escapeXml(l.desc) +
            "</DESCRIPTION><RATE>1</RATE><PRIMEAMOUNT>" +
            l.amt +
            "</PRIMEAMOUNT><TXDATE/><POSTED/><CURRENCYNAME/></ACCOUNTLINE>";
        });
        let foot =
          "<JVNUMBER>" +
          escapeXml(h.v) +
          "</JVNUMBER><TRANSDATE>" +
          escapeXml(h.date) +
          "</TRANSDATE><SOURCE>GL</SOURCE><TRANSTYPE>" +
          transtype +
          "</TRANSTYPE><TRANSDESCRIPTION>" +
          escapeXml(h.memo) +
          "</TRANSDESCRIPTION><JVAMOUNT>" +
          total +
          "</JVAMOUNT>";
        if (isPay) foot += "<CHEQUENO>" + escapeXml(h.cek) + "</CHEQUENO><PAYEE>" + escapeXml(h.payee) + "</PAYEE><VOIDCHEQUE>0</VOIDCHEQUE>";
        foot += "<GLACCOUNT>" + escapeXml(h.bank) + "</GLACCOUNT><RATE>1</RATE>";
        body += "<" + root + ' operation="Add" REQUESTID="' + (gi + 1) + '"><TRANSACTIONID>' + (gi + 1) + "</TRANSACTIONID>" + lines + foot + "</" + root + ">";
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
          [ctx.order.length, "Voucher"],
          [totalLines, "Baris"],
          [ctx.errors.length, "Error"],
          [ctx.warnings.length, "Peringatan"],
        ],
        totals: "Total " + (isPay ? "pembayaran" : "penerimaan") + ": " + fmtMoney(total) + " IDR",
        rowCount: totalLines,
      };
    },
  };
}

export const otherDepositType = cashbookType("deposit");
export const otherPaymentType = cashbookType("payment");
