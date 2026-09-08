import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 68 — ditemukan 2026-09-08 (client retest Sales Invoice, error
// Accurate "Kategori Keuangan TES 1 tidak ditemukan atau sudah
// dihapus"): Atribut Tambahan item-level (`detailItem.dataClassificationNName`,
// § Fase 55/61) BUKAN teks bebas — API resmi Accurate `/api/data-classification`
// (label "Kategori Keuangan") mewajibkan nilainya SUDAH ADA sebagai
// master data lebih dulu. Mirror pola `findOrCreateCustomer`/
// `findOrCreateItem` (accurate-customer.ts/accurate-item.ts) supaya user
// tidak perlu bikin manual dulu di Accurate sebelum import — auto-create
// kalau belum ada.
export type DataClassificationResult = {
  id: number;
  name: string;
};

export async function findDataClassificationByName(
  ctx: AccurateSessionContext,
  index: number,
  name: string,
): Promise<{ id: number; name: string } | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({
      index: String(index),
      "filter.keywords.op": "EQUAL",
      "filter.keywords.val": name,
      fields: "id,index,name",
    });
    const res = await fetch(`${ctx.host}/accurate/api/data-classification/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; index: number; name: string }[]>(res);
    // § `filter.keywords` di spec resmi cuma didokumentasikan sebagai
    // pencarian umum (bukan dijamin exact-match) — cocokkan ulang index+name
    // persis di sisi kita, jangan percaya hasil filter API mentah-mentah.
    return list.find((d) => d.index === index && d.name.trim().toLowerCase() === name.trim().toLowerCase());
  });
}

// § `index` (1-10) WAJIB sesuai slot Atribut Tambahan yang dipakai
// (dataClassification1Name -> index 1, dst) — Accurate memisahkan
// Kategori Keuangan per slot, nama yang sama di slot berbeda dianggap
// record BEDA.
export async function findOrCreateDataClassification(
  ctx: AccurateSessionContext,
  index: number,
  name: string,
): Promise<{ id: number; name: string }> {
  const existing = await findDataClassificationByName(ctx, index, name);
  if (existing) return existing;

  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/data-classification/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ index, name }),
    });
    return parseAccurateSaveEnvelope<DataClassificationResult>(res);
  });
}
