import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  exchangeCodeForToken,
  refreshAccessToken,
  listDatabases,
  openDatabase,
  parseAccurateSaveEnvelope,
  AccurateApiError,
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
