import { AccurateApiError, parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
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
    const list = await parseAccurateEnvelope<Record<string, unknown>[]>(res);
    // § Fase 72 (2026-09-08) — response `list.do` untuk endpoint ini TIDAK
    // terdokumentasi resmi (spec cuma bilang "200: Success", tanpa
    // schema) — SEMPAT asumsikan field balik namanya persis `index`
    // (sama seperti nama parameter query-nya), TERBUKTI SALAH: lookup
    // ini gagal mengenali record yang SUDAH ADA (bukti nyata: client
    // retest isi "ATES 1" di slot 1, dapat error Accurate
    // "Sudah ada data lain dengan Nama 'ATES 1'" dari save.do — artinya
    // lookup ini TIDAK menemukan record yang ternyata SUDAH ADA, jadi
    // kode lanjut coba create ulang dan ditolak Accurate karena nama
    // sudah dipakai). Diperlonggar: cocokkan HANYA by name (percaya
    // parameter query `index` yang SUDAH dikirim ke Accurate untuk
    // filter server-side), JANGAN syaratkan field `index` di response
    // cocok — field itu mungkin tidak ada/beda nama di response asli.
    return list.find((d) => typeof d.name === "string" && d.name.trim().toLowerCase() === name.trim().toLowerCase()) as
      | { id: number; name: string }
      | undefined;
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
): Promise<{ id: number; name: string } | undefined> {
  const existing = await findDataClassificationByName(ctx, index, name);
  if (existing) return existing;

  try {
    return await withAccurateRateLimit(async () => {
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
  } catch (err) {
    // § Fase 72 — kalau lookup di atas GAGAL mengenali record yang
    // ternyata sudah ada (§ komentar `findDataClassificationByName`),
    // `save.do` menolak dengan pesan "Sudah ada data lain dengan Nama
    // X" — ini justru BUKTI tujuan kita (record-nya ADA) sudah
    // tercapai lebih dulu, bukan kegagalan sungguhan. Nilai balik
    // fungsi ini TIDAK dipakai caller (`ensureDataClassifications`
    // cuma butuh efek sampingnya, § workers/index.ts), jadi aman
    // diamkan di sini alih-alih menggagalkan seluruh baris/faktur.
    if (err instanceof AccurateApiError && /sudah ada data lain/i.test(err.message)) {
      return undefined;
    }
    throw err;
  }
}
