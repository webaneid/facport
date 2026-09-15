import { parseAccurateEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 86 (2026-09-10) — validasi "Tax ID" (Sales Receipt), scope
// `tax_view`. DIKONFIRMASI via test call NYATA ke `/api/tax/list.do`
// (company demo, 2026-09-10): response BUKAN "no pajak" berupa kode
// bebas, tapi record Master Data Pajak dengan `id` (Long, internal),
// `taxCode` (mis. "PPN", "Pajak Penghasilan Ps.23" — TIDAK unik per
// record, beberapa PPh23Type share taxCode sama) dan `description`
// (mis. "Jasa Kebersihan" — UNIK per record, ini yang tampil di UI
// Accurate). `sales-receipt/save.do` TIDAK punya field untuk ini (sudah
// dikonfirmasi exhaustif Fase 85) — jadi field ini SENGAJA validasi-only,
// TIDAK PERNAH masuk payload kirim ke Accurate, murni mencegah client
// salah ketik kode/nama pajak yang tidak ada di company mereka.
export type TaxRecord = {
  id: number;
  taxCode: string;
  description: string;
  taxType: string;
};

async function fetchTaxList(ctx: AccurateSessionContext): Promise<TaxRecord[]> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/tax/list.do?sp.pageSize=200`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    return parseAccurateEnvelope<TaxRecord[]>(res);
  });
}

// § Identifier dari kolom Excel "Tax ID" DITERIMA fleksibel — angka
// (cocok ke `id` internal Accurate) ATAU teks (cocok ke `taxCode` ATAU
// `description`, case-insensitive) — user biasa lebih mungkin tahu
// nama/kode pajak ("Jasa Kebersihan") daripada id internal (1800).
// ⚠️ DIKONFIRMASI via test call nyata (2026-09-10, company demo): `taxCode`
// TIDAK UNIK untuk PPh23 — mis. "Pajak Penghasilan Ps.23" dipakai banyak
// `description` berbeda (Jasa Kebersihan, Jasa Software Komputer, dst).
// Template guide SUDAH sarankan pakai `description` (unik), bukan `taxCode`.
//
// § Fase 118+ (2026-09-15) — DIPERKUAT setelah customer retest nyata
// melaporkan PPh salah/tidak terpotong meski payload sudah ikuti struktur
// resmi Accurate Support (`detailTax[]` di root, dst — § sales-receipt.mapping.ts
// Fase 99). Root cause paling mungkin: fungsi ini SEBELUMNYA mencari ke
// SELURUH Master Data Pajak (`/api/tax/list.do` balikin PPh15/21/22/23/
// PS4/PPN/PPNBM SEKALIGUS, § `taxType` enum resmi accurate-openapi.json)
// TANPA filter jenis — kalau `taxCode`/`description` yang diisi user
// (sengaja/tidak sengaja) kebetulan cocok ke record BUKAN PPh23 (mis.
// record PPN), `.find()` balikin match PERTAMA di urutan list APAPUN
// jenisnya, TANPA notifikasi kalau itu bukan PPh23. Fitur "Tax ID"/"Tax
// Amount" di Sales Receipt & Purchase Payment SECARA EKSPLISIT dokumentasi
// & UI-nya ("Nomor bukti potong PPh23") cuma untuk PPh23 — filter
// `taxType === "PPH23"` di sini MEMPERSEMPIT pencarian ke kategori yang
// benar SAJA, mengeliminasi kelas kesalahan ini SELURUHNYA (bukan cuma
// mengurangi kemungkinan), termasuk untuk match numerik (kalau user
// kebetulan ketik id internal record yang BUKAN PPh23, sekarang gagal
// jelas alih-alih diam-diam terkirim dengan taxId salah jenis).
export async function findTaxByIdentifier(
  ctx: AccurateSessionContext,
  identifier: string,
): Promise<TaxRecord | undefined> {
  const trimmed = identifier.trim();
  if (trimmed === "") return undefined;
  const list = await fetchTaxList(ctx);
  const pph23Only = list.filter((t) => t.taxType === "PPH23");
  const asNumber = Number(trimmed);
  const isNumeric = !Number.isNaN(asNumber);
  const needle = trimmed.toLowerCase();
  return pph23Only.find((t) => {
    if (isNumeric && Number(t.id) === asNumber) return true;
    const code = typeof t.taxCode === "string" ? t.taxCode.trim().toLowerCase() : "";
    const desc = typeof t.description === "string" ? t.description.trim().toLowerCase() : "";
    return code === needle || desc === needle;
  });
}
