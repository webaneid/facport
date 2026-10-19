import { parseAccurateEnvelope, parseAccurateSaveEnvelope, isAccurateRecordNotFound } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-quotation.md — Sales Quotation BUKAN transaksi
// akuntansi (tidak ada jurnal GL, tidak ada perubahan stok, sekadar
// "proposal/penawaran"), TIDAK ADA "Batal Import" — cuma butuh
// `save.do`. § Fase 169: `detail.do` dipakai MODUL SALES ORDER (bukan modul ini)
// untuk menarik baris item penawaran, § `getSalesQuotationLinesByNumber`.
export type SalesQuotationSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesQuotation(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<SalesQuotationSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-quotation/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesQuotationSaveResult>(res);
  });
}

// § Fase 169/172, architecture-sales-order.md — isi penawaran untuk memperluas baris Sales Order. `GET sales-quotation/detail.do?number=`
// terdaftar di spec (param `id`/`number`) TAPI bentuk RESPONS-nya tidak terdokumentasi; dibaca mengikuti pola detail Sales Order yang
// SUDAH terbukti test call nyata (`item.no` nested, `quantity`, `unitPrice`, `detailName`, `detailNotes`; relasi lain = objek nested
// `{id, name, ...}`). ⚠️ BELUM diverifikasi dengan respons asli. Dua tingkat kehati-hatian:
// - INTI baris (kode barang, harga, qty, satuan): parser KETAT — tidak terbaca membuat seluruh perluasan GAGAL dengan pesan jelas;
//   TIDAK PERNAH mengirim baris setengah-setengah ke Sales Order (harga 0 diam-diam = data akuntansi salah).
// § Terverifikasi respons ASLI 2026-10-07 (Retail Demo, 100 penawaran dipindai): `paymentTerm.name`, `currency.code`, `toAddress`, `description`,
//   `cashDiscount`/`cashDiscPercent` (string "5"), baris `department.name`, `salesmanList[].number`, `useTax1/2/3` boolean, `itemCashDiscount`/`itemDiscPercent`.
//   BELUM terbukti (tidak ada contoh terisi): `project` (null di semua contoh), `detailExpense[]` (kosong di semua contoh).
// - TAMBAHAN (§ Fase 172: header, diskon, dept, proyek, penjual, pajak, Beban): nilai yang tidak terbaca = TIDAK ditarik (kolom Excel yang
//   kosong tetap kosong), kecuali baris Beban penawaran yang ada tapi akun/jumlahnya tidak terbaca → GAGAL jelas (data akuntansi).
export type SalesQuotationLine = {
  itemNo: string;
  itemName: string | null;
  unitPrice: number;
  quantity: number;
  unitName: string;
  notes: string | null;
  // § Fase 172 — opsional, undefined = tidak terbaca/tidak ada di penawaran.
  itemCashDiscount?: number;
  itemDiscPercent?: string;
  departmentName?: string;
  projectNo?: string;
  salesmanListNumber?: string[];
  useTax1?: boolean;
  useTax3?: boolean;
  // § Fase 198 tahap C — gudang baris (dibaca bila ada; dipakai HANYA oleh sumber Delivery Order, modul lain mengabaikannya).
  warehouseName?: string;
  // § Fase 198 (lanjutan, sedang) — atribut tambahan baris yang dibaca TOLERAN (nama = nama field TULIS Sales Invoice): dataClassificationNName,
  // charFieldN, numericFieldN, useTax2. Hanya dipakai Sales Invoice; Sales Order mengabaikannya.
  extra?: Record<string, string | number | boolean>;
};

export type SalesQuotationHeader = {
  paymentTermName?: string;
  toAddress?: string;
  description?: string;
  cashDiscount?: number;
  cashDiscPercent?: string;
  currencyCode?: string;
  // § Fase 198 (lanjutan) — memengaruhi ANGKA faktur: harga termasuk pajak, kena pajak, kurs. Opsional (undefined = tidak terbaca).
  inclusiveTax?: boolean;
  taxable?: boolean;
  rate?: number;
};

