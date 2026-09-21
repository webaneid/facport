import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  exchangeCodeForToken,
  refreshAccessToken,
  listDatabases,
  openDatabase,
  parseAccurateSaveEnvelope,
  AccurateApiError,
  AccurateScopeError,
  AccurateTokenError,
  isAccurateRecordNotFound,
  getApprovedScopes,
  isAccurateAuthFailure,
  parseAccurateEnvelope,
  parseGrantedScopes,
  parseInsufficientScope,
} from "./accurate";

// § Known Limitations phase-01 — TIDAK bisa full end-to-end tanpa akun
// Accurate nyata (ACCURATE_CLIENT_ID/SECRET kosong di .env dev). Ini unit
// test pakai mock fetch, verifikasi request shape (endpoint, header, body)
// sesuai format yang sudah diverifikasi § architecture-accurate-integration.md § 1
// — BUKAN verifikasi response Accurate beneran.

const originalFetch = globalThis.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

// `env` di lib/env.ts adalah referensi LANGSUNG ke `process.env` (bukan
// snapshot) — aman diisi di sini walau kosong di .env dev asli (belum ada
// kredensial Accurate nyata), TIDAK memengaruhi proses lain.
beforeEach(() => {
  lastRequest = null;
  process.env.ACCURATE_CLIENT_ID = "test-client-id";
  process.env.ACCURATE_CLIENT_SECRET = "test-client-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ACCURATE_CLIENT_ID;
  delete process.env.ACCURATE_CLIENT_SECRET;
});

