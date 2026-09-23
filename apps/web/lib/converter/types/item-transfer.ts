import { str, num, normDate, escapeXml, reserved, envelope, checkHeaders, fmtMoney } from "../shared";
import type { ConverterType, ConverterCtxBase } from "../converter-type";

// § Fase 152, ADR-0038 — port VERBATIM `TYPES.itemtransfer` dari `/Users/webane/sites/konverter/tool.html`
// (baris 1304-1349). BEDA dari `konverter_item_transfer` Facport (modul terpisah, API Accurate Online) — ini
// versi Accurate DESKTOP (XML `WTRAN`), TIDAK ADA hubungan/reuse kode sama sekali dengan modul Facport.
type ItemTransferLine = { itemNo: string; unit: string; qty: number; price: number };
type ItemTransferHead = { no: string; date: string | null; from: string; to: string; desc: string };
type ItemTransferGroup = { head: ItemTransferHead; lines: ItemTransferLine[] };
type ItemTransferCtx = ConverterCtxBase & { order: string[]; groups: Record<string, ItemTransferGroup> };

export const itemTransferType: ConverterType<ItemTransferCtx> = {
  key: "konverter_item_transfer",
  label: "Pindah Barang (Item Transfer)",
  needsCurrency: false,
  note:
    "<b>Pindah Barang.</b> Satu baris = satu item; baris dengan No_Pindah sama digabung. Memindahkan stok antar " +
    "gudang — <b>Dari_Gudang dan Ke_Gudang wajib beda</b> dan harus sudah ada di Accurate. Harga_Satuan opsional " +
    "(nilai perpindahan tetap memakai harga pokok internal Accurate). Alamat gudang diisi Accurate dari master.",
  headers: ["No_Pindah", "Tgl_Pindah", "Dari_Gudang", "Ke_Gudang", "Kode_Barang", "Satuan", "Kuantitas", "Harga_Satuan", "Keterangan"],
  examples: [
    ["1000", "2026-01-17", "DEPAN", "ELEKTRONIK", "AC-Pan", "set", 2, 5700000, ""],
    ["1001", "2026-01-18", "MATERIAL", "DEPAN", "SG-40", "zak", 50, 0, "stok balik dari proyek"],
  ],
  sheetName: "Pindah Barang",
  fileName: "import_pindah_barang_accurate5.xml",

  process(rows, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    errors.push(...checkHeaders(rows, ["No_Pindah", "Tgl_Pindah", "Dari_Gudang", "Ke_Gudang", "Kode_Barang", "Kuantitas"]));
    const groups: Record<string, ItemTransferGroup> = {};
    const order: string[] = [];
    rows.forEach((r, i) => {
      const ln = i + 2;
      const no = str(r.No_Pindah);
      if (!no) {
        errors.push("Baris " + ln + ": No_Pindah kosong.");
        return;
      }
      const date = normDate(r.Tgl_Pindah);
      if (!date) errors.push("Baris " + ln + " (" + no + "): Tgl_Pindah kosong/format salah (YYYY-MM-DD).");
      const from = str(r.Dari_Gudang);
      const to = str(r.Ke_Gudang);
      if (!from) errors.push("Baris " + ln + " (" + no + "): Dari_Gudang kosong.");
      if (!to) errors.push("Baris " + ln + " (" + no + "): Ke_Gudang kosong.");
      if (from && to && from === to) errors.push("Baris " + ln + " (" + no + "): Dari_Gudang dan Ke_Gudang sama ('" + from + "') — pindah barang harus antar gudang berbeda.");
      if (!str(r.Kode_Barang)) errors.push("Baris " + ln + " (" + no + "): Kode_Barang kosong.");
      const qty = num(r.Kuantitas);
      if (isNaN(qty) || qty <= 0) errors.push("Baris " + ln + " (" + no + "): Kuantitas tidak valid.");
      let price = num(r.Harga_Satuan);
      if (isNaN(price) || price < 0) price = 0;
      const line: ItemTransferLine = { itemNo: str(r.Kode_Barang), unit: str(r.Satuan), qty: isNaN(qty) ? 0 : qty, price };
      const head: ItemTransferHead = { no, date, from, to, desc: str(r.Keterangan) };
      if (!groups[no]) {
        groups[no] = { head, lines: [] };
        order.push(no);
      } else {
        const h = groups[no]!.head;
        if (h.from !== from || h.to !== to || h.date !== head.date) warnings.push("Pindah " + no + ": gudang/tanggal berbeda antar baris — dipakai nilai baris pertama.");
      }
      groups[no]!.lines.push(line);
    });
    return { errors, warnings, branch: opts.branch, order, groups };
  },

  build(ctx) {
    let body = "";
    ctx.order.forEach((no, gi) => {
      const g = ctx.groups[no]!;
      const h = g.head;
      let lines = "";
      g.lines.forEach((l) => {
        lines +=
          '<ITEMLINE operation="Add"><KeyID/><ITEMNO>' +
          escapeXml(l.itemNo) +
          "</ITEMNO><QUANTITY>" +
          l.qty +
          "</QUANTITY><ITEMUNIT>" +
          escapeXml(l.unit) +
          "</ITEMUNIT><UNITRATIO>1</UNITRATIO>" +
          reserved() +
          "<UNITPRICE>" +
          l.price +
          "</UNITPRICE><QTYCONTROL>0</QTYCONTROL></ITEMLINE>";
      });
      body +=
        '<WTRAN operation="Add" REQUESTID="' +
        (gi + 1) +
        '"><TRANSFERID>' +
        (gi + 1) +
        "</TRANSFERID><TRANSACTIONID>" +
        (gi + 1) +
        "</TRANSACTIONID>" +
        lines +
        "<TRANSFERNO>" +
        escapeXml(h.no) +
        "</TRANSFERNO><TRANSFERDATE>" +
        escapeXml(h.date) +
        "</TRANSFERDATE>" +
        (h.desc ? "<DESCRIPTION>" + escapeXml(h.desc) + "</DESCRIPTION>" : "<DESCRIPTION/>") +
        "<FROMWHID>" +
        escapeXml(h.from) +
        "</FROMWHID><TOWHID>" +
        escapeXml(h.to) +
        "</TOWHID><FROMWHADDRESS></FROMWHADDRESS><TOWHADDRESS></TOWHADDRESS></WTRAN>";
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
        [ctx.order.length, "Pindah Barang"],
        [totalLines, "Baris item"],
        [ctx.errors.length, "Error"],
        [ctx.warnings.length, "Peringatan"],
      ],
      totals: fmtMoney(totalQty) + " total kuantitas dipindah antar gudang",
      rowCount: totalLines,
    };
  },
};
