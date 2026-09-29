import { Elysia, t } from "elysia";
import { permissionPlugin } from "../lib/permission";
import { hasAccessToDataUsaha } from "../lib/data-usaha";
import { resolveConnectionForDataUsaha } from "../lib/accurate-connection";
import { openAccurateSession, type AccurateSessionContext } from "../lib/accurate-session";
import { parseAccurateEnvelope, AccurateApiError } from "../lib/accurate";
import { withAccurateRateLimit } from "../lib/accurate-rate-limiter";
import { DATA_USAHA_HEADER } from "../lib/subscription-gate";
import { logger } from "../lib/logger";

// § Fase 163, ADR-0039 — endpoint PERTAMA di Facport yang panggil Accurate
// SINKRON dari HTTP route (bukan job worker) — SENGAJA, search-as-you-type
// tidak bisa lewat job queue (user menunggu hasil saat itu juga). Dirancang
// GENERIC (bukan di-prefix "/autoproduksi/") — modul form-based lain di
// masa depan yang butuh pola serupa reuse endpoint yang sama. READ-ONLY
// murni (GET, tidak pernah menulis apa pun ke Accurate) — filosofi "kode
// dikirim apa adanya, Accurate validasi saat SAVE" untuk operasi TULIS
// TIDAK berubah sama sekali (item-adjustment/save.do dkk tetap dari worker).
//
// Rate limit: sudah otomatis kena `rateLimitPlugin({pathPrefix:"/accurate", max:60})`
// yang SUDAH ADA (`app.ts`, dipasang lintas SEMUA route `/accurate/*`) —
// tidak perlu limiter baru khusus endpoint ini.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_TIMEOUT_MS = 8000;
const SEARCH_PAGE_SIZE = 20;

type LookupError = { code: "DATA_USAHA_REQUIRED" | "DATA_USAHA_FORBIDDEN" | "ACCURATE_NOT_CONNECTED" };

// § header `X-Data-Usaha-Id` (ADR-0035, § subscription-gate.ts) BUKAN
// otorisasi — selalu divalidasi terhadap kepemilikan/seat di DB
// (`hasAccessToDataUsaha`, sama fungsi yang dipakai `moduleAccess` macro).
// Endpoint ini SENGAJA tidak terikat `moduleAccess` 1 modul spesifik
// (lihat komentar atas) — cukup "user ini punya akses APAPUN ke Data
// Usaha ini", supaya reusable modul form-based lain nanti.
async function resolveDataUsahaOrError(userId: string, headers: Headers): Promise<{ dataUsahaId: string } | { error: LookupError }> {
  const raw = headers.get(DATA_USAHA_HEADER)?.trim().toLowerCase();
  if (!raw || !UUID_RE.test(raw)) return { error: { code: "DATA_USAHA_REQUIRED" } };
  if (!(await hasAccessToDataUsaha(userId, raw))) return { error: { code: "DATA_USAHA_FORBIDDEN" } };
  return { dataUsahaId: raw };
}

async function openSessionOrError(dataUsahaId: string): Promise<AccurateSessionContext | { error: LookupError }> {
  const resolved = await resolveConnectionForDataUsaha(dataUsahaId);
  if (!resolved?.connection || !resolved.accurateDbId) return { error: { code: "ACCURATE_NOT_CONNECTED" } };
  return openAccurateSession(resolved.connection, resolved.accurateDbId);
}

function isSessionError(v: AccurateSessionContext | { error: LookupError }): v is { error: LookupError } {
  return "error" in v;
}