export type SalesQuotationExpense = {
  departmentName?: string;
  accountNo: string;
  expenseName: string | null;
  expenseAmount: number;
  expenseNotes: string | null;
};

export type SalesQuotationDetail = {
  // § Fase 198 (lanjutan, sedang) — atribut tambahan header (charFieldN, numericFieldN), dibaca toleran; hanya dipakai Sales Invoice.
  headerExtra?: Record<string, string | number>;
  header: SalesQuotationHeader;
  lines: SalesQuotationLine[];
  expenses: SalesQuotationExpense[];
};

type Named = { name?: unknown; no?: unknown; code?: unknown; projectNo?: unknown; number?: unknown; salesmanNumber?: unknown } | null | undefined;

type RawQuotationLine = {
  [key: string]: unknown; // field atribut dinamis (dataClassificationN, charFieldN, numericFieldN)
  item?: { no?: unknown } | null;
  itemNo?: unknown;
  detailName?: unknown;
  detailNotes?: unknown;
  unitPrice?: unknown;
  quantity?: unknown;
  itemUnit?: { name?: unknown } | null;
  unit?: { name?: unknown } | null;
  itemUnitName?: unknown;
  itemCashDiscount?: unknown;
  itemDiscPercent?: unknown;
  department?: Named;
  departmentName?: unknown;
  project?: Named;
  projectNo?: unknown;
  salesmanList?: unknown;
  useTax1?: unknown;
  useTax3?: unknown;
  tax1?: unknown;
  tax3?: unknown;
  warehouse?: Named;
  warehouseName?: unknown;
};

type RawQuotationExpense = {
  department?: Named;
  departmentName?: unknown;
  account?: { no?: unknown } | null;
  accountNo?: unknown;
  expenseName?: unknown;
  expenseAmount?: unknown;
  expenseNotes?: unknown;
};

export type RawQuotation = {
  [key: string]: unknown; // field atribut header dinamis (charFieldN, numericFieldN)
  detailItem?: RawQuotationLine[];
  detailExpense?: RawQuotationExpense[];
  paymentTerm?: Named;
  paymentTermName?: unknown;
  toAddress?: unknown;
  description?: unknown;
  cashDiscount?: unknown;
  cashDiscPercent?: unknown;
  currency?: Named;
  currencyCode?: unknown;
  // § Fase 198 (lanjutan) — pajak & kurs dokumen sumber (dipakai Sales Invoice; Sales Order mengabaikannya).
  inclusiveTax?: unknown;
  taxable?: unknown;
  rate?: unknown;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Diskon 0 = "tidak ada diskon" → tidak ditarik (hindari menimpa isian default Accurate dengan 0 tanpa arti).
const positiveNum = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== null && n > 0 ? n : undefined;
};
const percentText = (v: unknown): string | undefined => {
  const n = num(v);
  return n !== null && n > 0 ? String(v).trim() : undefined;
};
// Relasi nested Accurate (`{name}`/`{no}`/`{code}`) — atau nilai datar kalau respons memakai bentuk tulis.
const relation = (obj: Named, keys: ("name" | "no" | "code" | "projectNo" | "number" | "salesmanNumber")[], flat?: unknown): string | undefined => {
  for (const k of keys) {
    const v = text(obj?.[k]);
    if (v) return v;
  }
  return text(flat) ?? undefined;
};
const taxFlag = (flag: unknown, relationValue: unknown): boolean | undefined => {
  if (typeof flag === "boolean") return flag;
  if (relationValue && typeof relationValue === "object") return true;
  return undefined;
};
const salesmanNumbers = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const list = v.map((e) => (typeof e === "string" ? text(e) : relation(e as Named, ["number", "salesmanNumber", "no"]))).filter((x): x is string => !!x);
  return list.length > 0 ? list : undefined;
};