function mockFetchOk(body: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastRequest = { url, init };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("exchangeCodeForToken", () => {
  test("POST ke /oauth/token dengan grant_type=authorization_code, Basic Auth header", async () => {
    mockFetchOk({
      access_token: "at-123",
      refresh_token: "rt-456",
      expires_in: 1295999,
      token_type: "bearer",
    });

    const token = await exchangeCodeForToken("test-code");

    expect(token.access_token).toBe("at-123");
    expect(token.refresh_token).toBe("rt-456");
    expect(lastRequest?.url).toBe("https://account.accurate.id/oauth/token");
    expect(lastRequest?.init.method).toBe("POST");
    const headers = lastRequest?.init.headers as Record<string, string>;
    expect(headers.Authorization).toStartWith("Basic ");
    const body = (lastRequest?.init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=test-code");
  });
});

describe("refreshAccessToken", () => {
  test("POST ke /oauth/token dengan grant_type=refresh_token", async () => {
    mockFetchOk({ access_token: "at-new", refresh_token: "rt-new", expires_in: 1295999, token_type: "bearer" });

    const token = await refreshAccessToken("old-refresh-token");

    expect(token.access_token).toBe("at-new");
    const body = (lastRequest?.init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh-token");
  });
});

// § architecture-accurate-integration.md § "Sesi Data Usaha" — db-list.do
// ikut pola envelope generik {s, d: T}.
describe("listDatabases", () => {
  test("GET db-list.do, payload dari body.d", async () => {
    mockFetchOk({ s: true, d: [{ id: 1156, alias: "PT Demo", trial: true, expired: false }] });

    const dbs = await listDatabases("at-123");

    expect(dbs).toEqual([{ id: 1156, alias: "PT Demo", trial: true, expired: false }]);
    expect(lastRequest?.url).toContain("/api/db-list.do");
  });

  test("s:false → throw dengan pesan dari body.d", async () => {
    mockFetchOk({ s: false, d: ["Token tidak valid"] });
    await expect(listDatabases("bad-token")).rejects.toThrow("Token tidak valid");
  });
});

// § lessons-learned.md 2026-08-19 — open-db.do TIDAK ikut pola {s, d: T}:
// session/host adalah SIBLING dari d (yang isinya pesan status, bukan
// payload), ditemukan lewat test call NYATA. Regression test supaya tidak
// balik lagi ke parseAccurateEnvelope generik untuk endpoint ini.
describe("openDatabase", () => {
  test("session/host dibaca dari TOP-LEVEL body, bukan dari body.d", async () => {
    mockFetchOk({
      s: true,
      d: ["Proses Berhasil Dilakukan"],
      session: "sess-abc",
      host: "https://zeus.accurate.id",
      dataVersion: 20260611103014,
      licenseEnd: "23/08/2026",
    });

    const result = await openDatabase("at-123", 2780906);

    expect(result.session).toBe("sess-abc");
    expect(result.host).toBe("https://zeus.accurate.id");
    expect(lastRequest?.url).toContain("/api/open-db.do?id=2780906");
  });

  test("s:false → throw AccurateApiError", async () => {
    mockFetchOk({ s: false, d: ["Data usaha tidak ditemukan"] });
    await expect(openDatabase("at-123", 999)).rejects.toThrow(AccurateApiError);
  });
});

// § lessons-learned.md 2026-08-19 — save.do (endpoint mutasi) taruh record
// hasil di `r`, BUKAN `d` (`d` cuma pesan status) — beda dari pola
// list/query endpoint. Ditemukan lewat test call NYATA ke
// purchase-invoice/save.do. Regression test supaya tidak balik ke
// parseAccurateEnvelope biasa untuk endpoint save/mutasi.
describe("parseAccurateSaveEnvelope", () => {
  test("record hasil dibaca dari body.r, BUKAN body.d (yang isinya pesan status)", async () => {
    mockFetchOk({
      s: true,
      d: ['Faktur Pembelian "PI.2026.08.00003" berhasil disimpan'],
      r: { id: 102300, number: "PI.2026.08.00003" },
    });

    const res = await fetch("http://dummy");
    const result = await parseAccurateSaveEnvelope<{ id: number; number: string }>(res);

    expect(result.id).toBe(102300);
    expect(result.number).toBe("PI.2026.08.00003");
  });

  test("s:false → throw dengan pesan dari body.d", async () => {
    mockFetchOk({ s: false, d: ["Pemasok X tidak ditemukan"] });

    const res = await fetch("http://dummy");
    await expect(parseAccurateSaveEnvelope(res)).rejects.toThrow("Pemasok X tidak ditemukan");
  });
});

// § Fase 82 (2026-09-10) — TERKONFIRMASI test call nyata: `detail.do`
// pada transaksi yang sudah dihapus LANGSUNG di Accurate balas HTTP 200
// (bukan 404) dengan `{"s":false,"d":["Faktur Penjualan tidak tepat"]}`.
// Dipakai `appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice`
// (workers/index.ts) untuk bedain "faktur sudah dihapus" (fallback CREATE)
// dari error lain (tetap gagal seperti biasa).
describe("isAccurateRecordNotFound", () => {
  test("true untuk AccurateApiError dengan pesan mengandung 'tidak tepat' (Sales Invoice)", () => {
    expect(isAccurateRecordNotFound(new AccurateApiError("Faktur Penjualan tidak tepat", 200))).toBe(true);
  });

  test("true untuk pesan 'tidak tepat' modul Purchase Invoice juga (deteksi generik, bukan spesifik 1 modul)", () => {
    expect(isAccurateRecordNotFound(new AccurateApiError("Faktur Pembelian tidak tepat", 200))).toBe(true);
  });

  test("false untuk AccurateApiError dengan pesan LAIN (error asli, bukan 'sudah dihapus')", () => {
    expect(isAccurateRecordNotFound(new AccurateApiError("Pemasok X tidak ditemukan", 400))).toBe(false);
  });

  test("false untuk error yang BUKAN AccurateApiError (mis. error jaringan biasa)", () => {
    expect(isAccurateRecordNotFound(new Error("tidak tepat"))).toBe(false);
    expect(isAccurateRecordNotFound("tidak tepat")).toBe(false);
  });
});

// § Fase 142 / Fase 141 E6 — galat scope OAuth: 403 body XML (bukan envelope {s,d}).
describe("galat scope Accurate (403 insufficient_scope)", () => {
  const xml =
    "<InsufficientScopeException><error>insufficient_scope</error><error_description>Insufficient scope for this resource</error_description><scope>sales_invoice_view</scope></InsufficientScopeException>";

  test("parseInsufficientScope membaca nama scope dari XML 403", () => {
    expect(parseInsufficientScope(403, xml)).toEqual({ scope: "sales_invoice_view" });
  });

  test("bukan galat scope kalau status bukan 403 atau body tanpa insufficient_scope", () => {
    expect(parseInsufficientScope(500, xml)).toBeUndefined();
    expect(parseInsufficientScope(403, '{"s":false,"d":["x"]}')).toBeUndefined();
  });

  test("parseAccurateEnvelope melempar AccurateScopeError (bukan galat 'non-JSON') untuk 403 XML", async () => {
    const res = new Response(xml, { status: 403 });
    const err = await parseAccurateEnvelope(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccurateScopeError);
    expect((err as AccurateScopeError).missingScope).toBe("sales_invoice_view");
    expect((err as AccurateScopeError).httpStatus).toBe(403);
    expect((err as AccurateScopeError).message).toContain("sales_invoice_view");
  });

  test("parseAccurateSaveEnvelope juga mengenali galat scope", async () => {
    const err = await parseAccurateSaveEnvelope(new Response(xml, { status: 403 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccurateScopeError);
  });

  test("envelope JSON biasa tetap berfungsi (regresi: body dibaca sebagai teks lalu di-parse)", async () => {
    expect(await parseAccurateEnvelope<string[]>(new Response('{"s":true,"d":["a"]}'))).toEqual(["a"]);
    await expect(parseAccurateEnvelope(new Response('{"s":false,"d":["gagal"]}'))).rejects.toThrow("gagal");
  });
});

describe("parseGrantedScopes", () => {
  test("memecah string scope respons token, unik & terurut", () => {
    expect(parseGrantedScopes("item_view  vendor_view item_view")).toEqual(["item_view", "vendor_view"]);
  });

  test("null (bukan []) kalau respons token tidak memuat scope", () => {
    expect(parseGrantedScopes(undefined)).toBeNull();
    expect(parseGrantedScopes("  ")).toBeNull();
  });
});

describe("getApprovedScopes", () => {
  test("GET approved-scope.do dengan Bearer + batas waktu (dipakai di jalur request)", async () => {
    mockFetchOk({ s: true, d: ["item_view", "vendor_view"] });
    expect(await getApprovedScopes("at-1")).toEqual(["item_view", "vendor_view"]);
    expect(lastRequest!.url).toContain("/api/approved-scope.do");
    expect((lastRequest!.init.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
    expect(lastRequest!.init.signal).toBeDefined();
  });
});

// § Fase 143 — galat endpoint token BERTIPE; pesan tidak boleh memuat body mentah (Accurate menaruh nilai token
// yang ditolak di error_description → sebelumnya bocor ke log Pino & Sentry).
describe("AccurateTokenError (exchange & refresh)", () => {
  const leaky = JSON.stringify({ error: "invalid_grant", error_description: "Invalid refresh token: 97d41938-390f-42a9-9860-c2cbb039e4e4" });

  test("refresh ditolak → AccurateTokenError{invalid_grant}, pesan TANPA nilai token", async () => {
    globalThis.fetch = (async () => new Response(leaky, { status: 400 })) as unknown as typeof fetch;
    const err = await refreshAccessToken("old-refresh").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccurateTokenError);
    expect(err).toMatchObject({ operation: "refresh", httpStatus: 400, code: "invalid_grant", isInvalidGrant: true });
    expect((err as Error).message).toBe("Accurate token refresh gagal: HTTP 400 (invalid_grant)");
    expect((err as Error).message).not.toContain("97d41938");
  });

  test("exchange ditolak → AccurateTokenError operation=exchange", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 })) as unknown as typeof fetch;
    const err = await exchangeCodeForToken("bad-code").catch((e: unknown) => e);
    expect(err).toMatchObject({ operation: "exchange", httpStatus: 400, code: "invalid_request", isInvalidGrant: false });
  });

  test("body non-JSON / 5xx → code null, bukan invalid_grant", async () => {
    globalThis.fetch = (async () => new Response("<html>Bad Gateway</html>", { status: 502 })) as unknown as typeof fetch;
    const err = await refreshAccessToken("rt").catch((e: unknown) => e);
    expect(err).toMatchObject({ httpStatus: 502, code: null, isInvalidGrant: false });
    expect((err as Error).message).toBe("Accurate token refresh gagal: HTTP 502");
  });

  test("nilai `error` yang aneh (bukan huruf kecil/underscore) tidak disalin ke kode/pesan", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Invalid token: SECRET-VALUE-123" }), { status: 400 })) as unknown as typeof fetch;
    const err = await refreshAccessToken("rt").catch((e: unknown) => e);
    expect((err as AccurateTokenError).code).toBeNull();
    expect((err as Error).message).not.toContain("SECRET");
  });
});

// § security review Fase 143 (Medium) — HANYA 401 = token mati; galat lain jangan memutus koneksi.
describe("isAccurateAuthFailure", () => {
  test("true hanya untuk AccurateApiError HTTP 401", () => {
    expect(isAccurateAuthFailure(new AccurateApiError("x", 401))).toBe(true);
    expect(isAccurateAuthFailure(new AccurateApiError("Masa ujicoba database sudah berakhir", 500))).toBe(false);
    expect(isAccurateAuthFailure(new AccurateApiError("x", 503))).toBe(false);
    expect(isAccurateAuthFailure(new AccurateScopeError("sales_invoice_view"))).toBe(false); // 403 = kurang izin, bukan token mati
    expect(isAccurateAuthFailure(new TypeError("fetch failed"))).toBe(false);
    expect(isAccurateAuthFailure(new DOMException("timeout", "TimeoutError"))).toBe(false);
  });

  test("openDatabase dengan 401 → AccurateApiError 401 (jadi terdeteksi sebagai token mati)", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_token", error_description: "Invalid access token: SECRET" }), { status: 401 })) as unknown as typeof fetch;
    const err = await openDatabase("dead", 1).catch((e: unknown) => e);
    expect(isAccurateAuthFailure(err)).toBe(true);
    expect((err as Error).message).not.toContain("SECRET");
  });

  test("openDatabase & listDatabases memasang batas waktu (signal)", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      signals.push(init.signal ?? undefined);
      return new Response(JSON.stringify({ s: true, d: [], session: "s", host: "https://h", dataVersion: 1, licenseEnd: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    await listDatabases("t");
    await openDatabase("t", 1);
    expect(signals.every((s) => s !== undefined)).toBe(true);
  });
});