// § HOTFIX 2026-09-30 (test call nyata, ditunda Fase 163 — sekarang
// terverifikasi) — `item/list.do`/`glaccount/list.do` TIDAK balikin
// `no`/`name` di response default sama sekali (bukan cuma beda nama
// field seperti diasumsikan awal — field-nya KOSONG total kecuali
// diminta eksplisit). Dikonfirmasi dari kode LAMA yang SUDAH
// terverifikasi test call nyata: `lib/accurate-item.ts` `findItemByNo()`
// ("TERVERIFIKASI 2026-08-20") — `fields: "id,no,name"` WAJIB eksplisit.
// `unit1Name` (nama field satuan primer) diturunkan dari field yang SAMA
// dipakai payload `item/save.do` (`accurate-item.ts` `createFields.unit1Name`)
// — konvensi Accurate field read/write biasanya konsisten nama.
async function fetchAccurateList<T>(ctx: AccurateSessionContext, path: string, keywords: string, fields: string): Promise<T[]> {
  return withAccurateRateLimit(async () => {
    const url = new URL(`${ctx.host}/accurate/api/${path}`);
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("fields", fields);
    url.searchParams.set("sp.pageSize", String(SEARCH_PAGE_SIZE));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    return parseAccurateEnvelope<T[]>(res);
  });
}

type AccurateItemRecord = { no?: string; name?: string; unit1Name?: string } & Record<string, unknown>;
type AccurateGlAccountRecord = { no?: string; name?: string };

export const accurateLookupRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/accurate/items/search",
    async ({ query, user, request, set }) => {
      const duResult = await resolveDataUsahaOrError(user.id, request.headers);
      if ("error" in duResult) {
        set.status = duResult.error.code === "DATA_USAHA_FORBIDDEN" ? 403 : 400;
        return duResult.error;
      }
      const session = await openSessionOrError(duResult.dataUsahaId);
      if (isSessionError(session)) {
        set.status = 400;
        return session.error;
      }
      try {
        // § DIAGNOSTIC SEMENTARA 2026-09-30 — `unit1Name` (guess pertama)
        // TERBUKTI SALAH (no/name benar, unitName tetap kosong setelah
        // deploy v2.18.2). Minta beberapa kandidat nama field sekaligus +
        // sertakan record MENTAH (`_raw`) supaya cukup 1x deploy untuk
        // tahu nama field yang benar — `_raw` TIDAK dipakai frontend
        // (Combobox cuma baca `.unitName`), dihapus lagi begitu ketahuan.
        const records = await fetchAccurateList<AccurateItemRecord>(
          session,
          "item/list.do",
          query.q,
          "id,no,name,unit1Name,unit1,unitName,unit",
        );
        return {
          items: records.map((r) => ({
            no: r.no ?? "",
            name: r.name ?? "",
            unitName: r.unit1Name ?? "",
            _raw: r,
          })),
        };
      } catch (err) {
        logger.error({ err, dataUsahaId: duResult.dataUsahaId }, "Gagal cari Item di Accurate");
        set.status = err instanceof AccurateApiError ? 502 : 500;
        return { code: "ACCURATE_SEARCH_FAILED" };
      }
    },
    { auth: true, query: t.Object({ q: t.String({ minLength: 1, maxLength: 100 }) }) },
  )
  .get(
    "/accurate/glaccounts/search",
    async ({ query, user, request, set }) => {
      const duResult = await resolveDataUsahaOrError(user.id, request.headers);
      if ("error" in duResult) {
        set.status = duResult.error.code === "DATA_USAHA_FORBIDDEN" ? 403 : 400;
        return duResult.error;
      }
      const session = await openSessionOrError(duResult.dataUsahaId);
      if (isSessionError(session)) {
        set.status = 400;
        return session.error;
      }
      try {
        const records = await fetchAccurateList<AccurateGlAccountRecord>(session, "glaccount/list.do", query.q, "id,no,name");
        return { accounts: records.map((r) => ({ no: r.no ?? "", name: r.name ?? "" })) };
      } catch (err) {
        logger.error({ err, dataUsahaId: duResult.dataUsahaId }, "Gagal cari Akun (glaccount) di Accurate");
        set.status = err instanceof AccurateApiError ? 502 : 500;
        return { code: "ACCURATE_SEARCH_FAILED" };
      }
    },
    { auth: true, query: t.Object({ q: t.String({ minLength: 1, maxLength: 100 }) }) },
  );
