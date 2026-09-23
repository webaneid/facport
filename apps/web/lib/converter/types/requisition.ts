import { str, num, normDate, escapeXml, reserved, envelope, checkHeaders } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 151, ADR-0038 — port VERBATIM `TYPES.requisition` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1082-1128). Dokumen internal PALING SEDERHANA dari 16 tipe (tanpa pajak/stok/jurnal) — dipilih sebagai
// pilot end-to-end pertama Fase 151+ (§ docs/phases/phase-151-konverter-requisition.md). Logic `process`/`build`/
// `summary` di bawah WAJIB IDENTIK dengan sumbernya — HANYA bahasa program yang berubah (JS lepas → TypeScript),
// termasuk pesan error/warning verbatim (Bahasa Indonesia, dibaca customer di UI).
type RequisitionLine = { itemNo: string; desc: string; unit: string; qty: number; notes: string };
type RequisitionHead = { req: string; date: string | null; desc: string };
type RequisitionGroup = { head: RequisitionHead; lines: RequisitionLine[] };
type RequisitionCtx = ConverterCtxBase & { order: string[]; groups: Record<string, RequisitionGroup> };

export const requisitionType: ConverterType<RequisitionCtx> = {
  key: "konverter_requisition",
  label: "Permintaan Barang (Requisition)",
  needsCurrency: false,
  note: "<b>Permintaan Barang.</b> Satu baris = satu item; baris dengan No_Permintaan sama digabung. Dokumen internal — tidak menyentuh stok, jurnal, maupun pajak.",
  headers: ["No_Permintaan", "Tgl_Permintaan", "Kode_Barang", "Deskripsi", "Satuan", "Kuantitas", "Catatan", "Keterangan"],
  examples: [
    ["09/00004", "2026-01-17", "AC-Chang", "AC Changhong CS-C09P3", "set", 5, "", ""],
    ["09/00005", "2026-01-18", "SG-40", "Semen Gresik 40kg", "zak", 100, "untuk proyek PBT.005", "Kebutuhan proyek Januari"],
  ],
  sheetName: "Permintaan Barang",
  fileName: "import_permintaan_barang_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_Permintaan", "Tgl_Permintaan", "Kode_Barang", "Kuantitas"]));
    const groups: Record<string, RequisitionGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const req = str(r.No_Permintaan);
      if (!req) {
        errors.push("Baris " + ln + ": No_Permintaan kosong.");
        return;
      }
      const date = normDate(r.Tgl_Permintaan);
      if (!date) errors.push("Baris " + ln + " (" + req + "): Tgl_Permintaan kosong/format salah (YYYY-MM-DD).");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + req + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + req + "): Kuantitas tidak valid.");
      const line: RequisitionLine = { itemNo: str(r.Kode_Barang), desc: str(r.Deskripsi), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, notes: str(r.Catatan) };
      const head: RequisitionHead = { req, date, desc: str(r.Keterangan) };
      if (!groups[req]) {
        groups[req] = { head, lines: [] };
        order.push(req);
      }
      groups[req]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((req, gi) => {
      const g = ctx.groups[req]!;
      const h = g.head;
      let lines = "";
      g.lines.forEach((l, li) => {
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
          "</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES/><GROUPSEQ/><REQDATE>" +
          escapeXml(h.date) +
          "</REQDATE>" +
          (l.notes ? "<NOTES>" + escapeXml(l.notes) + "</NOTES>" : "<NOTES/>") +
          "</ITEMLINE>";
      });
      body +=
        '<REQUISITION operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSACTIONID>' +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<REQNO>" +
        escapeXml(h.req) +
        "</REQNO><REQDATE>" +
        escapeXml(h.date) +
        "</REQDATE>" +
        (h.desc ? "<DESCRIPTION>" + escapeXml(h.desc) + "</DESCRIPTION>" : "<DESCRIPTION/>") +
        "</REQUISITION>";
    });
    return envelope(ctx.branch, body);
  },

  summary(ctx) {
    let totalLines = 0;
    ctx.order.forEach((v) => {
      totalLines += ctx.groups[v]!.lines.length;
    });
    return {
      stats: [
        [ctx.order.length, "Permintaan"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: ctx.order.length + " permintaan barang — dokumen internal, tidak menyentuh stok/jurnal.",
      // § Fase 151 — baris item yang LOLOS validasi (dokumen ter-grup, § field `rowCount` ConverterSummary),
      // dikirim ke gerbang kuota trial saat download.
      rowCount: totalLines,
    };
  },
};