// § security review Fase 169 (Medium) — batas jumlah baris hasil perluasan: penawaran nyata jauh di bawah ini; tanpa batas, 1 baris Excel bisa
// menggelembungkan payload `sales-order/save.do` tanpa kendali. Lebih dari batas → ditolak dengan pesan jelas (isi baris item manual di Excel).
export const MAX_QUOTATION_LINES = 500;

// § Fase 198 (lanjutan, sedang) — atribut tambahan: klasifikasi (objek relasi `{name}` atau string datar), karakter (string), angka (0 = tidak diisi).
// Dibaca TOLERAN: bentuk tak dikenal = tidak ditarik. Field tanggal (dateFieldN) SENGAJA tidak ditarik: format nilai di respons Accurate belum diketahui.
function readLineExtras(it: RawQuotationLine): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (let n = 1; n <= 10; n++) {
    const v = relation(it[`dataClassification${n}`] as Named, ["name"], it[`dataClassification${n}Name`]);
    if (v) out[`dataClassification${n}Name`] = v;
  }
  for (let n = 1; n <= 15; n++) {
    const v = text(it[`charField${n}`]);
    if (v) out[`charField${n}`] = v;
  }
  for (let n = 1; n <= 10; n++) {
    const v = num(it[`numericField${n}`]);
    if (v !== null && v !== 0) out[`numericField${n}`] = v;
  }
  const tax2 = taxFlag(it.useTax2, it.tax2);
  if (tax2 !== undefined) out.useTax2 = tax2;
  return out;
}

function readHeaderExtras(raw: RawQuotation | null | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw) return out;
  for (let n = 1; n <= 10; n++) {
    const c = text(raw[`charField${n}`]);
    if (c) out[`charField${n}`] = c;
    const v = num(raw[`numericField${n}`]);
    if (v !== null && v !== 0) out[`numericField${n}`] = v;
  }
  return out;
}

// § Fase 198 tahap B — parser yang SAMA dipakai Sales Order sebagai dokumen sumber Sales Invoice (`docLabel` hanya mengubah kata di pesan galat).
export type SourceDocLabel = "Penawaran" | "Pesanan" | "Pengiriman";

