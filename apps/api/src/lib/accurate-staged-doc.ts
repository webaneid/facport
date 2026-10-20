import { parseAccurateEnvelope, isAccurateRecordNotFound, AccurateApiError } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { accurateFetch } from "./accurate-http";
import type { StagedDoc, StagedLine } from "./staged-send";

// § Fase 205, architecture-staged-send.md — membaca ISI dokumen pembayaran/penerimaan di Accurate lewat NOMOR (sumber kebenaran kemajuan kiriman bertahap).
// `null` = Accurate menjawab "tidak tepat" (dokumen tidak ada; terkonfirmasi di trial 2026-10-21). Bentuk baris terukur di trial: `detailInvoice[]` berisi `id`,
// `seq`, `paymentAmount`, dan `invoice.number`. Tanpa nomor faktur/id yang terbaca → galat (BUKAN dianggap kosong, supaya tidak mengirim ganda).
export type StagedResource = "sales-receipt" | "purchase-payment";

type RawLine = { id?: unknown; paymentAmount?: unknown; invoice?: { number?: unknown } | null; invoiceNo?: unknown };

type RawDoc = { id?: unknown; detailInvoice?: unknown; detailTax?: unknown; customer?: { customerNo?: unknown } | null; vendor?: { vendorNo?: unknown } | null; bank?: { no?: unknown } | null; bankNo?: unknown };

export function parseStagedDoc(raw: RawDoc, label: string): StagedDoc {
  const id = Number(raw?.id);
  if (!Number.isFinite(id) || id <= 0) throw new AccurateApiError(`Respons detail ${label} tidak memuat id yang bisa dibaca`, 200);
  const rawLines = Array.isArray(raw.detailInvoice) ? (raw.detailInvoice as RawLine[]) : [];
  const lines: StagedLine[] = rawLines.map((l, i) => {
    const lineId = Number(l?.id);
    const invoiceNo = l?.invoice?.number ?? l?.invoiceNo;
    if (!Number.isFinite(lineId) || lineId <= 0 || typeof invoiceNo !== "string" || invoiceNo === "") {
      throw new AccurateApiError(`Baris ke-${i + 1} pada ${label} tidak memuat id/nomor faktur yang bisa dibaca`, 200);
    }
    return { id: lineId, invoiceNo, paymentAmount: Number(l.paymentAmount ?? 0) };
  });
  const taxIds = (Array.isArray(raw.detailTax) ? (raw.detailTax as { id?: unknown }[]) : [])
    .map((t) => Number(t?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const party = raw.customer?.customerNo ?? raw.vendor?.vendorNo;
  const bank = raw.bank?.no ?? raw.bankNo;
  return {
    id,
    lines,
    taxIds,
    ...(typeof party === "string" && party !== "" ? { partyNo: party } : {}),
    ...(typeof bank === "string" && bank !== "" ? { bankNo: bank } : {}),
  };
}

export async function getStagedDocByNumber(ctx: AccurateSessionContext, resource: StagedResource, number: string): Promise<StagedDoc | null> {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/${resource}/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: RawDoc;
    try {
      raw = await parseAccurateEnvelope(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) return null;
      throw err;
    }
    return parseStagedDoc(raw, `${resource} "${number}"`);
  });
}
