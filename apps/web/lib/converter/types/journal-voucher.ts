import { str, num, normDate, escapeXml, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 152, ADR-0038 — port VERBATIM `TYPES.journalvoucher` dari `/Users/webane/sites/konverter/tool.html`
// (baris 793-861). VALIDASI BISNIS PALING KETAT dari 16 tipe: debit=kredit WAJIB balance per dokumen (§
// architecture-konverter.md "Catatan bisnis khusus per tipe"), TOLAK kalau tidak balance — JANGAN dilonggarkan.
type JournalVoucherLine = {
  akun: string;
  desc: string;
  cur: string;
  rate: number;
  prime: number; // nilai mata uang asing (bertanda: debit positif, kredit negatif)
  base: number; // nilai IDR (bertanda) — INI yang harus balance ke 0 per dokumen
  dept: string;
  project: string;
  subType: string;
  subID: string;
};
type JournalVoucherHead = { jv: string; date: string | null; memo: string };
type JournalVoucherGroup = { head: JournalVoucherHead; lines: JournalVoucherLine[]; debit?: number };
type JournalVoucherCtx = ConverterCtxBase & { order: string[]; groups: Record<string, JournalVoucherGroup> };

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export const journalVoucherType: ConverterType<JournalVoucherCtx> = {
  key: "konverter_journal_voucher",
  label: "Jurnal Umum (Journal Voucher)",
  needsCurrency: true,
  note:
    "<b>Jurnal Umum.</b> Tiap baris = satu akun dengan nilai di kolom <b>Debit</b> ATAU <b>Kredit</b> (salah satu, " +
    "bukan keduanya). Baris dengan No_Jurnal sama digabung jadi satu jurnal, dan <b>debit harus sama dengan " +
    "kredit</b> — jurnal tidak balance akan ditolak. Multi-currency: isi Mata_Uang & Kurs; saldo dihitung dalam " +
    "IDR (nilai × kurs). Kolom <b>Project</b> & <b>Departemen</b> opsional. Untuk menautkan baris ke pemasok/" +
    "pelanggan, isi <b>Tipe_Subsidiary</b> (Pemasok/Pelanggan) & <b>ID_Subsidiary</b> — biasanya pada baris akun " +
    "hutang/piutang.",
  headers: ["No_Jurnal", "Tanggal", "Akun", "Debit", "Kredit", "Keterangan", "Memo_Jurnal", "Mata_Uang", "Kurs", "Project", "Departemen", "Tipe_Subsidiary", "ID_Subsidiary"],
  examples: [
    ["JV/2026/001", "2026-01-31", "6300-001", 500000, 0, "Penyusutan kendaraan", "Penyusutan Januari", "IDR", 1, "PRJ-01", "DEPT-01", "", ""],
    ["JV/2026/001", "2026-01-31", "1602-002", 0, 500000, "Akumulasi penyusutan", "Penyusutan Januari", "IDR", 1, "PRJ-01", "DEPT-01", "", ""],
    ["JV/2026/002", "2026-01-31", "5100-001", 1200000, 0, "Reklasifikasi biaya", "Koreksi", "IDR", 1, "", "", "", ""],
    ["JV/2026/002", "2026-01-31", "6200-001", 0, 1200000, "Reklasifikasi biaya", "Koreksi", "IDR", 1, "", "", "", ""],
  ],
  sheetName: "Jurnal Umum",
  fileName: "import_jurnal_umum_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const defCur = opts.defCurrency || "IDR";
    errors.push(...checkHeaders(rows, ["No_Jurnal", "Tanggal", "Akun"]));
    const groups: Record<string, JournalVoucherGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const jv = str(r.No_Jurnal);
      if (!jv) {
        errors.push("Baris " + ln + ": No_Jurnal kosong.");
        return;
      }
      const date = normDate(r.Tanggal);
      if (!date) errors.push("Baris " + ln + " (" + jv + "): Tanggal kosong/format salah (YYYY-MM-DD).");
      if (!str(r.Akun)) errors.push("Baris " + ln + " (" + jv + "): Akun kosong.");
      let d = num(r.Debit);
      if (isNaN(d)) d = 0;
      let k = num(r.Kredit);
      if (isNaN(k)) k = 0;
      if (d < 0 || k < 0) errors.push("Baris " + ln + " (" + jv + "): Debit/Kredit tidak boleh negatif.");
      if (d > 0 && k > 0) errors.push("Baris " + ln + " (" + jv + "): isi Debit ATAU Kredit, jangan keduanya.");
      if (d === 0 && k === 0) errors.push("Baris " + ln + " (" + jv + "): Debit dan Kredit dua-duanya kosong/0.");
      const cur = str(r.Mata_Uang) || defCur;
      let rate = num(r.Kurs);
      if (isNaN(rate) || rate <= 0) rate = 1;
      const prime = round2(d - k);
      const base = round2(prime * rate);
      const line: JournalVoucherLine = {
        akun: str(r.Akun),
        desc: str(r.Keterangan),
        cur,
        rate,
        prime,
        base,
        dept: str(r.Departemen),
        project: str(r.Project),
        subType: str(r.Tipe_Subsidiary) || str(r["Tipe Subsidiary (Pelanggan/ Pemasok)"]) || str(r["Tipe Subsidiary"]),
        subID: str(r.ID_Subsidiary) || str(r["ID Subsidiary"]),
      };
      if (line.subID && !/(pemasok|vendor|supplier|pelanggan|customer|pembeli)/i.test(line.subType)) {
        warnings.push("Baris " + ln + " (" + jv + "): ID Subsidiary diisi tapi Tipe Subsidiary tak dikenal — isi 'Pelanggan' atau 'Pemasok'.");
      }
      const head: JournalVoucherHead = { jv, date, memo: str(r.Memo_Jurnal) };
      if (!groups[jv]) {
        groups[jv] = { head, lines: [] };
        order.push(jv);
      } else {
        const h = groups[jv]!.head;
        if (h.date !== head.date) warnings.push("Jurnal " + jv + ": Tanggal berbeda antar baris — dipakai baris pertama.");
      }
      groups[jv]!.lines.push(line);
    });
    // § cek balance per jurnal — WAJIB minimal 1 debit dan 1 kredit, selisih < Rp0,005 (toleransi rounding)
    order.forEach((jv) => {
      const g = groups[jv]!;
      let sum = 0;
      let deb = 0;
      let cred = 0;
      let pos = 0;
      let neg = 0;
      g.lines.forEach((l) => {
        sum = round2(sum + l.base);
        if (l.base > 0) {
          deb = round2(deb + l.base);
          pos++;
        } else if (l.base < 0) {
          cred = round2(cred - l.base);
          neg++;
        }
      });
      g.debit = deb;
      if (pos === 0 || neg === 0) {
        errors.push("Jurnal " + jv + ": tidak ada pasangan debit-kredit (butuh minimal satu debit dan satu kredit).");
      } else if (Math.abs(sum) >= 0.005) {
        errors.push("Jurnal " + jv + ": TIDAK BALANCE — debit Rp " + fmtMoney(deb) + ", kredit Rp " + fmtMoney(cred) + ", selisih Rp " + fmtMoney(round2(deb - cred)) + ".");
      }
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    const fmt = (v: number) => String(Math.round(v * 100) / 100);
    let body = "";
    ctx.order.forEach((jv, gi) => {
      const g = ctx.groups[jv]!;
      const h = g.head;
      let lines = "";
      let debit = 0;
      g.lines.forEach((l, li) => {
        if (l.base > 0) debit = Math.round((debit + l.base) * 100) / 100;
        lines +=
          '<ACCOUNTLINE operation="Add"><KeyID>' +
          li +
          "</KeyID><GLACCOUNT>" +
          escapeXml(l.akun) +
          "</GLACCOUNT><GLAMOUNT>" +
          fmt(l.base) +
          "</GLAMOUNT>" +
          (l.dept ? "<DEPTID>" + escapeXml(l.dept) + "</DEPTID>" : "") +
          (l.project ? "<PROJECTID>" + escapeXml(l.project) + "</PROJECTID>" : "") +
          (l.subID
            ? /(pemasok|vendor|supplier)/i.test(l.subType)
              ? "<VENDORNO>" + escapeXml(l.subID) + "</VENDORNO>"
              : /(pelanggan|customer|pembeli)/i.test(l.subType)
                ? "<CUSTOMERNO>" + escapeXml(l.subID) + "</CUSTOMERNO>"
                : ""
            : "") +
          "<DESCRIPTION>" +
          escapeXml(l.desc) +
          "</DESCRIPTION><RATE>" +
          l.rate +
          "</RATE><PRIMEAMOUNT>" +
          fmt(l.prime) +
          "</PRIMEAMOUNT><TXDATE/><POSTED/><CURRENCYNAME>" +
          escapeXml(l.cur === "IDR" ? "" : l.cur) +
          "</CURRENCYNAME></ACCOUNTLINE>";
      });
      body +=
        '<JV operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<JVNUMBER>" +
        escapeXml(h.jv) +
        "</JVNUMBER><TRANSDATE>" +
        escapeXml(h.date) +
        "</TRANSDATE><SOURCE>GL</SOURCE><TRANSTYPE>journal voucher</TRANSTYPE><TRANSDESCRIPTION>" +
        escapeXml(h.memo) +
        "</TRANSDESCRIPTION><JVAMOUNT>" +
        fmt(debit) +
        "</JVAMOUNT></JV>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    let totalDebit = 0;
    ctx.order.forEach((jv) => {
      const g = ctx.groups[jv]!;
      totalLines += g.lines.length;
      totalDebit = Math.round((totalDebit + (g.debit ?? 0)) * 100) / 100;
    });
    return {
      stats: [
        [ctx.order.length, "Jurnal"],
        [totalLines, "Baris"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: ctx.errors.length === 0 ? "Semua jurnal balance · total nilai Rp " + fmtMoney(totalDebit) : "Ada jurnal yang belum balance.",
      rowCount: totalLines,
    };
  },
};