export function parseSalesQuotationDetail(raw: RawQuotation | null | undefined, quotationNumber: string, docLabel: SourceDocLabel = "Penawaran"): SalesQuotationDetail {
  const items = raw?.detailItem ?? [];
  if (items.length === 0) throw new Error(`${docLabel} "${quotationNumber}" tidak punya baris item di Accurate — tidak ada yang bisa diambil.`);
  if (items.length > MAX_QUOTATION_LINES) {
    throw new Error(`${docLabel} "${quotationNumber}" punya ${items.length} baris item — melebihi batas ${MAX_QUOTATION_LINES} baris untuk pengambilan otomatis. Isi baris item di Excel secara manual.`);
  }
  const lines = items.map((it, index) => {
    const itemNo = text(it.item?.no) ?? text(it.itemNo);
    const unitName = text(it.itemUnit?.name) ?? text(it.unit?.name) ?? text(it.itemUnitName);
    const unitPrice = num(it.unitPrice);
    const quantity = num(it.quantity);
    const unreadable = [!itemNo && "kode barang", unitPrice === null && "harga", (quantity === null || quantity <= 0) && "qty", !unitName && "satuan"].filter(Boolean);
    if (unreadable.length > 0) {
      throw new Error(
        `Baris ke-${index + 1} ${docLabel.toLowerCase()} "${quotationNumber}" tidak bisa dibaca lengkap dari Accurate (${unreadable.join(", ")}) — isi kolom item di Excel secara manual untuk baris ini, atau hubungi support.`,
      );
    }
    const line: SalesQuotationLine = { itemNo: itemNo!, itemName: text(it.detailName), unitPrice: unitPrice!, quantity: quantity!, unitName: unitName!, notes: text(it.detailNotes) };
    const extras = {
      itemCashDiscount: positiveNum(it.itemCashDiscount),
      itemDiscPercent: percentText(it.itemDiscPercent),
      departmentName: relation(it.department, ["name"], it.departmentName),
      projectNo: relation(it.project, ["projectNo", "no"], it.projectNo),
      salesmanListNumber: salesmanNumbers(it.salesmanList),
      useTax1: taxFlag(it.useTax1, it.tax1),
      useTax3: taxFlag(it.useTax3, it.tax3),
      warehouseName: relation(it.warehouse, ["name"], it.warehouseName),
    };
    // Persen DAN nominal diskon sama-sama terisi di respons asli (5% & 50) — nominal turunan dari persen; kirim keduanya berisiko bentrok
    // pembulatan di Accurate, jadi bila persen ada, hanya persen yang ditarik.
    if (extras.itemDiscPercent !== undefined) extras.itemCashDiscount = undefined;
    for (const [k, v] of Object.entries(extras)) if (v !== undefined) (line as Record<string, unknown>)[k] = v;
    const lineExtra = readLineExtras(it);
    if (Object.keys(lineExtra).length > 0) line.extra = lineExtra;
    return line;
  });

  const expenses = (raw?.detailExpense ?? []).map((ex, index): SalesQuotationExpense => {
    const accountNo = text(ex.account?.no) ?? text(ex.accountNo);
    const expenseAmount = num(ex.expenseAmount);
    if (!accountNo || expenseAmount === null) {
      throw new Error(
        `Baris Beban ke-${index + 1} ${docLabel.toLowerCase()} "${quotationNumber}" tidak bisa dibaca lengkap dari Accurate (${[!accountNo && "akun", expenseAmount === null && "jumlah"].filter(Boolean).join(", ")}) — isi kolom Expense di Excel secara manual, atau hubungi support.`,
      );
    }
    const departmentName = relation(ex.department, ["name"], ex.departmentName);
    return { accountNo, expenseName: text(ex.expenseName), expenseAmount, expenseNotes: text(ex.expenseNotes), ...(departmentName ? { departmentName } : {}) };
  });

  const header: SalesQuotationHeader = {};
  const headerExtras = {
    paymentTermName: relation(raw?.paymentTerm, ["name"], raw?.paymentTermName),
    toAddress: text(raw?.toAddress) ?? undefined,
    description: text(raw?.description) ?? undefined,
    cashDiscount: positiveNum(raw?.cashDiscount),
    cashDiscPercent: percentText(raw?.cashDiscPercent),
    currencyCode: relation(raw?.currency, ["code"], raw?.currencyCode),
    inclusiveTax: typeof raw?.inclusiveTax === "boolean" ? raw.inclusiveTax : undefined,
    taxable: typeof raw?.taxable === "boolean" ? raw.taxable : undefined,
    rate: positiveNum(raw?.rate),
  };
  if (headerExtras.cashDiscPercent !== undefined) headerExtras.cashDiscount = undefined; // alasan sama dengan diskon baris
  for (const [k, v] of Object.entries(headerExtras)) if (v !== undefined) (header as Record<string, unknown>)[k] = v;

  const headerExtra = readHeaderExtras(raw);
  return { header, lines, expenses, ...(Object.keys(headerExtra).length > 0 ? { headerExtra } : {}) };
}

/** Kompatibilitas Fase 169 — hanya baris item. */
export function parseSalesQuotationLines(raw: RawQuotation | null | undefined, quotationNumber: string): SalesQuotationLine[] {
  return parseSalesQuotationDetail(raw, quotationNumber).lines;
}

export async function getSalesQuotationByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesQuotationDetail> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-quotation/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: RawQuotation;
    try {
      raw = await parseAccurateEnvelope<RawQuotation>(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) throw new Error(`Penawaran "${number}" tidak ditemukan di Accurate — cek kembali kolom "Sales Quot No".`);
      throw err;
    }
    return parseSalesQuotationDetail(raw, number);
  });
}

export async function getSalesQuotationLinesByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesQuotationLine[]> {
  return (await getSalesQuotationByNumber(ctx, number)).lines;
}
