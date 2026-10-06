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
};

export type SalesQuotationHeader = {
  paymentTermName?: string;
  toAddress?: string;
  description?: string;
  cashDiscount?: number;
  cashDiscPercent?: string;
  currencyCode?: string;
};

export type SalesQuotationExpense = {
  accountNo: string;
  expenseName: string | null;
  expenseAmount: number;
  expenseNotes: string | null;
};

export type SalesQuotationDetail = {
  header: SalesQuotationHeader;
  lines: SalesQuotationLine[];
  expenses: SalesQuotationExpense[];
};

type Named = { name?: unknown; no?: unknown; code?: unknown; projectNo?: unknown; number?: unknown; salesmanNumber?: unknown } | null | undefined;

type RawQuotationLine = {
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
};

type RawQuotationExpense = {
  account?: { no?: unknown } | null;
  accountNo?: unknown;
  expenseName?: unknown;
  expenseAmount?: unknown;
  expenseNotes?: unknown;
};

type RawQuotation = {
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

export function parseSalesQuotationDetail(raw: RawQuotation | null | undefined, quotationNumber: string): SalesQuotationDetail {
  const items = raw?.detailItem ?? [];
  if (items.length === 0) throw new Error(`Penawaran "${quotationNumber}" tidak punya baris item di Accurate — tidak ada yang bisa diambil.`);
  if (items.length > MAX_QUOTATION_LINES) {
    throw new Error(`Penawaran "${quotationNumber}" punya ${items.length} baris item — melebihi batas ${MAX_QUOTATION_LINES} baris untuk pengambilan otomatis. Isi baris item di Excel secara manual.`);
  }
  const lines = items.map((it, index) => {
    const itemNo = text(it.item?.no) ?? text(it.itemNo);
    const unitName = text(it.itemUnit?.name) ?? text(it.unit?.name) ?? text(it.itemUnitName);
    const unitPrice = num(it.unitPrice);
    const quantity = num(it.quantity);
    const unreadable = [!itemNo && "kode barang", unitPrice === null && "harga", (quantity === null || quantity <= 0) && "qty", !unitName && "satuan"].filter(Boolean);
    if (unreadable.length > 0) {
      throw new Error(
        `Baris ke-${index + 1} penawaran "${quotationNumber}" tidak bisa dibaca lengkap dari Accurate (${unreadable.join(", ")}) — isi kolom item di Excel secara manual untuk baris ini, atau hubungi support.`,
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
    };
    for (const [k, v] of Object.entries(extras)) if (v !== undefined) (line as Record<string, unknown>)[k] = v;
    return line;
  });

  const expenses = (raw?.detailExpense ?? []).map((ex, index): SalesQuotationExpense => {
    const accountNo = text(ex.account?.no) ?? text(ex.accountNo);
    const expenseAmount = num(ex.expenseAmount);
    if (!accountNo || expenseAmount === null) {
      throw new Error(
        `Baris Beban ke-${index + 1} penawaran "${quotationNumber}" tidak bisa dibaca lengkap dari Accurate (${[!accountNo && "akun", expenseAmount === null && "jumlah"].filter(Boolean).join(", ")}) — isi kolom Expense di Excel secara manual, atau hubungi support.`,
      );
    }
    return { accountNo, expenseName: text(ex.expenseName), expenseAmount, expenseNotes: text(ex.expenseNotes) };
  });

  const header: SalesQuotationHeader = {};
  const headerExtras = {
    paymentTermName: relation(raw?.paymentTerm, ["name"], raw?.paymentTermName),
    toAddress: text(raw?.toAddress) ?? undefined,
    description: text(raw?.description) ?? undefined,
    cashDiscount: positiveNum(raw?.cashDiscount),
    cashDiscPercent: percentText(raw?.cashDiscPercent),
    currencyCode: relation(raw?.currency, ["code"], raw?.currencyCode),
  };
  for (const [k, v] of Object.entries(headerExtras)) if (v !== undefined) (header as Record<string, unknown>)[k] = v;

  return { header, lines, expenses };
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
